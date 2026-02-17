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

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

export function buildPortfolioHistoryFromTransactions({
  transactions,
  latestValueUsd,
  latestTs
}: {
  transactions: HistoryTransaction[];
  latestValueUsd?: number | null;
  latestTs?: string | Date | null;
}): PortfolioHistoryPoint[] {
  const sorted = transactions
    .filter((tx) => finite(tx.ts) && tx.ts > 0 && finite(tx.amount) && tx.amount >= 0)
    .sort((a, b) => a.ts - b.ts);

  if (sorted.length === 0) {
    return [];
  }

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

  const byDay = new Map<string, PortfolioHistoryPoint>();
  for (const point of points) {
    byDay.set(point.ts.slice(0, 10), point);
  }

  const deduped = Array.from(byDay.values()).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));

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
