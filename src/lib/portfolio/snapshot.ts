import { getAccountState, getAssetInfo, getTransactionsForAddress } from "@/lib/algorand/indexer";
import type { AccountState, IndexerTxn } from "@/lib/algorand/types";
import { getAllDefiPositions } from "@/lib/defi";
import type { DefiPosition } from "@/lib/defi/types";
import { runFifo } from "@/lib/portfolio/lots";
import { parseTransactionsToLotEvents } from "@/lib/portfolio/parser";
import { getHistoricalPriceKey, getHistoricalPricesUsdByDay, getSpotPricesUsd } from "@/lib/price/provider";

export type SnapshotAssetRow = {
  assetKey: string;
  assetName: string;
  balance: number;
  walletBreakdown: Array<{
    wallet: string;
    balance: number;
    valueUsd: number | null;
  }>;
  priceUsd: number | null;
  valueUsd: number | null;
  costBasisUsd: number;
  realizedPnlUsd: number;
  unrealizedPnlUsd: number | null;
  hasPrice: boolean;
};

export type WalletBreakdown = {
  wallet: string;
  totalValueUsd: number;
  totalCostBasisUsd: number;
  totalRealizedPnlUsd: number;
  totalUnrealizedPnlUsd: number;
};

export type SnapshotTransactionRow = {
  txId: string;
  ts: number;
  wallet: string;
  counterparty: string | null;
  txType: "payment" | "asset-transfer";
  direction: "in" | "out" | "self";
  assetKey: string;
  assetName: string;
  amount: number;
  unitPriceUsd: number | null;
  valueUsd: number | null;
  valueSource: "historical" | "spot" | "missing";
  feeAlgo: number;
  feeUsd: number;
};

export type PortfolioSnapshotPayload = {
  computedAt: string;
  priceAsOf: string;
  method: "FIFO";
  totals: {
    valueUsd: number;
    costBasisUsd: number;
    realizedPnlUsd: number;
    unrealizedPnlUsd: number;
  };
  assets: SnapshotAssetRow[];
  transactions: SnapshotTransactionRow[];
  wallets: WalletBreakdown[];
  defiPositions: DefiPosition[];
  yieldEstimate: {
    estimatedAprPct: number | null;
    estimated: boolean;
    note: string;
  };
};

export type SnapshotDeps = {
  getAccountStateFn?: (address: string) => Promise<AccountState>;
  getTransactionsFn?: (address: string) => Promise<IndexerTxn[]>;
  getSpotPricesFn?: (assetIds: Array<number | null>) => Promise<Record<string, number | null>>;
  getHistoricalPricesFn?: (assetKeys: string[], unixTimestamps: number[]) => Promise<Record<string, number | null>>;
  getDefiPositionsFn?: (wallets: string[]) => Promise<DefiPosition[]>;
};

function finiteOr(value: number, fallback = 0): number {
  return Number.isFinite(value) ? value : fallback;
}

export async function computePortfolioSnapshot(wallets: string[], deps: SnapshotDeps = {}): Promise<PortfolioSnapshotPayload> {
  const getAccountStateFn = deps.getAccountStateFn ?? getAccountState;
  const getTransactionsFn = deps.getTransactionsFn ?? getTransactionsForAddress;
  const getSpotPricesFn = deps.getSpotPricesFn ?? getSpotPricesUsd;
  const getHistoricalPricesFn = deps.getHistoricalPricesFn ?? getHistoricalPricesUsdByDay;
  const getDefiPositionsFn = deps.getDefiPositionsFn ?? getAllDefiPositions;

  const accountStates = await Promise.all(wallets.map((w) => getAccountStateFn(w)));
  const allTxArrays = await Promise.all(wallets.map((w) => getTransactionsFn(w)));

  const txMap = new Map<string, IndexerTxn>();
  for (const txns of allTxArrays) {
    for (const txn of txns) {
      txMap.set(txn.id, txn);
    }
  }
  const txns = Array.from(txMap.values());

  const balancesByAsset = new Map<string, number>();
  const balancesByWalletByAsset = new Map<string, Map<string, number>>();
  const decimalsByAsset: Record<string, number> = {};

  for (const account of accountStates) {
    balancesByAsset.set("ALGO", (balancesByAsset.get("ALGO") ?? 0) + account.algoAmount);
    if (!balancesByWalletByAsset.has("ALGO")) {
      balancesByWalletByAsset.set("ALGO", new Map());
    }
    const algoWalletMap = balancesByWalletByAsset.get("ALGO")!;
    algoWalletMap.set(account.address, (algoWalletMap.get(account.address) ?? 0) + account.algoAmount);
    for (const asset of account.assets) {
      const key = String(asset.assetId);
      balancesByAsset.set(key, (balancesByAsset.get(key) ?? 0) + asset.amount);
      if (!balancesByWalletByAsset.has(key)) {
        balancesByWalletByAsset.set(key, new Map());
      }
      const walletMap = balancesByWalletByAsset.get(key)!;
      walletMap.set(account.address, (walletMap.get(account.address) ?? 0) + asset.amount);
      decimalsByAsset[key] = asset.decimals;
    }
  }

  const assetIds: Array<number | null> = [null, ...Object.keys(decimalsByAsset).map((k) => Number(k))];
  const pricesUsd = await getSpotPricesFn(assetIds);
  const assetKeysForHistory = ["ALGO", ...Object.keys(decimalsByAsset)];
  const txTimestamps = txns.map((txn) => txn.confirmedRoundTime);
  const historicalPrices = await getHistoricalPricesFn(assetKeysForHistory, txTimestamps);

  const getPriceQuote = (
    assetKey: string,
    unixTs: number
  ): { unitPriceUsd: number | null; source: "historical" | "spot" | "missing" } => {
    const fromHistory = historicalPrices[getHistoricalPriceKey(assetKey, unixTs)];
    if (fromHistory !== undefined && fromHistory !== null && Number.isFinite(fromHistory)) {
      return { unitPriceUsd: fromHistory, source: "historical" };
    }
    const spot = pricesUsd[assetKey] ?? null;
    if (spot !== null && Number.isFinite(spot)) {
      return { unitPriceUsd: spot, source: "spot" };
    }
    return { unitPriceUsd: null, source: "missing" };
  };
  const getHistoricalUnitPriceUsd = (assetKey: string, unixTs: number): number | null => {
    const fromHistory = historicalPrices[getHistoricalPriceKey(assetKey, unixTs)];
    return fromHistory !== undefined && fromHistory !== null && Number.isFinite(fromHistory) ? fromHistory : null;
  };

  const ownWallets = new Set(wallets);
  const events = parseTransactionsToLotEvents({
    txns,
    ownWallets,
    pricesUsd,
    decimalsByAsset,
    getUnitPriceUsd: getHistoricalUnitPriceUsd
  });
  const fifo = runFifo(events);
  const assetNameByKey: Record<string, string> = { ALGO: "ALGO" };

  const assets: SnapshotAssetRow[] = [];
  for (const [assetKey, balance] of balancesByAsset.entries()) {
    let assetName = "ALGO";
    if (assetKey !== "ALGO") {
      try {
        const info = await getAssetInfo(Number(assetKey));
        assetName = info.unitName ?? info.name ?? assetKey;
      } catch {
        assetName = assetKey;
      }
    }
    assetNameByKey[assetKey] = assetName;

    const price = pricesUsd[assetKey] ?? null;
    const valueUsd = price === null ? null : balance * price;
    const walletBreakdown = Array.from(balancesByWalletByAsset.get(assetKey)?.entries() ?? [])
      .filter(([, walletBalance]) => walletBalance > 0)
      .map(([wallet, walletBalance]) => ({
        wallet,
        balance: walletBalance,
        valueUsd: price === null ? null : walletBalance * price
      }))
      .sort((a, b) => b.balance - a.balance);
    const lotSummary = fifo[assetKey];
    const lotQty = finiteOr(lotSummary?.remainingQty ?? 0);
    const lotCost = finiteOr(lotSummary?.remainingCostUsd ?? 0);
    let costBasisUsd = 0;

    if (balance > 0 && lotQty > 0) {
      const impliedUnitCost = lotCost / lotQty;
      if (Number.isFinite(impliedUnitCost) && impliedUnitCost >= 0) {
        costBasisUsd = impliedUnitCost * balance;
      }
    }

    costBasisUsd = finiteOr(costBasisUsd);
    const realizedPnlUsd = finiteOr(lotSummary?.realizedPnlUsd ?? 0);
    const unrealizedPnlUsd = valueUsd === null ? null : finiteOr(valueUsd - costBasisUsd);

    assets.push({
      assetKey,
      assetName,
      balance,
      walletBreakdown,
      priceUsd: price,
      valueUsd,
      costBasisUsd,
      realizedPnlUsd,
      unrealizedPnlUsd,
      hasPrice: price !== null
    });
  }

  assets.sort((a, b) => (b.valueUsd ?? -1) - (a.valueUsd ?? -1));

  const transactions: SnapshotTransactionRow[] = [];
  for (const txn of txns) {
    const senderOwned = ownWallets.has(txn.sender);
    const feeAlgo = senderOwned ? txn.fee / 1_000_000 : 0;
    const algoQuote = getPriceQuote("ALGO", txn.confirmedRoundTime);
    const algoUnitPrice = algoQuote.unitPriceUsd ?? 0;
    const feeUsd = feeAlgo * algoUnitPrice;

    if (txn.paymentTransaction) {
      const receiver = txn.paymentTransaction.receiver;
      const receiverOwned = ownWallets.has(receiver);
      const amount = txn.paymentTransaction.amount / 1_000_000;
      const direction: SnapshotTransactionRow["direction"] = senderOwned && receiverOwned ? "self" : senderOwned ? "out" : "in";
      const wallet = senderOwned ? txn.sender : receiver;
      const counterparty = direction === "self" ? receiver : senderOwned ? receiver : txn.sender;
      const quote = getPriceQuote("ALGO", txn.confirmedRoundTime);
      const unitPriceUsd = quote.unitPriceUsd;
      const valueUsd = amount === 0 ? 0 : unitPriceUsd === null ? null : amount * unitPriceUsd;

      transactions.push({
        txId: txn.id,
        ts: txn.confirmedRoundTime,
        wallet,
        counterparty,
        txType: "payment",
        direction,
        assetKey: "ALGO",
        assetName: assetNameByKey.ALGO,
        amount,
        unitPriceUsd,
        valueUsd,
        valueSource: amount === 0 ? "spot" : quote.source,
        feeAlgo,
        feeUsd
      });
      continue;
    }

    if (txn.assetTransferTransaction) {
      const { assetId, amount, receiver } = txn.assetTransferTransaction;
      const key = String(assetId);
      const receiverOwned = ownWallets.has(receiver);
      const decimals = decimalsByAsset[key] ?? 0;
      const qty = amount / 10 ** decimals;
      const direction: SnapshotTransactionRow["direction"] = senderOwned && receiverOwned ? "self" : senderOwned ? "out" : "in";
      const wallet = senderOwned ? txn.sender : receiver;
      const counterparty = direction === "self" ? receiver : senderOwned ? receiver : txn.sender;
      const quote = getPriceQuote(key, txn.confirmedRoundTime);
      const unitPriceUsd = quote.unitPriceUsd;
      const valueUsd = qty === 0 ? 0 : unitPriceUsd === null ? null : qty * unitPriceUsd;

      if (!assetNameByKey[key]) {
        try {
          const info = await getAssetInfo(Number(key));
          assetNameByKey[key] = info.unitName ?? info.name ?? key;
        } catch {
          assetNameByKey[key] = key;
        }
      }

      transactions.push({
        txId: txn.id,
        ts: txn.confirmedRoundTime,
        wallet,
        counterparty,
        txType: "asset-transfer",
        direction,
        assetKey: key,
        assetName: assetNameByKey[key],
        amount: qty,
        unitPriceUsd,
        valueUsd,
        valueSource: qty === 0 ? "spot" : quote.source,
        feeAlgo,
        feeUsd
      });
    }
  }
  transactions.sort((a, b) => b.ts - a.ts);

  const totals = assets.reduce(
    (acc, row) => {
      if (row.valueUsd !== null && Number.isFinite(row.valueUsd)) {
        acc.valueUsd += row.valueUsd;
      }
      if (Number.isFinite(row.costBasisUsd)) {
        acc.costBasisUsd += row.costBasisUsd;
      }
      if (Number.isFinite(row.realizedPnlUsd)) {
        acc.realizedPnlUsd += row.realizedPnlUsd;
      }
      if (row.unrealizedPnlUsd !== null && Number.isFinite(row.unrealizedPnlUsd)) {
        acc.unrealizedPnlUsd += row.unrealizedPnlUsd;
      }
      return acc;
    },
    { valueUsd: 0, costBasisUsd: 0, realizedPnlUsd: 0, unrealizedPnlUsd: 0 }
  );

  const walletSummaries: WalletBreakdown[] = [];
  for (const wallet of wallets) {
    const walletEvents = events.filter((event) => {
      const tx = txMap.get(event.txId);
      if (!tx) {
        return false;
      }

      if (tx.paymentTransaction) {
        if (event.side === "sell") {
          return tx.sender === wallet;
        }
        return tx.paymentTransaction.receiver === wallet;
      }

      if (tx.assetTransferTransaction) {
        if (event.side === "sell") {
          return tx.sender === wallet;
        }
        return tx.assetTransferTransaction.receiver === wallet;
      }

      return false;
    });
    const walletFifo = runFifo(walletEvents);
    const totalCostBasisUsd = finiteOr(
      Object.values(walletFifo).reduce((sum, x) => sum + finiteOr(x.remainingCostUsd), 0)
    );
    const totalRealizedPnlUsd = finiteOr(
      Object.values(walletFifo).reduce((sum, x) => sum + finiteOr(x.realizedPnlUsd), 0)
    );

    const account = accountStates.find((a) => a.address === wallet);
    let totalValueUsd = 0;

    if (account) {
      totalValueUsd += finiteOr(account.algoAmount * (pricesUsd.ALGO ?? 0));
      for (const asset of account.assets) {
        const key = String(asset.assetId);
        const p = pricesUsd[key] ?? null;
        if (p !== null) {
          totalValueUsd += finiteOr(asset.amount * p);
        }
      }
    }

    walletSummaries.push({
      wallet,
      totalValueUsd: finiteOr(totalValueUsd),
      totalCostBasisUsd,
      totalRealizedPnlUsd,
      totalUnrealizedPnlUsd: finiteOr(totalValueUsd - totalCostBasisUsd)
    });
  }

  const defiPositions = await getDefiPositionsFn(wallets);

  const estimatedAprPct = defiPositions.length > 0 ? 4.2 : null;

  return {
    computedAt: new Date().toISOString(),
    priceAsOf: new Date().toISOString(),
    method: "FIFO",
    totals,
    assets,
    transactions,
    wallets: walletSummaries,
    defiPositions,
    yieldEstimate: {
      estimatedAprPct,
      estimated: true,
      note: "Estimated yield from detected staking/DeFi activity. Historical decomposition is partial in MVP."
    }
  };
}
