export type HistoryTransaction = {
  ts: number;
  assetKey: string;
  amount: number;
  direction: "in" | "out" | "self";
  unitPriceUsd: number | null;
  feeAlgo: number;
};

export type PortfolioHistoryPoint = {
  ts: string;
  valueUsd: number;
};

export type LatestAssetState = {
  assetKey: string;
  balance: number;
  priceUsd: number | null;
};

export type DailyPriceEntry = {
  assetKey: string;
  dayKey: string; // UTC day key: YYYY-MM-DD
  priceUsd: number | null;
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildPortfolioHistoryFromTransactions({
  transactions,
  latestValueUsd,
  latestTs,
  latestAssetStates,
  dailyPrices = []
}: {
  transactions: HistoryTransaction[];
  latestValueUsd?: number | null;
  latestTs?: string | Date | null;
  latestAssetStates?: LatestAssetState[];
  dailyPrices?: DailyPriceEntry[];
}): PortfolioHistoryPoint[] {
  const normalized = transactions
    .filter((tx) => finite(tx.ts) && tx.ts > 0 && finite(tx.amount) && tx.amount >= 0)
    .sort((a, b) => a.ts - b.ts);

  const parsedLatestTs = latestTs ? Date.parse(String(latestTs)) : NaN;
  const hasLatestAnchor =
    Array.isArray(latestAssetStates) &&
    latestAssetStates.length > 0 &&
    Number.isFinite(parsedLatestTs) &&
    parsedLatestTs > 0;

  if (hasLatestAnchor) {
    const balances = new Map<string, number>();
    const txLastPriceByAssetDay = new Map<string, number>();
    const explicitDailyPriceByAssetDay = new Map<string, number>();
    const points: PortfolioHistoryPoint[] = [];

    for (const asset of latestAssetStates ?? []) {
      if (!asset.assetKey) continue;
      if (finite(asset.balance) && asset.balance > 0) {
        balances.set(asset.assetKey, asset.balance);
      }
    }

    for (const row of dailyPrices) {
      if (row.assetKey && row.dayKey && finite(row.priceUsd) && row.priceUsd >= 0) {
        explicitDailyPriceByAssetDay.set(`${row.assetKey}:${row.dayKey}`, row.priceUsd);
      }
    }

    for (const tx of normalized) {
      if (finite(tx.unitPriceUsd) && tx.unitPriceUsd >= 0) {
        const dayKey = toUtcDayKeyFromUnix(tx.ts);
        txLastPriceByAssetDay.set(`${tx.assetKey}:${dayKey}`, tx.unitPriceUsd);
      }
    }

    const latestAssetSpot = new Map<string, number>();
    for (const asset of latestAssetStates ?? []) {
      if (asset.assetKey && finite(asset.priceUsd) && asset.priceUsd >= 0) {
        latestAssetSpot.set(asset.assetKey, asset.priceUsd);
      }
    }

    const latestDayKey = toUtcDayKeyFromMs(parsedLatestTs);
    const earliestTxTs = normalized[0]?.ts ?? Math.floor(parsedLatestTs / 1000);
    const earliestDayKey = toUtcDayKeyFromUnix(earliestTxTs);
    const dayKeys = enumerateUtcDayKeys(earliestDayKey, latestDayKey);

    const resolvedPriceByAssetDay = buildResolvedPriceSeries({
      dayKeys,
      assetKeys: Array.from(new Set([...balances.keys(), ...normalized.map((tx) => tx.assetKey)])),
      explicitDailyPriceByAssetDay,
      txLastPriceByAssetDay,
      latestAssetSpot
    });

    const computeValue = (dayKey: string) => {
      let total = 0;
      for (const [assetKey, balance] of balances.entries()) {
        if (!finite(balance) || balance <= 0) continue;
        const price = resolvedPriceByAssetDay.get(`${assetKey}:${dayKey}`);
        if (!finite(price)) continue;
        total += balance * price;
      }
      return total;
    };

    const setBalance = (assetKey: string, nextValue: number) => {
      const clamped = Math.max(0, nextValue);
      if (clamped <= 0) {
        balances.delete(assetKey);
      } else {
        balances.set(assetKey, clamped);
      }
    };

    const txsByDayDescending = new Map<string, HistoryTransaction[]>();
    const latestTsSeconds = Math.floor(parsedLatestTs / 1000);
    const descending = normalized.filter((tx) => tx.ts < latestTsSeconds).sort((a, b) => b.ts - a.ts);
    for (const tx of descending) {
      const dayKey = toUtcDayKeyFromUnix(tx.ts);
      const bucket = txsByDayDescending.get(dayKey) ?? [];
      bucket.push(tx);
      txsByDayDescending.set(dayKey, bucket);
    }

    for (const dayKey of [...dayKeys].reverse()) {
      const dayEnd = toUtcDayEndIso(dayKey);
      const value = dayKey === latestDayKey && finite(latestValueUsd) ? latestValueUsd : computeValue(dayKey);
      points.push({
        ts: dayEnd,
        valueUsd: value
      });

      const dayTxs = txsByDayDescending.get(dayKey) ?? [];
      for (const tx of dayTxs) {
        const current = balances.get(tx.assetKey) ?? 0;
        if (tx.direction === "in") {
          setBalance(tx.assetKey, current - tx.amount);
        } else if (tx.direction === "out") {
          setBalance(tx.assetKey, current + tx.amount);
        }

        if (finite(tx.feeAlgo) && tx.feeAlgo > 0) {
          const currentAlgo = balances.get("ALGO") ?? 0;
          setBalance("ALGO", currentAlgo + tx.feeAlgo);
        }
      }
    }

    const sortedPoints = points.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    const byTimestamp = new Map<string, PortfolioHistoryPoint>();
    for (const point of sortedPoints) {
      byTimestamp.set(point.ts, point);
    }
    return Array.from(byTimestamp.values()).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
  }

  if (normalized.length === 0) {
    return [];
  }

  const sorted = [...normalized];
  const balances = new Map<string, number>();
  const lastPrice = new Map<string, number>();
  const points: PortfolioHistoryPoint[] = [];

  const updateBalance = (assetKey: string, delta: number) => {
    const prev = balances.get(assetKey) ?? 0;
    const next = prev + delta;
    balances.set(assetKey, Math.max(0, next));
  };

  const computeValue = () => {
    let total = 0;
    for (const [assetKey, balance] of balances.entries()) {
      if (!finite(balance) || balance <= 0) continue;
      const price = lastPrice.get(assetKey);
      if (!finite(price)) continue;
      total += balance * price;
    }
    return total;
  };

  for (const tx of sorted) {
    if (finite(tx.unitPriceUsd) && tx.unitPriceUsd >= 0) {
      lastPrice.set(tx.assetKey, tx.unitPriceUsd);
    }

    if (tx.direction === "in") {
      updateBalance(tx.assetKey, tx.amount);
    } else if (tx.direction === "out") {
      updateBalance(tx.assetKey, -tx.amount);
    }

    if (finite(tx.feeAlgo) && tx.feeAlgo > 0) {
      updateBalance("ALGO", -tx.feeAlgo);
    }

    points.push({
      ts: new Date(tx.ts * 1000).toISOString(),
      valueUsd: computeValue()
    });
  }

  const byTimestamp = new Map<string, PortfolioHistoryPoint>();
  for (const point of points) {
    byTimestamp.set(point.ts, point);
  }

  const deduped = Array.from(byTimestamp.values()).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

  if (finite(latestValueUsd) && latestTs) {
    const parsedLatestTs = Date.parse(String(latestTs));
    if (Number.isFinite(parsedLatestTs)) {
      deduped.push({
        ts: new Date(parsedLatestTs).toISOString(),
        valueUsd: latestValueUsd
      });
    }
  }

  return deduped;
}

function toUtcDayKeyFromUnix(unixTs: number): string {
  const d = new Date(unixTs * 1000);
  return toUtcDayKeyFromDate(d);
}

function toUtcDayKeyFromMs(msTs: number): string {
  const d = new Date(msTs);
  return toUtcDayKeyFromDate(d);
}

function toUtcDayKeyFromDate(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function toUtcDayEndIso(dayKey: string): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  return new Date(Date.UTC(y, (m ?? 1) - 1, d ?? 1, 23, 59, 59, 999)).toISOString();
}

function enumerateUtcDayKeys(startDayKey: string, endDayKey: string): string[] {
  const [sy, sm, sd] = startDayKey.split("-").map(Number);
  const [ey, em, ed] = endDayKey.split("-").map(Number);
  const start = new Date(Date.UTC(sy, (sm ?? 1) - 1, sd ?? 1));
  const end = new Date(Date.UTC(ey, (em ?? 1) - 1, ed ?? 1));
  const out: string[] = [];
  for (let d = start.getTime(); d <= end.getTime(); d += 24 * 60 * 60 * 1000) {
    out.push(toUtcDayKeyFromDate(new Date(d)));
  }
  return out;
}

function buildResolvedPriceSeries({
  dayKeys,
  assetKeys,
  explicitDailyPriceByAssetDay,
  txLastPriceByAssetDay,
  latestAssetSpot
}: {
  dayKeys: string[];
  assetKeys: string[];
  explicitDailyPriceByAssetDay: Map<string, number>;
  txLastPriceByAssetDay: Map<string, number>;
  latestAssetSpot: Map<string, number>;
}) {
  const resolved = new Map<string, number>();

  for (const assetKey of assetKeys) {
    const series = dayKeys.map((dayKey) => {
      const explicit = explicitDailyPriceByAssetDay.get(`${assetKey}:${dayKey}`);
      if (finite(explicit) && explicit >= 0) return explicit;
      const txFallback = txLastPriceByAssetDay.get(`${assetKey}:${dayKey}`);
      if (finite(txFallback) && txFallback >= 0) return txFallback;
      return null;
    });

    // Forward fill
    for (let i = 1; i < series.length; i += 1) {
      if (!finite(series[i]) && finite(series[i - 1])) {
        series[i] = series[i - 1];
      }
    }
    // Backward fill
    for (let i = series.length - 2; i >= 0; i -= 1) {
      if (!finite(series[i]) && finite(series[i + 1])) {
        series[i] = series[i + 1];
      }
    }

    const spotFallback = latestAssetSpot.get(assetKey);
    const ultimateFallback = finite(spotFallback) ? spotFallback : 0;
    for (let i = 0; i < dayKeys.length; i += 1) {
      const price = finite(series[i]) ? (series[i] as number) : ultimateFallback;
      resolved.set(`${assetKey}:${dayKeys[i]}`, price);
    }
  }

  return resolved;
}
