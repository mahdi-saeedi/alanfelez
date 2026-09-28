package ir.alanfelez.keycloak.otp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

class OtpCodesTest {

    @Test
    void generatesNumericCodesOfRequestedLength() {
        for (int i = 0; i < 200; i++) {
            String code = OtpCodes.generate(6);
            assertEquals(6, code.length());
            assertTrue(code.chars().allMatch(Character::isDigit));
        }
    }

    @Test
    void matchesOnlyTheRightCode() {
        String salt = OtpCodes.newSalt();
        String hash = OtpCodes.hash("123456", salt);
        assertTrue(OtpCodes.matches("123456", salt, hash));
        assertTrue(OtpCodes.matches(" ۱۲۳۴۵۶ ", salt, hash), "Persian digits and spaces are accepted");
        assertFalse(OtpCodes.matches("123457", salt, hash));
        assertFalse(OtpCodes.matches("123456", OtpCodes.newSalt(), hash), "salt is part of the hash");
        assertFalse(OtpCodes.matches(null, salt, hash));
    }

    @Test
    void settingsFallBackToDefaultsOnInvalidValues() {
        assertEquals(6, OtpSettings.intOr("abc", 6, 4, 10));
        assertEquals(6, OtpSettings.intOr("99", 6, 4, 10));
        assertEquals(8, OtpSettings.intOr(" 8 ", 6, 4, 10));
        assertEquals("کد ورود الان‌فلز: 4321", OtpSettings.DEFAULTS.message("4321"));
    }
}
