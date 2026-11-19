import { languages, languagesPlusAutoDetect } from "@sapo/client-core/constants/languages";

export { TERMS_OF_USE_URL, PRIVACY_POLICY_URL } from "@sapo/client-core/constants/legal";
export { DEFAULT_SUBSCRIPTION_PLAN_LIMITS } from "@sapo/backend/constants/subscriptions";

export const sourceLanguageOptions: readonly string[] = Object.values(languagesPlusAutoDetect);
export const targetLanguageOptions: readonly string[] = Object.values(languages);
export const respellLanguageOptions: readonly string[] = ["Source", ...targetLanguageOptions];
export const PREFERENCES_STORAGE_KEY = "sapo.web.preferences.v1";
