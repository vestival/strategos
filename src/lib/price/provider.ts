import { getEnv } from "@/lib/env";

const env = getEnv();

const ALGO_CG_ID = "algorand";
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

  let prices: PriceMap = {};
  if (idsToQuery.size > 0) {
    const url = new URL(env.PRICE_API_URL);
    url.searchParams.set("ids", Array.from(idsToQuery).join(","));
    url.searchParams.set("vs_currencies", "usd");

    const response = await fetch(url.toString(), { next: { revalidate: 0 } });
    if (response.ok) {
      prices = (await response.json()) as PriceMap;
    }
  }

  const out: Record<string, number | null> = {};

  for (const key of unique) {
    if (key === "ALGO") {
      out[key] = prices[ALGO_CG_ID]?.usd ?? null;
      continue;
    }

    const asaId = Number(key);
    const cgId = asaMap[asaId];
    out[key] = cgId ? prices[cgId]?.usd ?? null : null;
  }

  return out;
}
