/**
 * What a user typed in the password form's username field → the username Keycloak looks up. Customers' usernames are
 * their mobile numbers as 09xxxxxxxxx (PhoneNumbers.toUsername in the extension), so a number typed with Persian or
 * Arabic digits, spaces, dashes or +98 / 0098 becomes that form. Anything else (staff usernames) is only trimmed.
 */
export function usernameFromInput(raw: string): string {
  const latin = raw.trim().replace(/[\u06F0-\u06F9\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) & 0xf));
  const compact = latin.replace(/[\s\-()]/g, "");
  const m = /^(?:\+98|0098|98|0)?(9\d{9})$/.exec(compact);
  return m ? "0" + m[1] : latin;
}
