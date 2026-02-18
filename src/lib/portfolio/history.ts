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

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildPortfolioHistoryFromTransactions({
  transactions,
  latestValueUsd,
  latestTs,
  latestAssetStates
}: {
  transactions: HistoryTransaction[];
  latestValueUsd?: number | null;
  latestTs?: string | Date | null;
  latestAssetStates?: LatestAssetState[];
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
    const lastPrice = new Map<string, number>();
    const points: PortfolioHistoryPoint[] = [];

    for (const asset of latestAssetStates ?? []) {
      if (!asset.assetKey) continue;
      if (finite(asset.balance) && asset.balance > 0) {
        balances.set(asset.assetKey, asset.balance);
      }
      if (finite(asset.priceUsd) && asset.priceUsd >= 0) {
        lastPrice.set(asset.assetKey, asset.priceUsd);
      }
    }

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

    const setBalance = (assetKey: string, nextValue: number) => {
      const clamped = Math.max(0, nextValue);
      if (clamped <= 0) {
        balances.delete(assetKey);
      } else {
        balances.set(assetKey, clamped);
      }
    };

    points.push({
      ts: new Date(parsedLatestTs).toISOString(),
      valueUsd: finite(latestValueUsd) ? latestValueUsd : computeValue()
    });

    const latestTsSeconds = Math.floor(parsedLatestTs / 1000);
    const descending = normalized.filter((tx) => tx.ts < latestTsSeconds).sort((a, b) => b.ts - a.ts);
    for (const tx of descending) {
      if (finite(tx.unitPriceUsd) && tx.unitPriceUsd >= 0) {
        lastPrice.set(tx.assetKey, tx.unitPriceUsd);
      }

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

      points.push({
        ts: new Date(tx.ts * 1000).toISOString(),
        valueUsd: computeValue()
      });
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
