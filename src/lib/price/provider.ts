import { getEnv } from "@/lib/env";

const env = getEnv();

const ALGO_CG_ID = "algorand";
const DEFAULT_CG_SIMPLE_PRICE_URL = "https://api.coingecko.com/api/v3/simple/price";
const DEFAULT_LLAMA_PRICE_URL = "https://coins.llama.fi/prices/current";
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
  2537013734: "algorand", // tALGO
  2537013737: "algorand", // tALGO-related asset in ecosystem
  1134696561: "xalgo" // xALGO
};

type PriceMap = Record<string, { usd: number }>;
type SpotPriceCacheEntry = {
  usd: number;
  asOf: number;
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

export async function getSpotPricesUsd(assetIds: Array<number | null>): Promise<Record<string, number | null>> {
  const unique = Array.from(new Set(assetIds.map((id) => (id === null ? "ALGO" : String(id)))));

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
  if (idsToQuery.size > 0) {
    const endpoints = Array.from(new Set([env.PRICE_API_URL, DEFAULT_CG_SIMPLE_PRICE_URL]));

    for (const endpoint of endpoints) {
      const fetched = await fetchSpotPriceMap(endpoint, requestedCoinIds);
      if (Object.keys(fetched).length > 0) {
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

  const out: Record<string, number | null> = {};

  for (const key of unique) {
    if (key === "ALGO") {
      out[key] = prices[ALGO_CG_ID]?.usd ?? spotCache.get(ALGO_CG_ID)?.usd ?? null;
      continue;
    }

    const asaId = Number(key);
    const cgId = asaMap[asaId];
    out[key] = cgId ? prices[cgId]?.usd ?? spotCache.get(cgId)?.usd ?? null : null;
  }

  return out;
}

export async function getHistoricalPricesUsdByDay(
  assetKeys: string[],
  unixTimestamps: number[]
): Promise<Record<string, number | null>> {
  const out: Record<string, number | null> = {};
  const base = getCoinGeckoApiBase();
  if (!base) {
    return out;
  }

  const days = Array.from(new Set(unixTimestamps.filter((ts) => Number.isFinite(ts) && ts > 0).map((ts) => formatUtcDay(ts))));
  if (days.length === 0) {
    return out;
  }

  const tasks: Array<{ assetKey: string; day: string; coinId: string }> = [];

  for (const assetKey of Array.from(new Set(assetKeys))) {
    const coinId = getCoinGeckoIdForAssetKey(assetKey);
    if (!coinId) {
      continue;
    }
    for (const day of days) {
      tasks.push({ assetKey, day, coinId });
    }
  }

  await Promise.all(
    tasks.map(async (task) => {
      const cacheKey = `${task.coinId}:${task.day}`;
      let usd: number | null;

      if (historicalCache.has(cacheKey)) {
        usd = historicalCache.get(cacheKey) ?? null;
      } else {
        const url = new URL(`${base}/coins/${task.coinId}/history`);
        url.searchParams.set("date", task.day);
        url.searchParams.set("localization", "false");

        try {
          const response = await fetch(url.toString(), { next: { revalidate: 0 } });
          if (!response.ok) {
            usd = null;
          } else {
            const data = (await response.json()) as {
              market_data?: { current_price?: { usd?: number } };
            };
            usd = data.market_data?.current_price?.usd ?? null;
          }
        } catch {
          usd = null;
        }

        historicalCache.set(cacheKey, usd);
      }

      out[`${task.assetKey}:${task.day}`] = usd;
    })
  );

  return out;
}

export function getHistoricalPriceKey(assetKey: string, unixTs: number): string {
  return `${assetKey}:${formatUtcDay(unixTs)}`;
}
