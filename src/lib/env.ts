import { z } from "zod";

const optionalString = z.preprocess((value) => {
  if (typeof value === "string" && value.trim() === "") {
    return undefined;
  }
  return value;
}, z.string().optional());

const positiveIntWithDefault = (defaultValue: number) =>
  z.preprocess((value) => {
    if (value === undefined || value === null) {
      return undefined;
    }
    if (typeof value === "string" && value.trim() === "") {
      return undefined;
    }
    return Number(value);
  }, z.number().int().positive().default(defaultValue));

const envSchema = z.object({
  DATABASE_URL: z.string().min(1),
  NEXTAUTH_URL: z.string().url(),
  NEXTAUTH_SECRET: z.string().min(1),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  ALGORAND_INDEXER_URL: z.string().url(),
  ALGORAND_INDEXER_TOKEN: optionalString,
  ALGORAND_ALGOD_URL: z.string().url().default("https://mainnet-api.algonode.cloud"),
  ALGORAND_ALGOD_TOKEN: optionalString,
  ALGORAND_VERIFICATION_RECEIVER: z.string().min(1),
  PRICE_API_URL: z.string().url().default("https://api.coingecko.com/api/v3/simple/price"),
  DEFI_LLAMA_PRICE_API_URL: z.string().url().default("https://coins.llama.fi/prices/current"),
  ASA_PRICE_MAP_JSON: z.string().default("{}"),
  TINYMAN_APP_IDS: optionalString,
  FOLKS_APP_IDS: optionalString,
  RETI_APP_IDS: optionalString,
  PUBLIC_RATE_LIMIT_WINDOW_MS: positiveIntWithDefault(60_000),
  PUBLIC_RATE_LIMIT_MAX: positiveIntWithDefault(60),
  INDEXER_TX_LIMIT: positiveIntWithDefault(500),
  NEXT_PUBLIC_BASE_URL: z.string().url().default("https://strategos.vestival.es"),
  NEXT_PUBLIC_SUPPORT_EMAIL: z.string().email().default("support@strategos.vestival.es"),
  NEXTAUTH_DEBUG: z.preprocess((value) => {
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    return normalized === "1" || normalized === "true" || normalized === "yes";
  }, z.boolean().default(false))
});

export type AppEnv = z.infer<typeof envSchema>;

let cachedEnv: AppEnv | null = null;

export function getEnv(): AppEnv {
  if (cachedEnv) {
    return cachedEnv;
  }

  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    throw new Error(`Invalid environment variables: ${parsed.error.message}`);
  }

  cachedEnv = parsed.data;
  return cachedEnv;
}

export function parseAppIds(raw?: string): number[] {
  if (!raw) {
    return [];
  }

  return raw
    .split(",")
    .map((s) => Number(s.trim()))
    .filter((n) => Number.isInteger(n) && n > 0);
}
