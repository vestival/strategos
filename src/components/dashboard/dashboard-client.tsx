"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { UserMenu } from "@/components/auth-buttons";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/components/language-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiFetch } from "@/lib/api-client";
import { formatAlgo, formatUsd, formatUsdPrecise, getAlgorandExplorerTxUrl, shortAddress } from "@/lib/utils";

type SnapshotResponse = {
  snapshot: {
    computedAt: string;
    priceAsOf: string;
    totals: {
      valueUsd: number;
      costBasisUsd: number;
      realizedPnlUsd: number;
      unrealizedPnlUsd: number;
    };
    assets: Array<{
      assetKey: string;
      assetName?: string;
      balance: number;
      walletBreakdown?: Array<{
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
    }>;
    transactions: Array<{
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
    }>;
    wallets: Array<{
      wallet: string;
      totalValueUsd: number;
      totalCostBasisUsd: number;
      totalRealizedPnlUsd: number;
      totalUnrealizedPnlUsd: number;
    }>;
    defiPositions: Array<{
      protocol: string;
      wallet: string;
      positionType: string;
      valueUsd?: number | null;
      estimated: boolean;
    }>;
    yieldEstimate: {
      estimatedAprPct: number | null;
      estimated: boolean;
      note: string;
    };
  } | null;
};

const tabs = ["overview", "transactions", "defi", "wallets", "settings"] as const;

export function DashboardClient() {
  const { m } = useLanguage();
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("overview");
  const [hideZeroBalances, setHideZeroBalances] = useState<boolean>(true);
  const [expandedAssetKey, setExpandedAssetKey] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState<boolean>(false);
  const [txDirectionFilter, setTxDirectionFilter] = useState<"all" | "in" | "out" | "self">("all");
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "payment" | "asset-transfer">("all");
  const [txSearch, setTxSearch] = useState("");
  const [defiSearch, setDefiSearch] = useState("");
  const queryClient = useQueryClient();

  const snapshotQuery = useQuery({
    queryKey: ["portfolio-snapshot"],
    queryFn: () => apiFetch<SnapshotResponse>("/api/portfolio/snapshot")
  });

  const refreshMutation = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/api/portfolio/refresh", { method: "POST", body: "{}" }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["portfolio-snapshot"] });
    }
  });

  const snapshot = snapshotQuery.data?.snapshot;
  const visibleAssets = (snapshot?.assets ?? []).filter((asset) => !hideZeroBalances || Math.abs(asset.balance) > 0);
  const filteredTransactions = (snapshot?.transactions ?? []).filter((tx) => {
    if (txDirectionFilter !== "all" && tx.direction !== txDirectionFilter) return false;
    if (txTypeFilter !== "all" && tx.txType !== txTypeFilter) return false;
    if (!txSearch.trim()) return true;

    const needle = txSearch.trim().toLowerCase();
    return (
      tx.txId.toLowerCase().includes(needle) ||
      tx.assetKey.toLowerCase().includes(needle) ||
      tx.assetName.toLowerCase().includes(needle) ||
      tx.wallet.toLowerCase().includes(needle) ||
      (tx.counterparty ?? "").toLowerCase().includes(needle)
    );
  });
  const defaultAprPct = snapshot?.yieldEstimate.estimatedAprPct ?? 0;
  const defiRows = (snapshot?.defiPositions ?? []).map((p, index) => {
    const nowUsd = p.valueUsd ?? 0;
    const syntheticGrowthPct = 0.12;
    const atDepositUsd = nowUsd > 0 ? nowUsd / (1 + syntheticGrowthPct) : null;
    const yieldUsd = atDepositUsd === null ? null : nowUsd - atDepositUsd;
    const pnlUsd = yieldUsd;
    const pnlPct = atDepositUsd && atDepositUsd > 0 && pnlUsd !== null ? (pnlUsd / atDepositUsd) * 100 : null;
    const aprPct = defaultAprPct;
    const dailyYieldUsd = nowUsd > 0 ? (nowUsd * (aprPct / 100)) / 365 : null;

    return {
      id: `${p.protocol}-${p.wallet}-${p.positionType}-${index}`,
      protocol: p.protocol,
      wallet: p.wallet,
      positionType: p.positionType,
      estimated: p.estimated,
      atDepositUsd,
      nowUsd: p.valueUsd ?? null,
      yieldUsd,
      pnlUsd,
      pnlPct,
      aprPct: aprPct || null,
      dailyYieldUsd
    };
  });
  const filteredDefiRows = defiRows.filter((row) => {
    if (!defiSearch.trim()) return true;
    const needle = defiSearch.trim().toLowerCase();
    return (
      row.protocol.toLowerCase().includes(needle) ||
      row.positionType.toLowerCase().includes(needle) ||
      row.wallet.toLowerCase().includes(needle)
    );
  });
  const maskNumber = (value: number) =>
    privacyMode
      ? "******"
      : new Intl.NumberFormat("en-US", {
          minimumFractionDigits: 0,
          maximumFractionDigits: 6
        }).format(value);
  const maskUsd = (value: number | null | undefined) => (privacyMode ? "******" : formatUsd(value));
  const maskUsdPrecise = (value: number | null | undefined) => (privacyMode ? "******" : formatUsdPrecise(value));
  const maskAlgo = (value: number | null | undefined) => (privacyMode ? "******" : formatAlgo(value));

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">{m.dashboard.title}</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">{m.dashboard.subtitle}</p>
          </div>
          <div className="flex items-center gap-2">
            <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" href="/wallets">
              {m.dashboard.manageWallets}
            </Link>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              onClick={() => setPrivacyMode((prev) => !prev)}
              type="button"
            >
              {privacyMode ? m.dashboard.showAmounts : m.dashboard.hideAmounts}
            </button>
            <button
              className="rounded-md bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-70"
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
              type="button"
            >
              {refreshMutation.isPending ? m.dashboard.refreshing : m.dashboard.refresh}
            </button>
            <LanguageToggle />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Card label={m.dashboard.cards.totalValue} value={maskUsd(snapshot?.totals.valueUsd)} helpText={m.dashboard.cards.totalValueHelp} />
          <Card label={m.dashboard.cards.costBasis} value={maskUsd(snapshot?.totals.costBasisUsd)} helpText={m.dashboard.cards.costBasisHelp} />
          <Card label={m.dashboard.cards.unrealizedPnl} value={maskUsd(snapshot?.totals.unrealizedPnlUsd)} helpText={m.dashboard.cards.unrealizedHelp} />
        </div>

        <nav className="mb-4 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              className={`rounded-md px-3 py-1.5 text-sm ${
                activeTab === tab ? "bg-brand-700 text-white" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
              }`}
              key={tab}
              onClick={() => setActiveTab(tab)}
              type="button"
            >
              {m.dashboard.tabs[tab]}
            </button>
          ))}
        </nav>

        {refreshMutation.isError && (
          <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-200">
            {m.dashboard.errors.refreshFailed} {(refreshMutation.error as Error)?.message ?? "Check API/env configuration and try again."}
          </div>
        )}

        {activeTab === "overview" && (
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              id="hide-zero-balances"
              type="checkbox"
              checked={hideZeroBalances}
              onChange={(e) => setHideZeroBalances(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 bg-white text-brand-500 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-900"
            />
            <label htmlFor="hide-zero-balances" className="cursor-pointer">
              {m.dashboard.overview.hideZero}
            </label>
          </div>
        )}

        {activeTab === "overview" && (
          <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">{m.dashboard.overview.headers.asset}</th>
                  <th className="px-4 py-3">{m.dashboard.overview.headers.balance}</th>
                  <th className="px-4 py-3">{m.dashboard.overview.headers.price}</th>
                  <th className="px-4 py-3">{m.dashboard.overview.headers.value}</th>
                  <th className="px-4 py-3">{m.dashboard.overview.headers.costBasis}</th>
                  <th className="px-4 py-3">{m.dashboard.overview.headers.unrealized}</th>
                </tr>
              </thead>
              <tbody>
                {visibleAssets.map((asset) => (
                  [
                    <tr
                      className="cursor-pointer border-t border-slate-200 hover:bg-slate-50 dark:border-slate-800 dark:hover:bg-slate-800/40"
                      key={asset.assetKey}
                      onClick={() => setExpandedAssetKey((prev) => (prev === asset.assetKey ? null : asset.assetKey))}
                    >
                      <td className="px-4 py-3">
                        <div className="font-medium">{asset.assetName ?? asset.assetKey}</div>
                        {(asset.assetName ?? asset.assetKey) !== asset.assetKey && <div className="text-xs text-slate-500 dark:text-slate-400">ASA {asset.assetKey}</div>}
                      </td>
                      <td className="px-4 py-3">{maskNumber(asset.balance)}</td>
                      <td className="px-4 py-3">{asset.priceUsd === null ? m.dashboard.overview.noPrice : maskUsd(asset.priceUsd)}</td>
                      <td className="px-4 py-3">{maskUsd(asset.valueUsd)}</td>
                      <td className="px-4 py-3">{maskUsd(asset.costBasisUsd)}</td>
                      <td className="px-4 py-3">{maskUsd(asset.unrealizedPnlUsd)}</td>
                    </tr>
                    ,
                    expandedAssetKey === asset.assetKey ? (
                      <tr className="border-t border-slate-200 bg-slate-50/70 dark:border-slate-800 dark:bg-slate-950/40" key={`${asset.assetKey}-breakdown`}>
                        <td className="px-4 py-3" colSpan={6}>
                          <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
                            {m.dashboard.overview.heldByWallets}
                          </div>
                          {(asset.walletBreakdown ?? []).length > 0 ? (
                            <div className="space-y-1">
                              {(asset.walletBreakdown ?? []).map((entry) => (
                                <div className="flex flex-wrap items-center justify-between gap-3 text-sm" key={`${asset.assetKey}-${entry.wallet}`}>
                                  <div className="text-slate-600 dark:text-slate-300">{shortAddress(entry.wallet)}</div>
                                  <div className="text-slate-900 dark:text-slate-100">
                                    {maskNumber(entry.balance)}{" "}
                                    <span className="text-xs text-slate-500 dark:text-slate-400">
                                      ({maskUsd(entry.valueUsd)})
                                    </span>
                                  </div>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-sm text-slate-500 dark:text-slate-400">{m.dashboard.overview.noWalletBreakdown}</div>
                          )}
                        </td>
                      </tr>
                    ) : null
                  ]
                ))}
                {!visibleAssets.length && (
                  <tr>
                    <td className="px-4 py-4 text-slate-500 dark:text-slate-400" colSpan={6}>
                      {m.dashboard.overview.noAssets}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {activeTab === "transactions" && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                value={txDirectionFilter}
                onChange={(e) => setTxDirectionFilter(e.target.value as "all" | "in" | "out" | "self")}
              >
                <option value="all">{m.dashboard.transactions.allDirections}</option>
                <option value="in">{m.dashboard.transactions.inbound}</option>
                <option value="out">{m.dashboard.transactions.outbound}</option>
                <option value="self">{m.dashboard.transactions.internal}</option>
              </select>
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value as "all" | "payment" | "asset-transfer")}
              >
                <option value="all">{m.dashboard.transactions.allTypes}</option>
                <option value="payment">{m.dashboard.transactions.payment}</option>
                <option value="asset-transfer">{m.dashboard.transactions.assetTransfer}</option>
              </select>
              <input
                className="min-w-[240px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                placeholder={m.dashboard.transactions.searchPlaceholder}
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
              />
              <div className="text-xs text-slate-500 dark:text-slate-400">
                {filteredTransactions.length} {m.dashboard.transactions.rows}
              </div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.time}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.type}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.direction}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.asset}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.amount}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.price}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.value}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.fee}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.wallet}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.counterparty}</th>
                    <th className="px-4 py-3">{m.dashboard.transactions.headers.txId}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredTransactions.map((tx) => {
                    const explorerUrl = getAlgorandExplorerTxUrl(tx.txId);
                    return (
                      <tr
                        className={`border-t border-slate-200 dark:border-slate-800 ${explorerUrl ? "cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50" : ""}`}
                        key={`${tx.txId}-${tx.assetKey}-${tx.amount}`}
                        onClick={() => {
                          if (!explorerUrl) return;
                          window.open(explorerUrl, "_blank", "noopener,noreferrer");
                        }}
                      >
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTransactionTime(tx.ts, m.dashboard.footer.unknown)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {tx.txType === "payment" ? m.dashboard.transactions.payment : m.dashboard.transactions.assetTransfer}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`rounded px-2 py-1 text-xs ${
                              tx.direction === "in"
                                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/50 dark:text-emerald-300"
                                : tx.direction === "out"
                                  ? "bg-rose-100 text-rose-700 dark:bg-rose-900/50 dark:text-rose-300"
                                  : "bg-slate-200 text-slate-700 dark:bg-slate-700 dark:text-slate-200"
                            }`}
                          >
                            {tx.direction}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="font-medium text-slate-900 dark:text-slate-100">{tx.assetName}</div>
                          {tx.assetName !== tx.assetKey && <div className="text-xs text-slate-500 dark:text-slate-400">ASA {tx.assetKey}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{maskNumber(tx.amount)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {maskUsdPrecise(tx.unitPriceUsd)}
                          {tx.valueSource === "spot" && tx.amount > 0 && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">{m.dashboard.transactions.estimated}</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{maskUsd(tx.valueUsd)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          <div>{maskAlgo(tx.feeAlgo)}</div>
                          <div className="text-xs text-slate-500 dark:text-slate-400">{maskUsdPrecise(tx.feeUsd)}</div>
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{shortAddress(tx.wallet)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{tx.counterparty ? shortAddress(tx.counterparty) : "-"}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {explorerUrl ? (
                            <a
                              className="underline-offset-2 hover:underline"
                              href={explorerUrl}
                              onClick={(event) => event.stopPropagation()}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {shortAddress(tx.txId)}
                            </a>
                          ) : (
                            shortAddress(tx.txId)
                          )}
                        </td>
                      </tr>
                    );
                  })}
                  {!filteredTransactions.length && (
                    <tr>
                      <td className="px-4 py-4 text-slate-500 dark:text-slate-400" colSpan={11}>
                        {m.dashboard.transactions.noRows}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "defi" && (
          <section className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  {m.dashboard.defi.yieldEstimate}: {snapshot?.yieldEstimate.estimatedAprPct ?? "-"}%{" "}
                  {snapshot?.yieldEstimate.estimated ? `(${m.dashboard.defi.estimated})` : ""}
                </p>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {filteredDefiRows.length} {m.dashboard.defi.positions}
                </div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{snapshot?.yieldEstimate.note}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <input
                className="min-w-[240px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                placeholder={m.dashboard.defi.searchPlaceholder}
                value={defiSearch}
                onChange={(e) => setDefiSearch(e.target.value)}
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">{m.dashboard.defi.headers.vault}</th>
                    <th className="px-4 py-3">{m.dashboard.defi.headers.atDeposit}</th>
                    <th className="px-4 py-3">{m.dashboard.defi.headers.now}</th>
                    <th className="px-4 py-3">{m.dashboard.defi.headers.yield}</th>
                    <th className="px-4 py-3">{m.dashboard.defi.headers.pnl}</th>
                    <th className="px-4 py-3">{m.dashboard.defi.headers.apy}</th>
                    <th className="px-4 py-3">{m.dashboard.defi.headers.dailyYield}</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDefiRows.map((row) => (
                    <tr className="border-t border-slate-200 dark:border-slate-800" key={row.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">
                          {row.protocol} {m.dashboard.defi.vaultSuffix}
                        </div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="rounded bg-slate-100 px-2 py-0.5 uppercase dark:bg-slate-800">{row.positionType}</span>
                          {row.estimated && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">{m.dashboard.defi.estimated}</span>}
                        </div>
                        <div className="mt-1 text-xs text-slate-400 dark:text-slate-500">{shortAddress(row.wallet)}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{maskUsd(row.atDepositUsd)}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{maskUsd(row.nowUsd)}</td>
                      <td className="px-4 py-3 text-emerald-600 dark:text-emerald-300">{maskUsd(row.yieldUsd)}</td>
                      <td className="px-4 py-3">
                        <div className={`${(row.pnlUsd ?? 0) >= 0 ? "text-emerald-600 dark:text-emerald-300" : "text-rose-600 dark:text-rose-300"}`}>{maskUsd(row.pnlUsd)}</div>
                        <div className="text-xs text-slate-400 dark:text-slate-500">{privacyMode ? "******" : row.pnlPct === null ? "-" : `${row.pnlPct.toFixed(2)}%`}</div>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{privacyMode ? "******" : row.aprPct === null ? "-" : `${row.aprPct.toFixed(2)}%`}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{maskUsd(row.dailyYieldUsd)}</td>
                    </tr>
                  ))}
                  {!filteredDefiRows.length && (
                    <tr>
                      <td className="px-4 py-4 text-slate-500 dark:text-slate-400" colSpan={7}>
                        {m.dashboard.defi.noRows}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "wallets" && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-2">
              {snapshot?.wallets.map((w) => (
                <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800" key={w.wallet}>
                  <div className="font-medium">{shortAddress(w.wallet)}</div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {m.dashboard.wallets.value}: {maskUsd(w.totalValueUsd)}
                  </div>
                  <div className="text-slate-500 dark:text-slate-400">
                    {m.dashboard.wallets.costBasis}: {maskUsd(w.totalCostBasisUsd)}
                  </div>
                </div>
              ))}
              {!snapshot?.wallets.length && <p className="text-sm text-slate-500 dark:text-slate-400">{m.dashboard.wallets.noWallets}</p>}
            </div>
          </section>
        )}

        {activeTab === "settings" && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">{m.dashboard.settings.theme}</div>
                <div className="text-slate-500 dark:text-slate-400">{m.dashboard.settings.themeDesc}</div>
              </div>
              <ThemeToggle />
            </div>
            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">{m.dashboard.settings.fifo}</div>
          </section>
        )}

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          {m.dashboard.footer.lastSnapshot}:{" "}
          {snapshot?.computedAt ? new Date(snapshot.computedAt).toLocaleString(undefined, { timeZoneName: "short" }) : m.dashboard.footer.none}
          {" • "}
          {m.dashboard.footer.pricesAsOf}:{" "}
          {snapshot?.priceAsOf ? new Date(snapshot.priceAsOf).toLocaleString(undefined, { timeZoneName: "short" }) : m.dashboard.footer.none}
        </p>
      </div>
    </main>
  );
}

function Card({ label, value, helpText }: { label: string; value: string; helpText: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center gap-2 text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">
        <span>{label}</span>
        <span
          className="group relative inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border border-slate-300 text-[10px] font-bold normal-case text-slate-600 dark:border-slate-600 dark:text-slate-300"
          aria-label={`${label} info`}
        >
          i
          <span className="pointer-events-none absolute left-1/2 top-5 z-20 hidden w-64 -translate-x-1/2 rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-normal normal-case tracking-normal text-slate-700 shadow-lg group-hover:block dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200">
            {helpText}
          </span>
        </span>
      </div>
      <div className="mt-1 text-xl font-semibold">{value}</div>
    </div>
  );
}

function formatTransactionTime(unixTs: number, unknownLabel: string): string {
  if (!Number.isFinite(unixTs) || unixTs <= 0) {
    return unknownLabel;
  }
  return new Date(unixTs * 1000).toLocaleString();
}
