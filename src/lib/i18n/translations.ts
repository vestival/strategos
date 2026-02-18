import en from "../../../locales/en.json";
import es from "../../../locales/es.json";

export type Locale = "en" | "es";

export const messages = {
  en,
  es
} as const;
