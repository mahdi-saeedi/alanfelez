// Shared by the header (server) and RenewBanner (client); a plain module, since constants exported from a
// "use client" file reach server components only as client references.

/** Cookie that hides the renewal reminder; a session cookie, and the header's login and logout delete it. */
export const RENEW_HIDE_COOKIE = "af_renew_hide";
