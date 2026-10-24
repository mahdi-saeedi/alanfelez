package ir.alanfelez.keycloak.sms.smsir;

import ir.alanfelez.keycloak.sms.SmsException;
import ir.alanfelez.keycloak.sms.SmsSender;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpConnectTimeoutException;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.concurrent.atomic.AtomicLong;
import java.util.regex.Pattern;

/**
 * Sends one-time codes through sms.ir "verify" (ارسال سریع): an approved template on the sms.ir panel with one
 * parameter that receives the code. Verify messages go out on sms.ir's service line, fast and also to numbers that
 * blocked advertising. Only codes: free text ({@link #send}) is refused.
 *
 * <p>API: {@code POST {baseUrl}/send/verify}, header {@code x-api-key}, body
 * {@code {"mobile":"09121234567","templateId":123456,"parameters":[{"name":"CODE","value":"123456"}]}}; success is
 * HTTP 200 with {@code "status":1}.
 */
public class SmsIrSender implements SmsSender {

    private static final Duration TIMEOUT = Duration.ofSeconds(10);
    private static final Pattern STATUS_OK = Pattern.compile("\"status\"\\s*:\\s*1\\b");

    /** Warm-ups are skipped while a recent one keeps the connection open (the JDK client keeps idle ones ~30 s). */
    static final long WARM_EVERY_MS = 15_000;
    private static final AtomicLong lastWarm = new AtomicLong();

    private final HttpClient http;
    private final String baseUrl;
    private final String apiKey;
    private final long templateId;
    private final String parameter;

    public SmsIrSender(HttpClient http, String baseUrl, String apiKey, long templateId, String parameter) {
        this.http = http;
        this.baseUrl = baseUrl;
        this.apiKey = apiKey;
        this.templateId = templateId;
        this.parameter = parameter;
    }

    @Override
    public void send(String phoneE164, String message) throws SmsException {
        throw new SmsException("the sms.ir sender only sends verification codes (sendCode)");
    }

    @Override
    public void sendCode(String phoneE164, String code, String message) throws SmsException {
        if (apiKey == null || apiKey.isBlank() || templateId <= 0) {
            throw new SmsException("sms.ir is not configured: set the api-key and template-id options");
        }
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/send/verify"))
                .timeout(TIMEOUT)
                .header("Content-Type", "application/json")
                .header("Accept", "application/json")
                .header("x-api-key", apiKey)
                .POST(HttpRequest.BodyPublishers.ofString(verifyBody(localMobile(phoneE164), templateId, parameter, code)))
                .build();
        HttpResponse<String> res;
        try {
            res = sendOnce(req);
        } catch (HttpConnectTimeoutException e) {
            // No connection means nothing was sent, so one retry can't send the code twice. Servers in Iran lose
            // packets now and then; a second attempt usually connects at once.
            try {
                res = sendOnce(req);
            } catch (IOException e2) {
                throw new SmsException("sms.ir unreachable: " + e2.getMessage(), e2);
            } catch (InterruptedException e2) {
                Thread.currentThread().interrupt();
                throw new SmsException("interrupted while calling sms.ir", e2);
            }
        } catch (IOException e) {
            throw new SmsException("sms.ir unreachable: " + e.getMessage(), e);
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new SmsException("interrupted while calling sms.ir", e);
        }
        if (!accepted(res.statusCode(), res.body())) {
            // The body carries sms.ir's reason (bad key, template not approved, no credit…); never the key itself.
            throw new SmsException("sms.ir refused the message: HTTP " + res.statusCode() + " " + abbreviate(res.body()));
        }
    }

    /**
     * Opens the connection to sms.ir in the background (TLS handshake included) with a request that carries no key and
     * sends nothing; the reply is ignored. The shared HttpClient keeps the connection for the send that follows.
     * At most once per {@link #WARM_EVERY_MS} for all sessions.
     */
    @Override
    public void warmUp() {
        long now = System.currentTimeMillis();
        long last = lastWarm.get();
        if (http == null || now - last < WARM_EVERY_MS || !lastWarm.compareAndSet(last, now)) {
            return;
        }
        HttpRequest req = HttpRequest.newBuilder(URI.create(baseUrl + "/")).timeout(TIMEOUT).GET().build();
        http.sendAsync(req, HttpResponse.BodyHandlers.discarding());
    }

    /** Tests only: forget the last warm-up. */
    static void resetWarmUp() {
        lastWarm.set(0);
    }

    private HttpResponse<String> sendOnce(HttpRequest req) throws IOException, InterruptedException {
        return http.send(req, HttpResponse.BodyHandlers.ofString());
    }

    /** +989121234567 → 09121234567, the form sms.ir expects. */
    static String localMobile(String phoneE164) throws SmsException {
        if (phoneE164 == null || !phoneE164.matches("\\+989\\d{9}")) {
            throw new SmsException("sms.ir sends only to Iranian mobile numbers");
        }
        return "0" + phoneE164.substring(3);
    }

    /** The JSON body. Values are digits, a number and a parameter name checked at startup, so nothing needs escaping. */
    static String verifyBody(String mobile, long templateId, String parameter, String code) throws SmsException {
        if (!code.matches("\\d{4,10}")) {
            throw new SmsException("a verification code is digits only");
        }
        return "{\"mobile\":\"" + mobile + "\",\"templateId\":" + templateId
                + ",\"parameters\":[{\"name\":\"" + parameter + "\",\"value\":\"" + code + "\"}]}";
    }

    static boolean accepted(int httpStatus, String body) {
        return httpStatus == 200 && body != null && STATUS_OK.matcher(body).find();
    }

    private static String abbreviate(String s) {
        if (s == null) {
            return "";
        }
        return s.length() > 300 ? s.substring(0, 300) + "…" : s;
    }

    @Override
    public void close() {
        // the HttpClient is shared by the factory
    }
}
