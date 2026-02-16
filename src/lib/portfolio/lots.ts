export type LotEvent = {
  txId: string;
  ts: number;
  assetId: number | null;
  side: "buy" | "sell";
  amount: number;
  unitPriceUsd: number | null;
  feeUsd: number;
  wallet?: string;
};

export type AssetLotSummary = {
  assetKey: string;
  remainingQty: number;
  remainingCostUsd: number;
  realizedPnlUsd: number;
  hasPriceGaps: boolean;
};

type Lot = {
  qty: number;
  costPerUnitUsd: number;
};

/**
 * Fee policy:
 * - Buy: fee is capitalized into lot cost.
 * - Sell: fee is subtracted from proceeds.
 */
export function runFifo(events: LotEvent[]): Record<string, AssetLotSummary> {
  const sorted = [...events].sort((a, b) => a.ts - b.ts);

  const lotsByAsset = new Map<string, Lot[]>();
  const summaryByAsset = new Map<string, AssetLotSummary>();

  for (const event of sorted) {
    // Ignore zero/invalid quantities to avoid 0/0 cost-per-unit math.
    if (!Number.isFinite(event.amount) || event.amount <= 0) {
      continue;
    }

    const key = event.assetId === null ? "ALGO" : String(event.assetId);
    if (!summaryByAsset.has(key)) {
      summaryByAsset.set(key, {
        assetKey: key,
        remainingQty: 0,
        remainingCostUsd: 0,
        realizedPnlUsd: 0,
        hasPriceGaps: false
      });
    }
    if (!lotsByAsset.has(key)) {
      lotsByAsset.set(key, []);
    }

    const summary = summaryByAsset.get(key)!;
    const lots = lotsByAsset.get(key)!;

    if (event.side === "buy") {
      if (event.unitPriceUsd === null) {
        summary.hasPriceGaps = true;
        continue;
      }
      const totalCost = event.amount * event.unitPriceUsd + event.feeUsd;
      if (!Number.isFinite(totalCost)) {
        summary.hasPriceGaps = true;
        continue;
      }
      lots.push({
        qty: event.amount,
        costPerUnitUsd: totalCost / event.amount
      });
      continue;
    }

    if (event.unitPriceUsd === null) {
      summary.hasPriceGaps = true;
      continue;
    }

    let remainingToDispose = event.amount;
    let disposedCost = 0;

    while (remainingToDispose > 0 && lots.length > 0) {
      const head = lots[0];
      const consume = Math.min(remainingToDispose, head.qty);
      disposedCost += consume * head.costPerUnitUsd;
      head.qty -= consume;
      remainingToDispose -= consume;
      if (head.qty <= 1e-12) {
        lots.shift();
      }
    }

    const proceeds = event.amount * event.unitPriceUsd - event.feeUsd;
    if (!Number.isFinite(proceeds)) {
      summary.hasPriceGaps = true;
      continue;
    }
    summary.realizedPnlUsd += proceeds - disposedCost;
  }

  for (const [assetKey, lots] of lotsByAsset.entries()) {
    const summary = summaryByAsset.get(assetKey)!;
    summary.remainingQty = lots.reduce((sum, lot) => sum + lot.qty, 0);
    summary.remainingCostUsd = lots.reduce((sum, lot) => sum + lot.qty * lot.costPerUnitUsd, 0);
  }

  return Object.fromEntries(summaryByAsset.entries());
}
