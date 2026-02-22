export type DailyPriceRow = {
  assetKey: string;
  dayKey: string;
  priceUsd: number | null;
};

export type ScopedAssetBalance = {
  assetKey?: string;
  balance?: number | null;
};

export function chooseBestDailyPrices({
  stored,
  fresh,
  scopedAssets
}: {
  stored: DailyPriceRow[];
  fresh: DailyPriceRow[];
  scopedAssets: ScopedAssetBalance[];
}): DailyPriceRow[] {
  if (fresh.length === 0) {
    return stored;
  }

  // Always merge with fresh rows taking precedence for finite prices.
  // Stored rows may be stale from prior snapshots; fresh rows are fetched
  // on-demand for the requested day range and should drive chart valuation.
  const merged = mergeDailyPrices(stored, fresh);
  if (merged.length > 0) {
    return merged;
  }

  const storedCoverage = calculateDailyCoverage(stored, scopedAssets);
  const freshCoverage = calculateDailyCoverage(fresh, scopedAssets);

  // Defensive fallback if merge produced no rows for any reason.
  if (freshCoverage >= storedCoverage + 0.1 || storedCoverage < 0.6) {
    return fresh;
  }

  return stored.length > 0 ? stored : fresh;
}

export function mergeDailyPrices(stored: DailyPriceRow[], fresh: DailyPriceRow[]): DailyPriceRow[] {
  const merged = new Map<string, DailyPriceRow>();

  for (const row of stored) {
    merged.set(`${row.assetKey}:${row.dayKey}`, row);
  }

  for (const row of fresh) {
    const key = `${row.assetKey}:${row.dayKey}`;
    const prev = merged.get(key);
    if (!prev) {
      merged.set(key, row);
      continue;
    }
    if (isFinitePrice(row.priceUsd)) {
      merged.set(key, row);
      continue;
    }
    if (!isFinitePrice(prev.priceUsd)) {
      merged.set(key, row);
    }
  }

  return Array.from(merged.values()).sort((a, b) => {
    if (a.assetKey === b.assetKey) {
      return a.dayKey.localeCompare(b.dayKey);
    }
    return a.assetKey.localeCompare(b.assetKey);
  });
}

export function calculateDailyCoverage(rows: DailyPriceRow[], scopedAssets: ScopedAssetBalance[]): number {
  if (rows.length === 0) {
    return 0;
  }

  const pricedAssets = new Set(
    scopedAssets
      .filter((asset) => (asset.balance ?? 0) > 0)
      .map((asset) => asset.assetKey)
      .filter((assetKey): assetKey is string => Boolean(assetKey))
  );

  if (pricedAssets.size === 0) {
    return 0;
  }

  let populated = 0;
  let total = 0;
  for (const row of rows) {
    if (!pricedAssets.has(row.assetKey)) {
      continue;
    }
    total += 1;
    if (isFinitePrice(row.priceUsd)) {
      populated += 1;
    }
  }

  return total > 0 ? populated / total : 0;
}

export function isFinitePrice(value: number | null | undefined): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}
