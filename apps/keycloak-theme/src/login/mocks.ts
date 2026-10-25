import { createGetKcContextMock } from "keycloakify/login/KcContext";
import type { KcContextExtension, KcContextExtensionPerPage } from "./KcContext";
import { themeNames, kcEnvDefaults } from "../kc.gen";

/** Dev-only mocks: `pnpm dev`, then /?page=login-phone-otp.ftl&lang=en */
export const { getKcContextMock } = createGetKcContextMock({
  kcContextExtension: { themeName: themeNames[0]!, properties: { ...kcEnvDefaults } } satisfies KcContextExtension,
  kcContextExtensionPerPage: {
    "login-phone.ftl": {},
    "login-phone-otp.ftl": { phoneMasked: "+98912***4567", phoneNational: "09121234567", codeLength: 6, resendIn: 42 },
    "login-complete-signup.ftl": {
      phoneNational: "09121234567",
      needPassword: true,
      values: { fullName: "", activity: "", metals: [], province: "", city: "", address: "" },
      fieldErrors: {},
      activities: ["trader", "producer", "industrial-consumer", "distributor", "recycler", "investor", "other"],
      metalOptions: ["aluminum", "copper", "brass", "zinc", "lead", "iron", "cast-iron"],
      provinces: ["alborz", "ardabil", "azerbaijan-east", "azerbaijan-west", "bushehr", "chaharmahal-bakhtiari", "fars", "gilan", "golestan", "hamadan", "hormozgan", "ilam", "isfahan", "kerman", "kermanshah", "khorasan-north", "khorasan-razavi", "khorasan-south", "khuzestan", "kohgiluyeh-boyerahmad", "kurdistan", "lorestan", "markazi", "mazandaran", "qazvin", "qom", "semnan", "sistan-baluchestan", "tehran", "yazd", "zanjan"],
      termsUrl: "https://alanfelez.ir/terms",
      privacyUrl: "https://alanfelez.ir/privacy",
    },
  } satisfies KcContextExtensionPerPage,
  overrides: {
    locale: {
      currentLanguageTag: "fa",
      supported: [
        { languageTag: "fa", label: "فارسی", url: "?lang=fa" },
        { languageTag: "en", label: "English", url: "?lang=en" },
      ],
    },
  },
});

export function getDevKcContext() {
  const params = new URLSearchParams(location.search);
  const pageId = (params.get("page") ?? "login-phone.ftl") as Parameters<typeof getKcContextMock>[0]["pageId"];
  const lang = params.get("lang") ?? "fa";
  return getKcContextMock({ pageId, overrides: { locale: { currentLanguageTag: lang } } });
}
