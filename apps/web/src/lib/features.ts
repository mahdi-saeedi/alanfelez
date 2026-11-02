import "server-only";

/**
 * Parts of the site that one environment shows and another doesn't, set per environment in deploy/environments/*
 * (web.extraEnv). The calculator stays on staging while its formulas are being worked out and is hidden on the main
 * site (client, 2026-11-02): no menu link, no page, no mention in the plans or «چرا الان‌فلز؟».
 */
export const calculatorEnabled = () => process.env.FEATURE_CALCULATOR === "true";

/** Links and plan features to leave out where the calculator is off. */
export const hiddenNav = (): string[] => (calculatorEnabled() ? [] : ["calculator"]);
