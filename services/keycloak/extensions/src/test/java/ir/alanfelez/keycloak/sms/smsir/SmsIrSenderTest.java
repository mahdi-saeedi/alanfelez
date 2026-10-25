package ir.alanfelez.keycloak.sms.smsir;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.sun.net.httpserver.HttpServer;
import ir.alanfelez.keycloak.sms.SmsException;
import java.net.InetSocketAddress;
import java.net.http.HttpClient;
import java.nio.charset.StandardCharsets;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.Test;

class SmsIrSenderTest {

    @Test
    void mobileIsLocalForm() throws SmsException {
        assertEquals("09121234567", SmsIrSender.localMobile("+989121234567"));
        assertThrows(SmsException.class, () -> SmsIrSender.localMobile("+12025550123"));
        assertThrows(SmsException.class, () -> SmsIrSender.localMobile("09121234567"));
    }

    @Test
    void verifyBody() throws SmsException {
        assertEquals("{\"mobile\":\"09121234567\",\"templateId\":123456,\"parameters\":[{\"name\":\"CODE\",\"value\":\"482913\"}]}",
                SmsIrSender.verifyBody("09121234567", 123456, "CODE", "482913"));
        assertThrows(SmsException.class, () -> SmsIrSender.verifyBody("09121234567", 1, "CODE", "12\"3"));
    }

    @Test
    void acceptedOnlyOnStatusOne() {
        assertTrue(SmsIrSender.accepted(200, "{\"status\":1,\"message\":\"موفق\",\"data\":{\"messageId\":1,\"cost\":1.0}}"));
        assertFalse(SmsIrSender.accepted(200, "{\"status\":10,\"message\":\"کلید وب سرویس نامعتبر است\"}"));
        assertFalse(SmsIrSender.accepted(401, "{\"status\":1}"));
        assertFalse(SmsIrSender.accepted(200, null));
    }

    @Test
    void refusesFreeTextAndMissingConfig() {
        SmsIrSender unconfigured = new SmsIrSender(null, "https://api.sms.ir/v1", "", 0, "CODE");
        assertThrows(SmsException.class, () -> unconfigured.send("+989121234567", "hi"));
        assertThrows(SmsException.class, () -> unconfigured.sendCode("+989121234567", "123456", "msg"));
    }

    @Test
    void postsVerifyRequest() throws Exception {
        AtomicReference<String> key = new AtomicReference<>();
        AtomicReference<String> body = new AtomicReference<>();
        AtomicReference<String> reply = new AtomicReference<>("{\"status\":1,\"message\":\"موفق\"}");
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/v1/send/verify", ex -> {
            key.set(ex.getRequestHeaders().getFirst("x-api-key"));
            body.set(new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8));
            byte[] out = reply.get().getBytes(StandardCharsets.UTF_8);
            ex.sendResponseHeaders(200, out.length);
            ex.getResponseBody().write(out);
            ex.close();
        });
        server.start();
        try {
            String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
            SmsIrSender sender = new SmsIrSender(HttpClient.newHttpClient(), base, "test-key", 987654, "CODE");
            sender.sendCode("+989121234567", "482913", "ignored");
            assertEquals("test-key", key.get());
            assertEquals("{\"mobile\":\"09121234567\",\"templateId\":987654,\"parameters\":[{\"name\":\"CODE\",\"value\":\"482913\"}]}", body.get());

            reply.set("{\"status\":10,\"message\":\"کلید نامعتبر\"}");
            assertThrows(SmsException.class, () -> sender.sendCode("+989121234567", "482913", "ignored"));
        } finally {
            server.stop(0);
        }
    }

    @Test
    void warmUpConnectsWithoutTheKeyAtMostOnceIn15s() throws Exception {
        AtomicInteger hits = new AtomicInteger();
        AtomicReference<String> key = new AtomicReference<>("unset");
        CountDownLatch first = new CountDownLatch(1);
        HttpServer server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
        server.createContext("/", ex -> {
            hits.incrementAndGet();
            key.set(ex.getRequestHeaders().getFirst("x-api-key"));
            ex.sendResponseHeaders(404, -1);
            ex.close();
            first.countDown();
        });
        server.start();
        try {
            SmsIrSender.resetWarmUp();
            String base = "http://127.0.0.1:" + server.getAddress().getPort() + "/v1";
            SmsIrSender sender = new SmsIrSender(HttpClient.newHttpClient(), base, "test-key", 987654, "CODE");
            sender.warmUp();
            sender.warmUp();
            assertTrue(first.await(5, TimeUnit.SECONDS));
            Thread.sleep(200);
            assertEquals(1, hits.get());
            assertEquals(null, key.get());
        } finally {
            server.stop(0);
        }
    }

    @Test
    void logHelpers() {
        assertEquals("88412", SmsIrSender.messageId("{\"status\":1,\"message\":\"موفق\",\"data\":{\"messageId\":88412,\"cost\":1.0}}"));
        assertEquals("?", SmsIrSender.messageId("{\"status\":1}"));
        assertEquals("?", SmsIrSender.messageId(null));
        assertEquals("0912***4567", SmsIrSender.maskMobile("+989121234567"));
        assertEquals("***", SmsIrSender.maskMobile(null));
    }
}
