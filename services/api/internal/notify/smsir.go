package notify

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"
)

// SmsIr sends through sms.ir "verify" (ارسال سریع): every message is an approved template on the sms.ir panel whose
// parameters (#NAME#) are filled in here. Templates maps our template names (Message.Template) to sms.ir template
// ids; a message without a configured template isn't sent (error). POST {BaseURL}/send/verify, header x-api-key,
// body {"mobile":"0912…","templateId":123,"parameters":[{"name":"PLAN","value":"طلایی"}]}; success is HTTP 200 with
// "status":1 (same API as the Keycloak OTP sender).
type SmsIr struct {
	HTTP      *http.Client
	BaseURL   string // default https://api.sms.ir/v1
	APIKey    string
	Templates map[string]int64
}

// Name implements SMS.
func (SmsIr) Name() string { return "smsir" }

// ParseTemplates reads "name=id,name=id" (the SMSIR_TEMPLATES setting).
func ParseTemplates(s string) (map[string]int64, error) {
	out := map[string]int64{}
	for _, part := range strings.Split(s, ",") {
		part = strings.TrimSpace(part)
		if part == "" {
			continue
		}
		name, id, ok := strings.Cut(part, "=")
		n, err := strconv.ParseInt(strings.TrimSpace(id), 10, 64)
		if !ok || err != nil || n <= 0 || strings.TrimSpace(name) == "" {
			return nil, fmt.Errorf("SMSIR_TEMPLATES: %q is not name=id", part)
		}
		out[strings.TrimSpace(name)] = n
	}
	return out, nil
}

var iranMobile = regexp.MustCompile(`^\+989\d{9}$`)

// Send implements SMS.
func (s SmsIr) Send(ctx context.Context, to string, m Message) (int, error) {
	id, ok := s.Templates[m.Template]
	switch {
	case s.APIKey == "":
		return 0, errors.New("sms.ir: no API key (SMSIR_API_KEY)")
	case !ok:
		return 0, fmt.Errorf("sms.ir: no template id for %q (SMSIR_TEMPLATES)", m.Template)
	case !iranMobile.MatchString(to):
		return 0, errors.New("sms.ir: only Iranian mobile numbers")
	}
	params := make([]map[string]string, 0, len(m.Params))
	for _, p := range m.Params {
		params = append(params, map[string]string{"name": p.Name, "value": p.Value})
	}
	body, err := json.Marshal(map[string]any{"mobile": "0" + to[3:], "templateId": id, "parameters": params})
	if err != nil {
		return 0, fmt.Errorf("sms.ir: %w", err)
	}
	base := s.BaseURL
	if base == "" {
		base = "https://api.sms.ir/v1"
	}
	ctx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, strings.TrimSuffix(base, "/")+"/send/verify", bytes.NewReader(body))
	if err != nil {
		return 0, fmt.Errorf("sms.ir: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json")
	req.Header.Set("x-api-key", s.APIKey)
	client := s.HTTP
	if client == nil {
		client = http.DefaultClient
	}
	res, err := client.Do(req)
	if err != nil {
		return 0, fmt.Errorf("sms.ir unreachable: %w", err)
	}
	defer func() { _ = res.Body.Close() }()
	raw, _ := io.ReadAll(io.LimitReader(res.Body, 4096))
	var reply struct {
		Status  int    `json:"status"`
		Message string `json:"message"`
		Data    struct {
			Cost float64 `json:"cost"`
		} `json:"data"`
	}
	_ = json.Unmarshal(raw, &reply)
	if res.StatusCode != http.StatusOK || reply.Status != 1 {
		// sms.ir's reason (bad key, template not approved, no credit…); never the key itself.
		return 0, fmt.Errorf("sms.ir refused the message: HTTP %d %s", res.StatusCode, abbreviate(string(raw)))
	}
	return int(reply.Data.Cost), nil
}

func abbreviate(s string) string {
	if r := []rune(s); len(r) > 300 {
		return string(r[:300]) + "…"
	}
	return s
}
