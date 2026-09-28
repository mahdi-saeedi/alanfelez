import type { ClassKey } from "keycloakify/login";

/**
 * Tailwind classes for Keycloak's built-in pages (password login, TOTP setup, update password, errors…),
 * so every page shares the brand. Our custom pages use the same classes via kcClsx.
 */
export const classes = {
  kcFormClass: "grid gap-4",
  kcFormGroupClass: "grid gap-1.5",
  kcLabelWrapperClass: "",
  kcLabelClass: "font-semibold text-text",
  kcInputWrapperClass: "",
  kcInputClass:
    "w-full rounded-control border border-border bg-white px-3.5 py-3 text-base text-text placeholder:text-text-3 focus:border-gold focus:outline-2 focus:outline-offset-1 focus:outline-gold",
  kcInputErrorMessageClass: "text-sm text-down",
  kcInputHelperTextBeforeClass: "text-sm text-text-3",
  kcInputHelperTextAfterClass: "text-sm text-text-3",
  kcFormGroupErrorClass: "",
  kcFormOptionsClass: "flex items-center justify-between text-sm",
  kcFormOptionsWrapperClass: "flex items-center justify-between text-sm",
  kcFormSettingClass: "flex items-center justify-between gap-4",
  kcCheckboxInputClass: "me-2 accent-gold",
  kcButtonClass: "cursor-pointer rounded-control px-4 py-3 font-bold transition disabled:cursor-not-allowed disabled:opacity-50",
  kcButtonPrimaryClass: "bg-gold text-graphite hover:bg-gold-light",
  kcButtonDefaultClass: "border border-border bg-white text-text hover:bg-surface-2",
  kcButtonSecondaryClass: "border border-border bg-white text-text hover:bg-surface-2",
  kcButtonBlockClass: "w-full",
  kcButtonLargeClass: "text-base",
  kcFormButtonsClass: "grid gap-3 pt-1",
  kcFormButtonsWrapperClass: "grid gap-3",
  kcSelectAuthListClass: "grid gap-3",
  kcSelectAuthListItemClass:
    "flex w-full items-center gap-3 rounded-control border border-border bg-white p-4 text-start hover:border-gold",
  kcSelectAuthListItemBodyClass: "grid gap-0.5",
  kcSelectAuthListItemHeadingClass: "font-bold text-text",
  kcSelectAuthListItemDescriptionClass: "text-sm text-text-2",
  kcAlertClass: "mb-4 flex items-start gap-2 rounded-control px-4 py-3 text-sm",
  kcAlertTitleClass: "",
  kcSrOnlyClass: "sr-only",
} satisfies Partial<Record<ClassKey, string>>;
