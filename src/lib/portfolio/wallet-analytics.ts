export type AnalyticsTx = {
  ts: number;
  wallet: string;
  assetKey: string;
  amount: number;
  direction: "in" | "out" | "self";
  unitPriceUsd: number | null;
  feeAlgo: number;
};

export type SeriesPoint = {
  ts: string;
  value: number;
};

export type WalletSeries = {
  key: string;
  label: string;
  points: SeriesPoint[];
};

function finite(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function toIso(tsSeconds: number): string {
  return new Date(tsSeconds * 1000).toISOString();
}

function sumValue(balances: Map<string, number>, prices: Map<string, number>): number {
  let total = 0;
  for (const [assetKey, qty] of balances.entries()) {
    if (!finite(qty) || qty <= 0) continue;
    const price = prices.get(assetKey);
    if (!finite(price)) continue;
    total += qty * price;
  }
  return total;
}

function appendLatestPoint(points: SeriesPoint[], latestTs: string | null, latestValue: number | undefined) {
  if (!latestTs || !finite(latestValue)) return points;
  const parsed = Date.parse(latestTs);
  if (!Number.isFinite(parsed)) return points;
  return [...points, { ts: new Date(parsed).toISOString(), value: latestValue }];
}

function utcDayKey(isoTs: string): string | null {
  const parsed = Date.parse(isoTs);
  if (!Number.isFinite(parsed)) return null;
  return new Date(parsed).toISOString().slice(0, 10);
}

export function normalizeSeriesToUtcDailyClose(series: WalletSeries[]): WalletSeries[] {
  return series.map((item) => {
    if (item.points.length <= 1) {
      return item;
    }

    const byDay = new Map<string, SeriesPoint>();
    for (const point of item.points) {
      const day = utcDayKey(point.ts);
      if (!day) continue;
      const existing = byDay.get(day);
      if (!existing || Date.parse(point.ts) >= Date.parse(existing.ts)) {
        byDay.set(day, point);
      }
    }

    const normalized = Array.from(byDay.values()).sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
    return {
      ...item,
      points: normalized.length ? normalized : item.points
    };
  });
}

export function buildPerWalletValueSeries({
  transactions,
  wallets,
  latestValueByWallet,
  latestTs
}: {
  transactions: AnalyticsTx[];
  wallets: string[];
  latestValueByWallet: Record<string, number | undefined>;
  latestTs: string | null;
}): WalletSeries[] {
  const sorted = [...transactions]
    .filter((tx) => wallets.includes(tx.wallet) && finite(tx.ts) && tx.ts > 0 && finite(tx.amount) && tx.amount >= 0)
    .sort((a, b) => a.ts - b.ts);

  const balanceState = new Map<string, Map<string, number>>();
  const priceState = new Map<string, Map<string, number>>();
  const pointState = new Map<string, SeriesPoint[]>();

  for (const wallet of wallets) {
    balanceState.set(wallet, new Map());
    priceState.set(wallet, new Map());
    pointState.set(wallet, []);
  }

  for (const tx of sorted) {
    const balances = balanceState.get(tx.wallet);
    const prices = priceState.get(tx.wallet);
    const points = pointState.get(tx.wallet);
    if (!balances || !prices || !points) continue;

    if (finite(tx.unitPriceUsd) && tx.unitPriceUsd >= 0) {
      prices.set(tx.assetKey, tx.unitPriceUsd);
    }

    const prev = balances.get(tx.assetKey) ?? 0;
    if (tx.direction === "in") {
      balances.set(tx.assetKey, Math.max(0, prev + tx.amount));
    } else if (tx.direction === "out") {
      balances.set(tx.assetKey, Math.max(0, prev - tx.amount));
    }

    if (finite(tx.feeAlgo) && tx.feeAlgo > 0) {
      const algoPrev = balances.get("ALGO") ?? 0;
      balances.set("ALGO", Math.max(0, algoPrev - tx.feeAlgo));
    }

    points.push({ ts: toIso(tx.ts), value: sumValue(balances, prices) });
  }

  return wallets.map((wallet) => ({
    key: wallet,
    label: wallet,
    points: appendLatestPoint(pointState.get(wallet) ?? [], latestTs, latestValueByWallet[wallet])
  }));
}

export function buildPerWalletAssetBalanceSeries({
  transactions,
  wallets,
  assetKey,
  latestBalanceByWallet,
  latestTs
}: {
  transactions: AnalyticsTx[];
  wallets: string[];
  assetKey: string;
  latestBalanceByWallet: Record<string, number | undefined>;
  latestTs: string | null;
}): WalletSeries[] {
  const sorted = [...transactions]
    .filter((tx) => wallets.includes(tx.wallet) && finite(tx.ts) && tx.ts > 0 && finite(tx.amount) && tx.amount >= 0)
    .sort((a, b) => a.ts - b.ts);

  const balanceState = new Map<string, number>();
  const pointState = new Map<string, SeriesPoint[]>();
  for (const wallet of wallets) {
    balanceState.set(wallet, 0);
    pointState.set(wallet, []);
  }

  for (const tx of sorted) {
    let delta = 0;
    if (tx.assetKey === assetKey) {
      if (tx.direction === "in") delta += tx.amount;
      if (tx.direction === "out") delta -= tx.amount;
    }
    if (assetKey === "ALGO" && finite(tx.feeAlgo) && tx.feeAlgo > 0) {
      delta -= tx.feeAlgo;
    }

    if (delta === 0) continue;
    const prev = balanceState.get(tx.wallet) ?? 0;
    const next = Math.max(0, prev + delta);
    balanceState.set(tx.wallet, next);
    pointState.get(tx.wallet)?.push({ ts: toIso(tx.ts), value: next });
  }

  return wallets.map((wallet) => ({
    key: wallet,
    label: wallet,
    points: appendLatestPoint(pointState.get(wallet) ?? [], latestTs, latestBalanceByWallet[wallet])
  }));
}

export function alignSeriesByTimestamp(series: WalletSeries[]): { timestamps: string[]; series: Array<{ key: string; label: string; values: number[] }> } {
  const tsSet = new Set<string>();
  for (const s of series) {
    for (const point of s.points) tsSet.add(point.ts);
  }
  const timestamps = Array.from(tsSet.values()).sort((a, b) => Date.parse(a) - Date.parse(b));

  const aligned = series.map((s) => {
    let current = 0;
    const map = new Map(s.points.map((p) => [p.ts, p.value]));
    const values = timestamps.map((ts) => {
      const next = map.get(ts);
      if (finite(next)) current = next;
      return current;
    });
    return { key: s.key, label: s.label, values };
  });

  return { timestamps, series: aligned };
}

export function sumAlignedSeries(aligned: { timestamps: string[]; series: Array<{ key: string; label: string; values: number[] }> }): WalletSeries {
  const values = aligned.timestamps.map((_, index) =>
    aligned.series.reduce((sum, s) => sum + (finite(s.values[index]) ? s.values[index] : 0), 0)
  );
  return {
    key: "aggregate",
    label: "Aggregate",
    points: aligned.timestamps.map((ts, index) => ({ ts, value: values[index] ?? 0 }))
  };
}
