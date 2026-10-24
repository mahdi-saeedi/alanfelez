package ir.alanfelez.keycloak.otp;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.Map;
import org.junit.jupiter.api.Test;

class SendWindowTest {

    private static final long T = 1_800_000_000L;

    @Test
    void firstSendOpensAnHourWindow() {
        SendWindow w = SendWindow.next(null, T, 5);
        assertEquals(new SendWindow(T, 1), w);
        assertEquals(3600, w.secondsLeft(T));
    }

    @Test
    void countsUpToTheLimitInsideTheWindow() {
        SendWindow w = SendWindow.next(null, T, 5);
        for (int i = 2; i <= 5; i++) {
            w = SendWindow.next(w.toNotes(), T + i * 60, 5);
            assertEquals(i, w.count());
            assertEquals(T, w.start()); // the window doesn't move: it ends an hour after the first code
        }
        assertNull(SendWindow.next(w.toNotes(), T + 600, 5));
        assertEquals(3000, w.secondsLeft(T + 600));
    }

    @Test
    void anHourAfterTheFirstCodeTheLimitResets() {
        Map<String, String> full = new SendWindow(T, 5).toNotes();
        assertNull(SendWindow.next(full, T + 3599, 5));
        assertEquals(new SendWindow(T + 3600, 1), SendWindow.next(full, T + 3600, 5));
    }

    @Test
    void entriesFromOlderVersionsWithoutAStartAreReset() {
        // Older versions stored only {count} and lost the expiry, so such a counter could block a phone forever.
        assertEquals(new SendWindow(T, 1), SendWindow.next(Map.of("count", "5"), T, 5));
    }
}
