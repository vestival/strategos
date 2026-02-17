import type { IndexerTxn } from "@/lib/algorand/types";
import type { LotEvent } from "@/lib/portfolio/lots";

export function parseTransactionsToLotEvents(params: {
  txns: IndexerTxn[];
  ownWallets: Set<string>;
  pricesUsd: Record<string, number | null>;
  decimalsByAsset: Record<string, number>;
  getUnitPriceUsd?: (assetKey: string, unixTs: number) => number | null;
}): LotEvent[] {
  const { txns, ownWallets, pricesUsd, decimalsByAsset, getUnitPriceUsd } = params;
  const events: LotEvent[] = [];

  for (const txn of txns) {
    const feeAlgo = txn.fee / 1_000_000;
    const feeUsd = feeAlgo * (pricesUsd.ALGO ?? 0);

    if (txn.paymentTransaction) {
      const unitPriceUsd = getUnitPriceUsd?.("ALGO", txn.confirmedRoundTime) ?? pricesUsd.ALGO ?? null;
      const amountAlgo = txn.paymentTransaction.amount / 1_000_000;
      const receiver = txn.paymentTransaction.receiver;
      const senderOwned = ownWallets.has(txn.sender);
      const receiverOwned = ownWallets.has(receiver);

      if (senderOwned && receiverOwned) {
        continue;
      }

      if (senderOwned) {
        events.push({
          txId: txn.id,
          ts: txn.confirmedRoundTime,
          assetId: null,
          side: "sell",
          amount: amountAlgo,
          unitPriceUsd,
          feeUsd
        });
      }

      if (receiverOwned) {
        events.push({
          txId: txn.id,
          ts: txn.confirmedRoundTime,
          assetId: null,
          side: "buy",
          amount: amountAlgo,
          unitPriceUsd,
          feeUsd: 0
        });
      }

      continue;
    }

    if (txn.assetTransferTransaction) {
      const { assetId, amount, receiver } = txn.assetTransferTransaction;
      const senderOwned = ownWallets.has(txn.sender);
      const receiverOwned = ownWallets.has(receiver);
      const key = String(assetId);
      const unitPriceUsd = getUnitPriceUsd?.(key, txn.confirmedRoundTime) ?? pricesUsd[key] ?? null;
      const decimals = decimalsByAsset[key] ?? 0;
      const qty = amount / 10 ** decimals;

      if (senderOwned && receiverOwned) {
        continue;
      }

      if (senderOwned) {
        events.push({
          txId: txn.id,
          ts: txn.confirmedRoundTime,
          assetId,
          side: "sell",
          amount: qty,
          unitPriceUsd,
          feeUsd
        });
      }

      if (receiverOwned) {
        events.push({
          txId: txn.id,
          ts: txn.confirmedRoundTime,
          assetId,
          side: "buy",
          amount: qty,
          unitPriceUsd,
          feeUsd: 0
        });
      }

      // TODO: Improve swap detection by decoding grouped transactions and AMM app calls.
    }
  }

  return events;
}
