import { getEnv } from "@/lib/env";

const env = getEnv();

const ALGO_CG_ID = "algorand";
const DEFAULT_CG_SIMPLE_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";
const DEFAULT_CG_API_BASE = "https://api.coingecko.com/api/v3";
const DEFAULT_CG_TOKEN_PRICE_URL = "https://api.coingecko.com/api/v3/simple/token_price/algorand";
const DEFAULT_LLAMA_PRICE_URL = "https://coins.llama.fi/prices/current";
const DEFAULT_DEXSCREENER_PRICE_URL = "https://api.dexscreener.com/latest/dex/search";
const DEFAULT_ASA_CG_MAP: Record<number, string> = {
  // Stablecoins
  31566704: "usd-coin", // USDC (Algorand)
  312769: "tether", // USDt (Algorand)
  // Wrapped majors
  386192725: "bitcoin", // goBTC
  386195940: "ethereum", // goETH
  // Liquid staking / staking derivatives
  793124631: "algorand", // gALGO
  694432641: "algorand", // gALGO3
  1134696561: "xalgo" // xALGO
};

type PriceMap = Record<string, { usd: number }>;
type SpotPriceCacheEntry = {
  usd: number;
  asOf: number;
};
export type SpotPriceSource = "configured" | "coingecko" | "defillama" | "dexscreener" | "cache" | "missing";
export type SpotPriceConfidence = "high" | "medium" | "low";
export type SpotPriceQuote = {
  usd: number | null;
  source: SpotPriceSource;
  confidence: SpotPriceConfidence;
  asOf: number | null;
};

function parseAsaMap(): Record<number, string> {
  const map: Record<number, string> = { ...DEFAULT_ASA_CG_MAP };
  try {
    const parsed = JSON.parse(env.ASA_PRICE_MAP_JSON) as Record<string, string>;
    for (const [assetId, id] of Object.entries(parsed)) {
      const n = Number(assetId);
      if (Number.isInteger(n) && id) {
        map[n] = id;
      }
    }
    return map;
  } catch {
    return map;
  }
}

const asaMap = parseAsaMap();

function getCoinGeckoIdForAssetKey(assetKey: string): string | null {
  if (assetKey === "ALGO") {
    return ALGO_CG_ID;
  }
  const asaId = Number(assetKey);
  return asaMap[asaId] ?? null;
}

function formatUtcDay(unixTs: number): string {
  const d = new Date(unixTs * 1000);
  const dd = String(d.getUTCDate()).padStart(2, "0");
  const mm = String(d.getUTCMonth() + 1).padStart(2, "0");
  const yyyy = d.getUTCFullYear();
  return `${dd}-${mm}-${yyyy}`;
}

function getCoinGeckoApiBase(): string | null {
  try {
    const configured = new URL(env.PRICE_API_URL);
    if (!configured.hostname.includes("coingecko")) {
      return null;
    }
    return `${configured.protocol}//${configured.host}/api/v3`;
  } catch {
    return null;
  }
}

const historicalCache = new Map<string, number | null>();
const spotCache = new Map<string, SpotPriceCacheEntry>();

async function fetchSpotPriceMap(endpoint: string, coinIds: string[]): Promise<PriceMap> {
  if (coinIds.length === 0) {
    return {};
  }

  try {
    const url = new URL(endpoint);
    url.searchParams.set("ids", coinIds.join(","));
    url.searchParams.set("vs_currencies", "usd");

    const response = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!response.ok) {
      return {};
    }

    const data = (await response.json()) as Record<string, { usd?: unknown }>;
    const out: PriceMap = {};
    for (const coinId of coinIds) {
      const usd = data[coinId]?.usd;
      if (typeof usd === "number" && Number.isFinite(usd) && usd >= 0) {
        out[coinId] = { usd };
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchCoinGeckoTokenPriceMap(endpoint: string, assetIds: number[]): Promise<Record<number, number>> {
  if (assetIds.length === 0) {
    return {};
  }

  try {
    const url = new URL(endpoint);
    url.searchParams.set("contract_addresses", assetIds.join(","));
    url.searchParams.set("vs_currencies", "usd");

    const response = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!response.ok) {
      return {};
    }

    const data = (await response.json()) as Record<string, { usd?: unknown }>;
    const out: Record<number, number> = {};

    for (const assetId of assetIds) {
      const key = String(assetId);
      const usd = data[key]?.usd;
      if (typeof usd === "number" && Number.isFinite(usd) && usd >= 0) {
        out[assetId] = usd;
      }
    }

    return out;
  } catch {
    return {};
  }
}

async function fetchDefiLlamaPriceMap(endpoint: string, coinIds: string[]): Promise<PriceMap> {
  if (coinIds.length === 0) {
    return {};
  }

  try {
    const normalizedBase = endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
    const coinsKey = coinIds.map((coinId) => `coingecko:${coinId}`).join(",");
    const url = `${normalizedBase}/${encodeURIComponent(coinsKey)}`;
    const response = await fetch(url, { next: { revalidate: 0 } });
    if (!response.ok) {
      return {};
    }
    const data = (await response.json()) as {
      coins?: Record<string, { price?: unknown }>;
    };
    const out: PriceMap = {};
    for (const coinId of coinIds) {
      const key = `coingecko:${coinId}`;
      const price = data.coins?.[key]?.price;
      if (typeof price === "number" && Number.isFinite(price) && price >= 0) {
        out[coinId] = { usd: price };
      }
    }
    return out;
  } catch {
    return {};
  }
}

async function fetchDexScreenerPriceUsd(assetId: number, endpoint: string): Promise<number | null> {
  if (!Number.isInteger(assetId) || assetId <= 0) {
    return null;
  }

  try {
    const url = new URL(endpoint);
    url.searchParams.set("q", String(assetId));
    const response = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as {
      pairs?: Array<{
        chainId?: string;
        priceUsd?: string | number | null;
        liquidity?: {
          usd?: number | null;
        } | null;
        baseToken?: {
          address?: string | null;
        } | null;
        quoteToken?: {
          symbol?: string | null;
        } | null;
      }>;
    };

    const target = String(assetId);
    const candidates = (data.pairs ?? [])
      .filter((pair) => (pair.chainId ?? "").toLowerCase() === "algorand")
      .map((pair) => {
        const price =
          typeof pair.priceUsd === "number"
            ? pair.priceUsd
            : typeof pair.priceUsd === "string"
              ? Number(pair.priceUsd)
              : Number.NaN;
        return {
          isTargetBase: String(pair.baseToken?.address ?? "") === target,
          isAlgoQuote: (pair.quoteToken?.symbol ?? "").toUpperCase() === "ALGO",
          liquidityUsd: pair.liquidity?.usd ?? 0,
          priceUsd: Number.isFinite(price) && price > 0 ? price : null
        };
      })
      .filter((pair) => pair.priceUsd !== null);

    const preferred = candidates
      .filter((pair) => pair.isTargetBase && pair.isAlgoQuote)
      .sort((a, b) => b.liquidityUsd - a.liquidityUsd);
    if (preferred[0]?.priceUsd !== null && preferred[0]?.priceUsd !== undefined) {
      return preferred[0].priceUsd;
    }

    const fallback = candidates
      .filter((pair) => pair.isTargetBase)
      .sort((a, b) => b.liquidityUsd - a.liquidityUsd);
    if (fallback[0]?.priceUsd !== null && fallback[0]?.priceUsd !== undefined) {
      return fallback[0].priceUsd;
    }

    return null;
  } catch {
    return null;
  }
}

function confidenceFromSource(source: SpotPriceSource): SpotPriceConfidence {
  if (source === "configured" || source === "coingecko") return "high";
  if (source === "defillama" || source === "dexscreener") return "medium";
  return "low";
}

function sourceFromCoinIdEndpoint(coinId: string, endpoint: string): SpotPriceSource {
  if (endpoint === env.PRICE_API_URL) return "configured";
  if (endpoint === DEFAULT_CG_SIMPLE_PRICE_URL) return "coingecko";
  if (endpoint === env.DEFI_LLAMA_PRICE_API_URL || endpoint === DEFAULT_LLAMA_PRICE_URL) return "defillama";
  const cache = spotCache.get(coinId);
  return cache ? "cache" : "missing";
}

export async function getSpotPriceQuotes(assetIds: Array<number | null>): Promise<Record<string, SpotPriceQuote>> {
  const unique = Array.from(new Set(assetIds.map((id) => (id === null ? "ALGO" : String(id)))));
  const uniqueAsaIds = unique
    .filter((key) => key !== "ALGO")
    .map((key) => Number(key))
    .filter((assetId) => Number.isInteger(assetId));

  const idsToQuery = new Set<string>();
  if (unique.includes("ALGO")) {
    idsToQuery.add(ALGO_CG_ID);
  }

  for (const key of unique) {
    if (key === "ALGO") continue;
    const asaId = Number(key);
    if (asaMap[asaId]) {
      idsToQuery.add(asaMap[asaId]);
    }
  }

  const requestedCoinIds = Array.from(idsToQuery);
  let prices: PriceMap = {};
  const dexPricesByAssetId = new Map<number, number>();
  const tokenPricesByAssetId = new Map<number, { usd: number; source: SpotPriceSource }>();
  const sourceByCoinId: Record<string, SpotPriceSource> = {};
  if (idsToQuery.size > 0) {
    const endpoints = Array.from(new Set([env.PRICE_API_URL, DEFAULT_CG_SIMPLE_PRICE_URL]));

    for (const endpoint of endpoints) {
      const fetched = await fetchSpotPriceMap(endpoint, requestedCoinIds);
      if (Object.keys(fetched).length > 0) {
        for (const coinId of Object.keys(fetched)) {
          sourceByCoinId[coinId] = sourceFromCoinIdEndpoint(coinId, endpoint);
        }
        prices = {
          ...prices,
          ...fetched
        };
      }
      const hasAllRequested = requestedCoinIds.every((coinId) => typeof prices[coinId]?.usd === "number");
      if (hasAllRequested) {
        break;
      }
    }

    const missingAfterCg = requestedCoinIds.filter((coinId) => typeof prices[coinId]?.usd !== "number");
    if (missingAfterCg.length > 0) {
      const llamaEndpoints = Array.from(new Set([env.DEFI_LLAMA_PRICE_API_URL, DEFAULT_LLAMA_PRICE_URL]));
      for (const endpoint of llamaEndpoints) {
        const fetched = await fetchDefiLlamaPriceMap(endpoint, missingAfterCg);
        if (Object.keys(fetched).length > 0) {
          for (const coinId of Object.keys(fetched)) {
            sourceByCoinId[coinId] = sourceFromCoinIdEndpoint(coinId, endpoint);
          }
          prices = {
            ...prices,
            ...fetched
          };
        }
        const hasAllMissing = missingAfterCg.every((coinId) => typeof prices[coinId]?.usd === "number");
        if (hasAllMissing) {
          break;
        }
      }
    }

    for (const [coinId, entry] of Object.entries(prices)) {
      if (typeof entry.usd === "number" && Number.isFinite(entry.usd)) {
        spotCache.set(coinId, {
          usd: entry.usd,
          asOf: Date.now()
        });
      }
    }
  }

  const missingAsaIds = uniqueAsaIds.filter((assetId) => {
    const cgId = asaMap[assetId];
    if (cgId && typeof prices[cgId]?.usd === "number") {
      return false;
    }
    if (tokenPricesByAssetId.has(assetId)) {
      return false;
    }
    return true;
  });

  if (missingAsaIds.length > 0) {
    const configuredTokenUrl = (() => {
      const configuredBase = getCoinGeckoApiBase();
      return configuredBase ? `${configuredBase}/simple/token_price/algorand` : null;
    })();
    const tokenEndpoints = Array.from(
      new Set([configuredTokenUrl, DEFAULT_CG_TOKEN_PRICE_URL].filter((value): value is string => Boolean(value)))
    );
    for (const endpoint of tokenEndpoints) {
      const fetched = await fetchCoinGeckoTokenPriceMap(endpoint, missingAsaIds);
      if (Object.keys(fetched).length === 0) {
        continue;
      }

      const source: SpotPriceSource = endpoint === configuredTokenUrl ? "configured" : "coingecko";
      for (const [assetIdKey, usd] of Object.entries(fetched)) {
        const assetId = Number(assetIdKey);
        if (!Number.isInteger(assetId)) continue;
        tokenPricesByAssetId.set(assetId, { usd, source });
        spotCache.set(`token:${assetId}`, {
          usd,
          asOf: Date.now()
        });
      }

      const fullyResolved = missingAsaIds.every((assetId) => tokenPricesByAssetId.has(assetId));
      if (fullyResolved) {
        break;
      }
    }
  }

  const dexEndpoint = env.DEXSCREENER_PRICE_API_URL ?? DEFAULT_DEXSCREENER_PRICE_URL;
  const stillMissingForDex = missingAsaIds.filter((assetId) => !tokenPricesByAssetId.has(assetId));
  if (stillMissingForDex.length > 0) {
    await Promise.all(
      stillMissingForDex.map(async (assetId) => {
        const price = await fetchDexScreenerPriceUsd(assetId, dexEndpoint);
        if (price !== null) {
          dexPricesByAssetId.set(assetId, price);
          spotCache.set(`dex:${assetId}`, {
            usd: price,
            asOf: Date.now()
          });
        }
      })
    );
  }

  const out: Record<string, SpotPriceQuote> = {};

  for (const key of unique) {
    if (key === "ALGO") {
      const direct = prices[ALGO_CG_ID]?.usd;
      const cache = spotCache.get(ALGO_CG_ID);
      const source = direct !== undefined ? (sourceByCoinId[ALGO_CG_ID] ?? "missing") : cache ? "cache" : "missing";
      const usd = direct ?? cache?.usd ?? null;
      out[key] = {
        usd,
        source,
        confidence: confidenceFromSource(source),
        asOf: direct !== undefined ? Date.now() : cache?.asOf ?? null
      };
      continue;
    }

    const asaId = Number(key);
    const cgId = asaMap[asaId];
    const tokenDirect = tokenPricesByAssetId.get(asaId);
    const tokenCache = spotCache.get(`token:${asaId}`);
    const directDex = dexPricesByAssetId.get(asaId);
    const dexCache = spotCache.get(`dex:${asaId}`);
    if (!cgId) {
      const usd = tokenDirect?.usd ?? directDex ?? tokenCache?.usd ?? dexCache?.usd ?? null;
      const source: SpotPriceSource =
        tokenDirect?.source ?? (directDex !== undefined ? "dexscreener" : tokenCache || dexCache ? "cache" : "missing");
      out[key] = {
        usd,
        source,
        confidence: confidenceFromSource(source),
        asOf: tokenDirect ? Date.now() : directDex !== undefined ? Date.now() : tokenCache?.asOf ?? dexCache?.asOf ?? null
      };
      continue;
    }
    const direct = prices[cgId]?.usd;
    const cache = spotCache.get(cgId);
    const source =
      direct !== undefined
        ? (sourceByCoinId[cgId] ?? "missing")
        : tokenDirect
          ? tokenDirect.source
        : directDex !== undefined
          ? "dexscreener"
          : cache || tokenCache || dexCache
            ? "cache"
            : "missing";
    out[key] = {
      usd: direct ?? tokenDirect?.usd ?? directDex ?? cache?.usd ?? tokenCache?.usd ?? dexCache?.usd ?? null,
      source,
      confidence: confidenceFromSource(source),
      asOf:
        direct !== undefined || tokenDirect || directDex !== undefined
          ? Date.now()
          : cache?.asOf ?? tokenCache?.asOf ?? dexCache?.asOf ?? null
    };
  }

  return out;
}

export async function getSpotPricesUsd(assetIds: Array<number | null>): Promise<Record<string, number | null>> {
  const quotes = await getSpotPriceQuotes(assetIds);
  return Object.fromEntries(Object.entries(quotes).map(([assetKey, quote]) => [assetKey, quote.usd]));
}

export async function getHistoricalPricesUsdByDay(
  assetKeys: string[],
  unixTimestamps: number[]
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  const base = getCoinGeckoApiBase() ?? DEFAULT_CG_API_BASE;

  const days = Array.from(new Set(unixTimestamps.filter((ts) => Number.isFinite(ts) && ts > 0).map((ts) => formatUtcDay(ts))));
  if (days.length === 0) {
    return out;
  }

  const uniqueAssetKeys = Array.from(new Set(assetKeys));
  const coinIdToAssetKeys = new Map<string, string[]>();
  for (const assetKey of uniqueAssetKeys) {
    const coinId = getCoinGeckoIdForAssetKey(assetKey);
    if (!coinId) continue;
    const list = coinIdToAssetKeys.get(coinId) ?? [];
    list.push(assetKey);
    coinIdToAssetKeys.set(coinId, list);
  }

  const sortedTimestamps = Array.from(new Set(unixTimestamps.filter((ts) => Number.isFinite(ts) && ts > 0))).sort((a, b) => a - b);
  const fromUnix = sortedTimestamps[0];
  const toUnix = sortedTimestamps[sortedTimestamps.length - 1];

  for (const [coinId, mappedAssetKeys] of coinIdToAssetKeys.entries()) {
    const unresolvedDays = days.filter((day) => {
      const key = `${coinId}:${day}`;
      return !historicalCache.has(key);
    });

    if (unresolvedDays.length > 0) {
      const rangePricesByDay = await fetchHistoricalRangeByDay(base, coinId, fromUnix, toUnix);
      for (const day of unresolvedDays) {
        const cacheKey = `${coinId}:${day}`;
        if (rangePricesByDay.has(day)) {
          const value = rangePricesByDay.get(day);
          if (typeof value === "number" && Number.isFinite(value) && value >= 0) {
            historicalCache.set(cacheKey, value);
          }
          continue;
        }

        const fallback = await fetchHistoricalPriceForDay(base, coinId, day);
        if (typeof fallback === "number" && Number.isFinite(fallback) && fallback >= 0) {
          historicalCache.set(cacheKey, fallback);
        }
      }
    }

    for (const assetKey of mappedAssetKeys) {
      for (const day of days) {
        const cacheKey = `${coinId}:${day}`;
        out[`${assetKey}:${day}`] = historicalCache.get(cacheKey) ?? null;
      }
    }
  }

  return out;
}

async function fetchHistoricalRangeByDay(base: string, coinId: string, fromUnix: number, toUnix: number): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!Number.isFinite(fromUnix) || !Number.isFinite(toUnix) || fromUnix <= 0 || toUnix <= 0 || toUnix < fromUnix) {
    return out;
  }

  const from = Math.floor(fromUnix - 12 * 60 * 60);
  const to = Math.floor(toUnix + 36 * 60 * 60);

  try {
    const url = new URL(`${base}/coins/${coinId}/market_chart/range`);
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("from", String(from));
    url.searchParams.set("to", String(to));

    const response = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!response.ok) {
      return out;
    }

    const data = (await response.json()) as { prices?: Array<[number, number]> };
    for (const row of data.prices ?? []) {
      if (!Array.isArray(row) || row.length < 2) continue;
      const [msTs, price] = row;
      if (!Number.isFinite(msTs) || !Number.isFinite(price) || price < 0) continue;
      const dayKey = formatUtcDay(Math.floor(msTs / 1000));
      out.set(dayKey, price);
    }
  } catch {
    return out;
  }

  return out;
}

async function fetchHistoricalPriceForDay(base: string, coinId: string, day: string): Promise<number | null> {
  try {
    const url = new URL(`${base}/coins/${coinId}/history`);
    url.searchParams.set("date", day);
    url.searchParams.set("localization", "false");

    const response = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as { market_data?: { current_price?: { usd?: number } } };
    const usd = data.market_data?.current_price?.usd;
    return typeof usd === "number" && Number.isFinite(usd) && usd >= 0 ? usd : null;
  } catch {
    return null;
  }
}

export function getHistoricalPriceKey(assetKey: string, unixTs: number): string {
  return `${assetKey}:${formatUtcDay(unixTs)}`;
}
