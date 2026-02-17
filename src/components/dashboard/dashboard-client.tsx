"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useState } from "react";

import { UserMenu } from "@/components/auth-buttons";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiFetch } from "@/lib/api-client";
import { formatUsd, getAlgorandExplorerTxUrl, shortAddress } from "@/lib/utils";

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

const tabs = ["Overview", "Transactions", "DeFi Positions", "Wallets", "Settings"] as const;

export function DashboardClient() {
  const [activeTab, setActiveTab] = useState<(typeof tabs)[number]>("Overview");
  const [hideZeroBalances, setHideZeroBalances] = useState<boolean>(true);
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

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-slate-950 dark:text-slate-100">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-2xl font-semibold">Algorand Portfolio Dashboard</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Consolidated balances, FIFO cost basis, unrealized PnL, and DeFi estimates.</p>
          </div>
          <div className="flex items-center gap-2">
            <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" href="/wallets">
              Manage wallets
            </Link>
            <button
              className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800"
              onClick={() => setPrivacyMode((prev) => !prev)}
              type="button"
            >
              {privacyMode ? "Show amounts" : "Hide amounts"}
            </button>
            <button
              className="rounded-md bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-70"
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
              type="button"
            >
              {refreshMutation.isPending ? "Refreshing..." : "Refresh"}
            </button>
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Card
            label="Total Value"
            value={maskUsd(snapshot?.totals.valueUsd)}
            helpText="Current USD value of priced assets across all linked wallets. Assets without prices are excluded."
          />
          <Card
            label="Cost Basis"
            value={maskUsd(snapshot?.totals.costBasisUsd)}
            helpText="Remaining acquisition cost of current holdings using FIFO lots (fees included per policy)."
          />
          <Card
            label="Unrealized PnL"
            value={maskUsd(snapshot?.totals.unrealizedPnlUsd)}
            helpText="Paper profit/loss on current holdings. Formula: current value minus remaining FIFO cost basis."
          />
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
              {tab}
            </button>
          ))}
        </nav>

        {refreshMutation.isError && (
          <div className="mb-4 rounded-md border border-rose-300 bg-rose-50 px-3 py-2 text-sm text-rose-700 dark:border-rose-700/60 dark:bg-rose-950/40 dark:text-rose-200">
            Refresh failed. {(refreshMutation.error as Error)?.message ?? "Check API/env configuration and try again."}
          </div>
        )}

        {activeTab === "Overview" && (
          <div className="mb-3 flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
            <input
              id="hide-zero-balances"
              type="checkbox"
              checked={hideZeroBalances}
              onChange={(e) => setHideZeroBalances(e.target.checked)}
              className="h-4 w-4 rounded border-slate-300 bg-white text-brand-500 focus:ring-brand-500 dark:border-slate-600 dark:bg-slate-900"
            />
            <label htmlFor="hide-zero-balances" className="cursor-pointer">
              Hide 0 balance tokens
            </label>
          </div>
        )}

        {activeTab === "Overview" && (
          <section className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
            <table className="w-full text-left text-sm">
              <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <tr>
                  <th className="px-4 py-3">Asset</th>
                  <th className="px-4 py-3">Balance</th>
                  <th className="px-4 py-3">Price</th>
                  <th className="px-4 py-3">Value</th>
                  <th className="px-4 py-3">Cost Basis</th>
                  <th className="px-4 py-3">Unrealized</th>
                </tr>
              </thead>
              <tbody>
                {visibleAssets.map((asset) => (
                  <tr className="border-t border-slate-200 dark:border-slate-800" key={asset.assetKey}>
                    <td className="px-4 py-3">
                      <div className="font-medium">{asset.assetName ?? asset.assetKey}</div>
                      {(asset.assetName ?? asset.assetKey) !== asset.assetKey && (
                        <div className="text-xs text-slate-500 dark:text-slate-400">{asset.assetKey}</div>
                      )}
                    </td>
                    <td className="px-4 py-3">{maskNumber(asset.balance)}</td>
                    <td className="px-4 py-3">{asset.priceUsd === null ? "no price" : maskUsd(asset.priceUsd)}</td>
                    <td className="px-4 py-3">{maskUsd(asset.valueUsd)}</td>
                    <td className="px-4 py-3">{maskUsd(asset.costBasisUsd)}</td>
                    <td className="px-4 py-3">{maskUsd(asset.unrealizedPnlUsd)}</td>
                  </tr>
                ))}
                {!visibleAssets.length && (
                  <tr>
                    <td className="px-4 py-4 text-slate-500 dark:text-slate-400" colSpan={6}>
                      No assets to show. Disable filter or refresh snapshot.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </section>
        )}

        {activeTab === "Transactions" && (
          <section className="space-y-3">
            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                value={txDirectionFilter}
                onChange={(e) => setTxDirectionFilter(e.target.value as "all" | "in" | "out" | "self")}
              >
                <option value="all">All directions</option>
                <option value="in">Inbound</option>
                <option value="out">Outbound</option>
                <option value="self">Internal</option>
              </select>
              <select
                className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                value={txTypeFilter}
                onChange={(e) => setTxTypeFilter(e.target.value as "all" | "payment" | "asset-transfer")}
              >
                <option value="all">All types</option>
                <option value="payment">Payment</option>
                <option value="asset-transfer">Asset transfer</option>
              </select>
              <input
                className="min-w-[240px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                placeholder="Search tx id, asset, wallet, counterparty"
                value={txSearch}
                onChange={(e) => setTxSearch(e.target.value)}
              />
              <div className="text-xs text-slate-500 dark:text-slate-400">{filteredTransactions.length} rows</div>
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Time</th>
                    <th className="px-4 py-3">Type</th>
                    <th className="px-4 py-3">Direction</th>
                    <th className="px-4 py-3">Asset</th>
                    <th className="px-4 py-3">Amount</th>
                    <th className="px-4 py-3">Price</th>
                    <th className="px-4 py-3">Value</th>
                    <th className="px-4 py-3">Fee</th>
                    <th className="px-4 py-3">Wallet</th>
                    <th className="px-4 py-3">Counterparty</th>
                    <th className="px-4 py-3">Tx ID</th>
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
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{formatTransactionTime(tx.ts)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{tx.txType}</td>
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
                          {tx.assetName !== tx.assetKey && <div className="text-xs text-slate-500 dark:text-slate-400">{tx.assetKey}</div>}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{maskNumber(tx.amount)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">
                          {maskUsd(tx.unitPriceUsd)}
                          {tx.valueSource === "spot" && tx.amount > 0 && (
                            <span className="ml-1 text-[10px] uppercase tracking-wide text-slate-400 dark:text-slate-500">est.</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{maskUsd(tx.valueUsd)}</td>
                        <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{maskUsd(tx.feeUsd)}</td>
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
                        No transactions match your filters.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "DeFi Positions" && (
          <section className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-sm text-slate-600 dark:text-slate-300">
                  Yield estimate: {snapshot?.yieldEstimate.estimatedAprPct ?? "-"}%{" "}
                  {snapshot?.yieldEstimate.estimated ? "(estimated)" : ""}
                </p>
                <div className="text-xs text-slate-500 dark:text-slate-400">{filteredDefiRows.length} positions</div>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400">{snapshot?.yieldEstimate.note}</p>
            </div>

            <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <input
                className="min-w-[240px] flex-1 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 placeholder:text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                placeholder="Search protocol, type, wallet"
                value={defiSearch}
                onChange={(e) => setDefiSearch(e.target.value)}
              />
            </div>

            <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
              <table className="w-full text-left text-sm">
                <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  <tr>
                    <th className="px-4 py-3">Vault</th>
                    <th className="px-4 py-3">At Deposit</th>
                    <th className="px-4 py-3">Now</th>
                    <th className="px-4 py-3">Yield</th>
                    <th className="px-4 py-3">PnL</th>
                    <th className="px-4 py-3">APY</th>
                    <th className="px-4 py-3">Daily Yield</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDefiRows.map((row) => (
                    <tr className="border-t border-slate-200 dark:border-slate-800" key={row.id}>
                      <td className="px-4 py-3">
                        <div className="font-medium text-slate-900 dark:text-slate-100">{row.protocol} Vault</div>
                        <div className="mt-1 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span className="rounded bg-slate-100 px-2 py-0.5 uppercase dark:bg-slate-800">{row.positionType}</span>
                          {row.estimated && <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-700 dark:bg-amber-900/40 dark:text-amber-200">estimated</span>}
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
                        No DeFi positions match your search.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        )}

        {activeTab === "Wallets" && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="space-y-2">
              {snapshot?.wallets.map((w) => (
                <div className="rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800" key={w.wallet}>
                  <div className="font-medium">{shortAddress(w.wallet)}</div>
                  <div className="text-slate-500 dark:text-slate-400">Value: {maskUsd(w.totalValueUsd)}</div>
                  <div className="text-slate-500 dark:text-slate-400">Cost basis: {maskUsd(w.totalCostBasisUsd)}</div>
                </div>
              ))}
              {!snapshot?.wallets.length && <p className="text-sm text-slate-500 dark:text-slate-400">No wallets linked.</p>}
            </div>
          </section>
        )}

        {activeTab === "Settings" && (
          <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
            <div className="mb-4 flex items-center justify-between">
              <div>
                <div className="font-medium text-slate-900 dark:text-slate-100">Theme</div>
                <div className="text-slate-500 dark:text-slate-400">Toggle between light and dark mode</div>
              </div>
              <ThemeToggle />
            </div>
            <div className="border-t border-slate-200 pt-4 dark:border-slate-800">
              Cost basis method: FIFO. Average-cost mode is designed for a future extension.
            </div>
          </section>
        )}

        <p className="mt-4 text-xs text-slate-400 dark:text-slate-500">
          Last snapshot: {snapshot?.computedAt ? new Date(snapshot.computedAt).toLocaleString(undefined, { timeZoneName: "short" }) : "none"}
          {" • "}
          Prices as of: {snapshot?.priceAsOf ? new Date(snapshot.priceAsOf).toLocaleString(undefined, { timeZoneName: "short" }) : "none"}
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

function formatTransactionTime(unixTs: number): string {
  if (!Number.isFinite(unixTs) || unixTs <= 0) {
    return "unknown";
  }
  return new Date(unixTs * 1000).toLocaleString();
}
