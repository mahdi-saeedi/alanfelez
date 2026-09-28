package ir.alanfelez.keycloak.otp;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.HexFormat;

/** Generates one-time codes and compares them without storing the plain code. */
public final class OtpCodes {

    private static final SecureRandom RANDOM = new SecureRandom();

    private OtpCodes() {
    }

    /** A uniformly random numeric code of {@code length} digits (leading zeros allowed). */
    public static String generate(int length) {
        StringBuilder sb = new StringBuilder(length);
        for (int i = 0; i < length; i++) {
            sb.append(RANDOM.nextInt(10));
        }
        return sb.toString();
    }

    /** A random salt stored next to the hash. */
    public static String newSalt() {
        byte[] b = new byte[16];
        RANDOM.nextBytes(b);
        return Base64.getEncoder().encodeToString(b);
    }

    /** SHA-256(salt:code), hex encoded. The plain code never goes into the session. */
    public static String hash(String code, String salt) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest((salt + ":" + code).getBytes(StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 unavailable", e);
        }
    }

    /** Constant-time comparison of a user-entered code with the stored hash. */
    public static boolean matches(String entered, String salt, String expectedHash) {
        if (entered == null || salt == null || expectedHash == null) {
            return false;
        }
        String normalized = PhoneNumbers.normalizeDigits(entered.strip());
        byte[] a = hash(normalized, salt).getBytes(StandardCharsets.US_ASCII);
        byte[] b = expectedHash.getBytes(StandardCharsets.US_ASCII);
        return MessageDigest.isEqual(a, b);
    }
}
