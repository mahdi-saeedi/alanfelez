package ir.alanfelez.keycloak.otp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.junit.jupiter.api.Test;

class PhoneNumbersTest {

    @ParameterizedTest
    @ValueSource(strings = {"09121234567", "9121234567", "989121234567", "+989121234567", "00989121234567",
            "۰۹۱۲۱۲۳۴۵۶۷", "٠٩١٢١٢٣٤٥٦٧", "0912 123 4567", "+98 912-123-4567"})
    void normalizesValidIranianMobiles(String input) {
        assertEquals("+989121234567", PhoneNumbers.normalize(input).orElseThrow());
    }

    @ParameterizedTest
    @ValueSource(strings = {"", "02112345678", "0912123456", "091212345678", "+14155550123", "abc", "0912x234567"})
    void rejectsInvalidNumbers(String input) {
        assertTrue(PhoneNumbers.normalize(input).isEmpty(), input);
    }

    @Test
    void usernameAndMask() {
        assertEquals("09121234567", PhoneNumbers.toUsername("+989121234567"));
        assertEquals("+98912***4567", PhoneNumbers.mask("+989121234567"));
    }
}
