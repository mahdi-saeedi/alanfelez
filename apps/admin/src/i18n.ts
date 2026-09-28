import type { I18nProvider } from "@refinedev/core";

type Lang = "fa" | "en";
const STORAGE_KEY = "alanfelez.admin.lang";

const messages: Record<Lang, Record<string, string>> = {
  fa: {
    "app.title": "پنل مدیریت الان‌فلز",
    "app.language": "English",
    "nav.dashboard": "داشبورد",
    "nav.metals": "فلزات",
    "nav.markets": "بازارها و منابع",
    "nav.plans": "اشتراک‌ها",
    "auth.logout": "خروج",
    "auth.signingIn": "در حال انتقال به صفحه ورود…",
    "auth.denied": "دسترسی ندارید. این پنل فقط برای کارکنان (نقش admin، editor یا support) است.",
    "dashboard.welcome": "خوش آمدید",
    "dashboard.roles": "نقش‌های شما",
    "dashboard.next": "امکانات ورود دستی قیمت، مدیریت محتوا و کاربران در مراحل بعدی اضافه می‌شوند.",
    "table.slug": "شناسه",
    "table.name": "نام",
    "table.scope": "دامنه",
    "table.rank": "رتبه",
    "table.prices": "قیمت‌ها (ریال)",
    "table.empty": "داده‌ای وجود ندارد.",
    "table.loading": "در حال بارگذاری…",
    "table.error": "خطا در دریافت اطلاعات.",
  },
  en: {
    "app.title": "Alan Felez admin",
    "app.language": "فارسی",
    "nav.dashboard": "Dashboard",
    "nav.metals": "Metals",
    "nav.markets": "Markets & sources",
    "nav.plans": "Plans",
    "auth.logout": "Log out",
    "auth.signingIn": "Redirecting to sign in…",
    "auth.denied": "Access denied. This panel is for staff only (admin, editor or support role).",
    "dashboard.welcome": "Welcome",
    "dashboard.roles": "Your roles",
    "dashboard.next": "Manual price entry, content and user management arrive in the next milestones.",
    "table.slug": "Slug",
    "table.name": "Name",
    "table.scope": "Scope",
    "table.rank": "Rank",
    "table.prices": "Prices (Rial)",
    "table.empty": "No data.",
    "table.loading": "Loading…",
    "table.error": "Could not load data.",
  },
};

let current: Lang = (localStorage.getItem(STORAGE_KEY) as Lang | null) ?? "fa";

export function applyDocumentLang() {
  document.documentElement.lang = current;
  document.documentElement.dir = current === "fa" ? "rtl" : "ltr";
}

export const i18nProvider: I18nProvider = {
  translate: (key: string) => messages[current][key] ?? key,
  getLocale: () => current,
  changeLocale: async (lang: string) => {
    current = lang === "en" ? "en" : "fa";
    localStorage.setItem(STORAGE_KEY, current);
    applyDocumentLang();
  },
};
