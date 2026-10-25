package ir.alanfelez.keycloak.otp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SignupFormTest {

    private static Map<String, List<String>> valid() {
        Map<String, List<String>> f = new HashMap<>();
        f.put("fullName", List.of("  شرکت فلز نمونه "));
        f.put("password", List.of("a-long-password"));
        f.put("passwordConfirm", List.of("a-long-password"));
        f.put("activity", List.of("trader"));
        f.put("metals", List.of("copper", "aluminum", "copper", "gold"));
        f.put("province", List.of("tehran"));
        f.put("terms", List.of("on"));
        return f;
    }

    @Test
    void validFormReadsAndTrims() {
        SignupForm s = SignupForm.from(valid());
        assertTrue(s.errors(true).isEmpty(), s.errors(true).toString());
        assertEquals("شرکت فلز نمونه", s.fullName());
        assertEquals(List.of("copper", "aluminum"), s.metals()); // duplicates and unknown metals dropped
        assertEquals("", s.city());
    }

    @Test
    void requiredFields() {
        Map<String, String> e = SignupForm.from(Map.of()).errors(true);
        assertEquals(List.of("fullName", "password", "activity", "terms"), List.copyOf(e.keySet()));
        assertEquals("signupTermsRequired", e.get("terms"));
    }

    @Test
    void passwordRepeatMustMatchButOnlyWhenNeeded() {
        Map<String, List<String>> f = valid();
        f.put("passwordConfirm", List.of("something-else"));
        assertEquals("signupPasswordMismatch", SignupForm.from(f).errors(true).get("passwordConfirm"));
        f.remove("password");
        assertTrue(SignupForm.from(f).errors(false).isEmpty()); // users who already have a password skip it
    }

    @Test
    void choicesAndLengthsAreChecked() {
        Map<String, List<String>> f = valid();
        f.put("activity", List.of("spy"));
        f.put("province", List.of("atlantis"));
        f.put("address", List.of("x".repeat(301)));
        Map<String, String> e = SignupForm.from(f).errors(true);
        assertEquals("signupActivityRequired", e.get("activity"));
        assertEquals("signupInvalidChoice", e.get("province"));
        assertEquals("signupTooLong", e.get("address"));
        assertFalse(e.containsKey("city"));
        assertEquals(31, SignupForm.PROVINCES.size());
    }
}
