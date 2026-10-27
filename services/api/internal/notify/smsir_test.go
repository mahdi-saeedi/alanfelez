package notify

import (
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestParseTemplates(t *testing.T) {
	got, err := ParseTemplates(" subscription_expiring=111, price_alert = 333 ,")
	if err != nil || got["subscription_expiring"] != 111 || got["price_alert"] != 333 || len(got) != 2 {
		t.Fatalf("got %v %v", got, err)
	}
	for _, bad := range []string{"x", "x=", "x=abc", "=5", "x=-1"} {
		if _, err := ParseTemplates(bad); err == nil {
			t.Errorf("%q must fail", bad)
		}
	}
}

func TestSmsIrSend(t *testing.T) {
	var got map[string]any
	var key string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		key = r.Header.Get("x-api-key")
		b, _ := io.ReadAll(r.Body)
		_ = json.Unmarshal(b, &got)
		if r.URL.Path != "/send/verify" {
			w.WriteHeader(404)
			return
		}
		_, _ = w.Write([]byte(`{"status":1,"message":"ok","data":{"messageId":42,"cost":1.5}}`))
	}))
	defer srv.Close()
	s := SmsIr{BaseURL: srv.URL, APIKey: "k", Templates: map[string]int64{"subscription_expiring": 111}}
	m := Message{Template: "subscription_expiring", Params: []Param{{"PLAN", "طلایی"}, {"DAYS", "۷"}}, Body: "…"}
	if _, err := s.Send(t.Context(), "+989121234567", m); err != nil {
		t.Fatal(err)
	}
	ps := got["parameters"].([]any)
	if key != "k" || got["mobile"] != "09121234567" || got["templateId"].(float64) != 111 || len(ps) != 2 ||
		ps[0].(map[string]any)["name"] != "PLAN" || ps[0].(map[string]any)["value"] != "طلایی" {
		t.Fatalf("request: key=%q %v", key, got)
	}
	if _, err := s.Send(t.Context(), "+989121234567", Message{Template: "unknown"}); err == nil || !strings.Contains(err.Error(), "no template id") {
		t.Fatalf("unknown template: %v", err)
	}
	if _, err := s.Send(t.Context(), "+441234567890", m); err == nil {
		t.Fatal("foreign numbers must be refused")
	}
	if _, err := (SmsIr{BaseURL: srv.URL, Templates: s.Templates}).Send(t.Context(), "+989121234567", m); err == nil {
		t.Fatal("no key must be refused")
	}
	refuse := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, _ *http.Request) {
		_, _ = w.Write([]byte(`{"status":0,"message":"template not approved"}`))
	}))
	defer refuse.Close()
	if _, err := (SmsIr{BaseURL: refuse.URL, APIKey: "k", Templates: s.Templates}).Send(t.Context(), "+989121234567", m); err == nil || !strings.Contains(err.Error(), "template not approved") {
		t.Fatalf("refusal: %v", err)
	}
}
