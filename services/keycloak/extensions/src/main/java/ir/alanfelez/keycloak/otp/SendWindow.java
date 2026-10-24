package ir.alanfelez.keycloak.otp;

import java.util.Map;

/**
 * The per-phone send counter: a one-hour window that starts with the first code. Kept in the single-use object store
 * as {@code count} and {@code start} (epoch seconds).
 */
record SendWindow(long start, int count) {

    static final int WINDOW_SECONDS = 3600;

    /**
     * The window after one more send, or {@code null} when the phone already used its sends. An entry without a start
     * (written by older versions, which lost the expiry) or older than an hour starts a new window.
     */
    static SendWindow next(Map<String, String> entry, long now, int maxSends) {
        long start = entry == null ? -1 : parseLong(entry.get("start"));
        if (start <= 0 || now - start >= WINDOW_SECONDS) {
            return new SendWindow(now, 1);
        }
        int count = (int) Math.max(0, parseLong(entry.get("count")));
        return count >= maxSends ? null : new SendWindow(start, count + 1);
    }

    /** Seconds until the window ends: the store entry's lifespan. */
    int secondsLeft(long now) {
        return (int) Math.max(1, start + WINDOW_SECONDS - now);
    }

    Map<String, String> toNotes() {
        return Map.of("count", Integer.toString(count), "start", Long.toString(start));
    }

    private static long parseLong(String v) {
        try {
            return v == null ? -1 : Long.parseLong(v.strip());
        } catch (NumberFormatException e) {
            return -1;
        }
    }
}
