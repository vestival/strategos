"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { signOut } from "next-auth/react";
import { Fragment, useEffect, useMemo, useState } from "react";

import { UserMenu } from "@/components/auth-buttons";
import { LanguageToggle } from "@/components/language-toggle";
import { useLanguage } from "@/components/language-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { apiFetch } from "@/lib/api-client";
import {
  alignSeriesByTimestamp,
  buildPerWalletAssetBalanceSeries,
  buildPerWalletValueSeries,
  normalizeSeriesToUtcDailyClose,
  sumAlignedSeries,
  type WalletSeries
} from "@/lib/portfolio/wallet-analytics";
import { computePositionAtDepositUsd } from "@/lib/defi/metrics";
import { formatAlgo, formatUsd, formatUsdPrecise, getAlgorandExplorerTxUrl, shortAddress } from "@/lib/utils";

type PriceSource = "configured" | "coingecko" | "defillama" | "dexscreener" | "cache" | "missing";
type PriceConfidence = "high" | "medium" | "low";

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
      assetId?: number | null;
      assetKey: string;
      assetName?: string;
      balance: number;
      walletBreakdown?: Array<{
        wallet: string;
        balance: number;
        valueUsd: number | null;
      }>;
      priceUsd: number | null;
      priceSource: PriceSource;
      priceConfidence: PriceConfidence;
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
      unitPriceSource: PriceSource;
      unitPriceConfidence: PriceConfidence;
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
      assetId?: number | null;
      amount?: number;
      valueUsd?: number | null;
      estimated: boolean;
      meta?: Record<string, unknown>;
    }>;
    yieldEstimate: {
      estimatedAprPct: number | null;
      estimated: boolean;
      note: string;
    };
  } | null;
};

type DashboardTab = "overview" | "transactions" | "defi" | "walletAnalytics" | "settings";
const tabs = ["overview", "transactions", "defi", "walletAnalytics"] as const;
const historyRanges = ["7d", "30d", "90d", "max"] as const;
type HistoryRange = (typeof historyRanges)[number];
type AnalyticsMetric = "value" | "balance";
type AnalyticsMode = "aggregate" | "perWallet";
const ALL_WALLETS_SCOPE = "__all_wallets__";

export function DashboardClient() {
  const { m } = useLanguage();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [activeTab, setActiveTab] = useState<DashboardTab>("overview");
  const [hideZeroBalances, setHideZeroBalances] = useState<boolean>(true);
  const [hideNoPriceTokens, setHideNoPriceTokens] = useState<boolean>(false);
  const [expandedAssetKey, setExpandedAssetKey] = useState<string | null>(null);
  const [privacyMode, setPrivacyMode] = useState<boolean>(false);
  const [txDirectionFilter, setTxDirectionFilter] = useState<"all" | "in" | "out" | "self">("all");
  const [txTypeFilter, setTxTypeFilter] = useState<"all" | "payment" | "asset-transfer">("all");
  const [txSearch, setTxSearch] = useState("");
  const [defiSearch, setDefiSearch] = useState("");
  const [expandedDefiRowId, setExpandedDefiRowId] = useState<string | null>(null);
  const [historyRange, setHistoryRange] = useState<HistoryRange>("30d");
  const [analyticsRange, setAnalyticsRange] = useState<HistoryRange>("30d");
  const [analyticsMetric, setAnalyticsMetric] = useState<AnalyticsMetric>("value");
  const [analyticsMode, setAnalyticsMode] = useState<AnalyticsMode>("aggregate");
  const [analyticsAssetKey, setAnalyticsAssetKey] = useState<string>("ALGO");
  const [selectedWallets, setSelectedWallets] = useState<string[]>([]);
  const [selectedScopeWallet, setSelectedScopeWallet] = useState<string>(ALL_WALLETS_SCOPE);
  const queryClient = useQueryClient();

  useEffect(() => {
    const tab = searchParams.get("tab");
    if (tab === "settings") {
      setActiveTab("settings");
      return;
    }
    if (tab === "transactions") {
      setActiveTab("transactions");
      return;
    }
    if (tab === "defi") {
      setActiveTab("defi");
      return;
    }
    if (tab === "wallet-analytics") {
      setActiveTab("walletAnalytics");
      return;
    }
    setActiveTab("overview");
  }, [searchParams]);

  const setTabAndUrl = (tab: DashboardTab) => {
    setActiveTab(tab);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === "overview") {
      params.delete("tab");
    } else if (tab === "transactions") {
      params.set("tab", "transactions");
    } else if (tab === "defi") {
      params.set("tab", "defi");
    } else if (tab === "walletAnalytics") {
      params.set("tab", "wallet-analytics");
    } else if (tab === "settings") {
      params.set("tab", "settings");
    }

    const nextQuery = params.toString();
    router.replace((nextQuery ? `${pathname}?${nextQuery}` : pathname) as never, { scroll: false });
  };

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
  const deleteAccountMutation = useMutation({
    mutationFn: () => apiFetch<{ ok: boolean }>("/api/account", { method: "DELETE" }),
    onSuccess: async () => {
      await signOut({ callbackUrl: "/" });
    }
  });

  const snapshot = snapshotQuery.data?.snapshot;
  const availableWallets = useMemo(
    () => snapshot?.wallets.map((wallet) => wallet.wallet) ?? [],
    [snapshot?.wallets]
  );

  useEffect(() => {
    if (!availableWallets.length) {
      setSelectedWallets([]);
      return;
    }

    setSelectedWallets((previous) => {
      const stillValid = previous.filter((wallet) => availableWallets.includes(wallet));
      return stillValid.length > 0 ? stillValid : availableWallets;
    });
  }, [availableWallets]);

  useEffect(() => {
    if (!availableWallets.length) {
      setSelectedScopeWallet(ALL_WALLETS_SCOPE);
      return;
    }
    if (selectedScopeWallet === ALL_WALLETS_SCOPE) return;
    if (!availableWallets.includes(selectedScopeWallet)) {
      setSelectedScopeWallet(ALL_WALLETS_SCOPE);
    }
  }, [availableWallets, selectedScopeWallet]);

  const availableAssets = useMemo(
    () =>
      (snapshot?.assets ?? []).map((asset) => ({
        key: asset.assetKey,
        label: asset.assetName ?? asset.assetKey
      })),
    [snapshot?.assets]
  );

  useEffect(() => {
    if (!availableAssets.length) return;
    if (!availableAssets.some((asset) => asset.key === analyticsAssetKey)) {
      setAnalyticsAssetKey(availableAssets[0]?.key ?? "ALGO");
    }
  }, [availableAssets, analyticsAssetKey]);

  const scopeOptions = useMemo(
    () => [
      { id: ALL_WALLETS_SCOPE, name: m.dashboard.scope?.allWallets ?? "All wallets" },
      ...availableWallets.map((wallet) => ({ id: wallet, name: shortAddress(wallet) }))
    ],
    [availableWallets, m.dashboard.scope?.allWallets]
  );

  const scopedWallets = useMemo(() => {
    if (selectedScopeWallet === ALL_WALLETS_SCOPE) {
      return availableWallets;
    }
    if (!availableWallets.includes(selectedScopeWallet)) {
      return availableWallets;
    }
    return [selectedScopeWallet];
  }, [availableWallets, selectedScopeWallet]);

  const scopedWalletSet = useMemo(() => new Set(scopedWallets), [scopedWallets]);

  const scopedAssets = useMemo(
    () =>
      (snapshot?.assets ?? []).map((asset) => {
        const walletBreakdown = (asset.walletBreakdown ?? []).filter((entry) => scopedWalletSet.has(entry.wallet));
        const scopedBalance = walletBreakdown.reduce((sum, entry) => sum + entry.balance, 0);
        const scopedValue = walletBreakdown.some((entry) => entry.valueUsd !== null)
          ? walletBreakdown.reduce((sum, entry) => sum + (entry.valueUsd ?? 0), 0)
          : asset.priceUsd === null
            ? null
            : scopedBalance * asset.priceUsd;
        const ratio = asset.balance > 0 ? scopedBalance / asset.balance : 0;
        return {
          ...asset,
          balance: scopedBalance,
          valueUsd: scopedValue,
          costBasisUsd: asset.costBasisUsd * ratio,
          unrealizedPnlUsd: scopedValue === null ? null : scopedValue - asset.costBasisUsd * ratio,
          walletBreakdown
        };
      }),
    [scopedWalletSet, snapshot?.assets]
  );

  const scopedTotals = useMemo(
    () =>
      scopedAssets.reduce(
        (acc, asset) => {
          if (asset.balance <= 0) return acc;
          if (asset.valueUsd !== null) {
            acc.valueUsd += asset.valueUsd;
          }
          acc.costBasisUsd += asset.costBasisUsd;
          if (asset.unrealizedPnlUsd !== null) {
            acc.unrealizedPnlUsd += asset.unrealizedPnlUsd;
          }
          return acc;
        },
        { valueUsd: 0, costBasisUsd: 0, unrealizedPnlUsd: 0 }
      ),
    [scopedAssets]
  );

  const scopedTransactions = useMemo(
    () => (snapshot?.transactions ?? []).filter((tx) => scopedWalletSet.has(tx.wallet)),
    [scopedWalletSet, snapshot?.transactions]
  );

  const historyQuery = useQuery({
    queryKey: ["portfolio-history", [...scopedWallets].sort().join(","), snapshot?.computedAt],
    queryFn: async () => {
      const params = new URLSearchParams();
      for (const wallet of scopedWallets) {
        params.append("wallet", wallet);
      }
      const query = params.toString();
      return apiFetch<{ history: Array<{ ts: string; valueUsd: number }> }>(
        `/api/portfolio/history${query ? `?${query}` : ""}`
      );
    },
    enabled: Boolean(snapshot)
  });

  const historySeries = useMemo(() => historyQuery.data?.history ?? [], [historyQuery.data?.history]);

  const filteredHistory = filterHistoryByRange(historySeries, historyRange);
  const historyStartValue = filteredHistory[0]?.valueUsd ?? null;
  const historyEndValue = filteredHistory[filteredHistory.length - 1]?.valueUsd ?? null;
  const historyDeltaUsd = historyStartValue === null || historyEndValue === null ? null : historyEndValue - historyStartValue;
  const historyDeltaPct =
    historyStartValue === null || historyEndValue === null || historyStartValue === 0
      ? null
      : ((historyEndValue - historyStartValue) / historyStartValue) * 100;
  const visibleAssets = scopedAssets.filter((asset) => {
    if (hideZeroBalances && Math.abs(asset.balance) <= 0) {
      return false;
    }
    if (hideNoPriceTokens && !asset.hasPrice) {
      return false;
    }
    return true;
  });
  const filteredTransactions = scopedTransactions.filter((tx) => {
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
  const algoSpotPriceUsd = snapshot?.assets.find((asset) => asset.assetKey === "ALGO")?.priceUsd ?? null;
  const basisByAssetId = useMemo(() => {
    const map = new Map<number, { assetId: number | null; balance: number; costBasisUsd: number | null }>();
    for (const asset of snapshot?.assets ?? []) {
      if (asset.assetId === null || asset.assetId === undefined) {
        continue;
      }
      map.set(asset.assetId, {
        assetId: asset.assetId,
        balance: asset.balance,
        costBasisUsd: asset.costBasisUsd
      });
    }
    return map;
  }, [snapshot?.assets]);
  const defiRows = (snapshot?.defiPositions ?? [])
    .filter((position) => scopedWalletSet.has(position.wallet))
    .map((p, index) => {
    const nowUsd = p.valueUsd ?? 0;
    const aprPct = defaultAprPct;
    const dailyYieldUsd = nowUsd > 0 ? (nowUsd * (aprPct / 100)) / 365 : null;
    const componentInputs: Array<{ assetId: number | null; amount: number }> = [];

    const metaRecord = p.meta && typeof p.meta === "object" ? (p.meta as Record<string, unknown>) : null;
    const metaComponents = Array.isArray(metaRecord?.components)
      ? metaRecord.components
          .map((component, componentIndex) => {
            if (!component || typeof component !== "object") {
              return null;
            }
            const record = component as Record<string, unknown>;
            const amount = typeof record.amount === "number" && Number.isFinite(record.amount) ? record.amount : null;
            if (amount === null || amount <= 0) {
              return null;
            }
            const label = typeof record.label === "string" && record.label ? record.label : m.dashboard.defi.unknownAsset;
            const assetId = typeof record.assetId === "number" && Number.isInteger(record.assetId) ? record.assetId : null;
            const valueUsd = typeof record.valueUsd === "number" && Number.isFinite(record.valueUsd) ? record.valueUsd : null;
            componentInputs.push({
              assetId,
              amount
            });
            return {
              key: `${assetId ?? "unknown"}-${p.wallet}-${index}-meta-${componentIndex}`,
              label,
              assetId,
              amount,
              valueUsd,
              valueAlgo: valueUsd !== null && algoSpotPriceUsd ? valueUsd / algoSpotPriceUsd : null
            };
          })
          .filter((component): component is {
            key: string;
            label: string;
            assetId: number | null;
            amount: number;
            valueUsd: number | null;
            valueAlgo: number | null;
          } => component !== null)
      : [];

    const assetLabel =
      p.meta && typeof p.meta === "object" && typeof p.meta.assetLabel === "string" ? p.meta.assetLabel : p.assetId ? `ASA ${p.assetId}` : m.dashboard.defi.unknownAsset;
    const inferredSingleToken =
      p.amount && p.amount > 0
        ? [
            {
              key: `${p.assetId ?? "unknown"}-${p.wallet}-${index}`,
              label: assetLabel,
              assetId: p.assetId ?? null,
              amount: p.amount,
              valueUsd: p.valueUsd ?? null,
              valueAlgo: p.valueUsd !== null && p.valueUsd !== undefined && algoSpotPriceUsd ? p.valueUsd / algoSpotPriceUsd : null
            }
          ]
        : [];
    if (componentInputs.length === 0 && p.assetId && p.amount && p.amount > 0) {
      componentInputs.push({
        assetId: p.assetId,
        amount: p.amount
      });
    }
    const atDepositUsd = computePositionAtDepositUsd(componentInputs, basisByAssetId);
    const yieldUsd = atDepositUsd === null || p.valueUsd === null || p.valueUsd === undefined ? null : p.valueUsd - atDepositUsd;
    const pnlUsd = yieldUsd;
    const pnlPct = atDepositUsd && atDepositUsd > 0 && pnlUsd !== null ? (pnlUsd / atDepositUsd) * 100 : null;
    const tokenDetail = metaComponents.length > 0 ? metaComponents : inferredSingleToken;

    return {
      id: `${p.protocol}-${p.wallet}-${p.positionType}-${index}`,
      protocol: p.protocol,
      wallet: p.wallet,
      positionType: p.positionType,
      assetId: p.assetId ?? null,
      amount: p.amount ?? null,
      estimated: p.estimated,
      atDepositUsd,
      nowUsd: p.valueUsd ?? null,
      yieldUsd,
      pnlUsd,
      pnlPct,
      aprPct: aprPct || null,
      dailyYieldUsd,
      meta: p.meta ?? null,
      detailTokens: tokenDetail
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

  const selectedWalletSet =
    selectedWallets.length > 0
      ? selectedWallets.filter((wallet) => scopedWalletSet.has(wallet))
      : scopedWallets;

  const latestValueByWallet = useMemo(
    () =>
      Object.fromEntries(
        (snapshot?.wallets ?? []).map((wallet) => [wallet.wallet, wallet.totalValueUsd])
      ),
    [snapshot?.wallets]
  );

  const latestBalanceByWallet = useMemo(() => {
    const source = (snapshot?.assets ?? []).find((asset) => asset.assetKey === analyticsAssetKey)?.walletBreakdown ?? [];
    return Object.fromEntries(source.map((entry) => [entry.wallet, entry.balance]));
  }, [snapshot?.assets, analyticsAssetKey]);

  const walletSeries = useMemo(() => {
    const txRows = (snapshot?.transactions ?? []).map((tx) => ({
      ts: tx.ts,
      wallet: tx.wallet,
      assetKey: tx.assetKey,
      amount: tx.amount,
      direction: tx.direction,
      unitPriceUsd: tx.unitPriceUsd,
      feeAlgo: tx.feeAlgo
    }));

    if (analyticsMetric === "value") {
      return buildPerWalletValueSeries({
        transactions: txRows,
        wallets: selectedWalletSet,
        latestValueByWallet,
        latestTs: snapshot?.computedAt ?? null
      });
    }

    return buildPerWalletAssetBalanceSeries({
      transactions: txRows,
      wallets: selectedWalletSet,
      assetKey: analyticsAssetKey,
      latestBalanceByWallet,
      latestTs: snapshot?.computedAt ?? null
    });
  }, [
    analyticsMetric,
    selectedWalletSet,
    latestValueByWallet,
    latestBalanceByWallet,
    analyticsAssetKey,
    snapshot?.transactions,
    snapshot?.computedAt
  ]);

  const filteredWalletSeries = useMemo(() => {
    const normalized = normalizeSeriesToUtcDailyClose(walletSeries);
    return filterSeriesByRange(normalized, analyticsRange);
  }, [walletSeries, analyticsRange]);
  const analyticsAggregateHistory = useMemo(
    () => filterHistoryByRange(historySeries, analyticsRange),
    [historySeries, analyticsRange]
  );
  const aggregateWalletSeries = useMemo(() => {
    if (analyticsMode === "aggregate" && analyticsMetric === "value") {
      return {
        key: "aggregate",
        label: "Aggregate",
        points: analyticsAggregateHistory.map((point) => ({ ts: point.ts, value: point.valueUsd }))
      };
    }
    const aligned = alignSeriesByTimestamp(filteredWalletSeries);
    return sumAlignedSeries(aligned);
  }, [analyticsAggregateHistory, analyticsMetric, analyticsMode, filteredWalletSeries]);
  const analyticsSeries = analyticsMode === "aggregate" ? [aggregateWalletSeries] : filteredWalletSeries;
  const analyticsStartValue = aggregateWalletSeries.points[0]?.value ?? null;
  const analyticsEndValue = aggregateWalletSeries.points[aggregateWalletSeries.points.length - 1]?.value ?? null;
  const analyticsDelta = analyticsStartValue === null || analyticsEndValue === null ? null : analyticsEndValue - analyticsStartValue;
  const analyticsDeltaPct =
    analyticsStartValue === null || analyticsEndValue === null || analyticsStartValue === 0
      ? null
      : ((analyticsEndValue - analyticsStartValue) / analyticsStartValue) * 100;

  return (
    <main className="min-h-screen bg-slate-50 text-slate-900 dark:bg-[#0F172A] dark:text-[#F8FAFC]">
      <div className="mx-auto max-w-6xl p-4 md:p-8">
        <header className="mb-6 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="font-brand text-3xl font-semibold tracking-wide">{m.dashboard.title}</h1>
            <p className="text-sm text-slate-600 dark:text-[#94A3B8]">{m.dashboard.subtitle}</p>
          </div>
          <div className="flex flex-wrap items-center justify-end gap-2">
            <button
              aria-label={privacyMode ? m.dashboard.showAmounts : m.dashboard.hideAmounts}
              className="inline-flex h-10 w-10 items-center justify-center rounded-md border border-slate-300 text-lg hover:bg-slate-100 dark:border-[#334155] dark:hover:bg-[#1E293B]"
              onClick={() => setPrivacyMode((prev) => !prev)}
              title={privacyMode ? m.dashboard.showAmounts : m.dashboard.hideAmounts}
              type="button"
            >
              {privacyMode ? "👁" : "🙈"}
            </button>
            <button
              className="rounded-md bg-brand-500 px-3 py-2 text-sm text-white hover:bg-brand-700 disabled:opacity-70"
              disabled={refreshMutation.isPending}
              onClick={() => refreshMutation.mutate()}
              type="button"
            >
              {refreshMutation.isPending ? m.dashboard.refreshing : m.dashboard.refresh}
            </button>
            <LanguageToggle compact />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>

        <nav className="mb-4 flex flex-wrap gap-2">
          {tabs.map((tab) => (
            <button
              className={`rounded-md px-3 py-1.5 text-sm ${
                activeTab === tab ? "bg-brand-700 text-white" : "bg-slate-200 text-slate-700 dark:bg-[#1E293B] dark:text-[#CBD5E1]"
              }`}
              key={tab}
              onClick={() => setTabAndUrl(tab)}
              type="button"
            >
              {m.dashboard.tabs[tab]}
            </button>
          ))}
        </nav>

        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-white p-2 dark:border-[#1E293B] dark:bg-[#0B1630]">
          <span className="text-xs uppercase tracking-wide text-slate-500 dark:text-[#94A3B8]">{m.dashboard.scope?.label ?? "Scope"}</span>
          <select
            className="rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-[#334155] dark:bg-[#0F172A] dark:text-[#E2E8F0]"
            value={selectedScopeWallet}
            onChange={(event) => setSelectedScopeWallet(event.target.value)}
          >
            {scopeOptions.map((scope) => (
              <option key={scope.id} value={scope.id}>
                {scope.name}
              </option>
            ))}
          </select>
          <span className="ml-auto text-xs text-slate-500 dark:text-[#94A3B8]">
            {(m.dashboard.scope?.walletsInScope ?? "{count} wallets").replace("{count}", String(scopedWallets.length))}
          </span>
        </div>

        <div className="mb-6 grid gap-3 md:grid-cols-3">
          <Card label={m.dashboard.cards.totalValue} value={maskUsd(scopedTotals.valueUsd)} helpText={m.dashboard.cards.totalValueHelp} />
          <Card label={m.dashboard.cards.costBasis} value={maskUsd(scopedTotals.costBasisUsd)} helpText={m.dashboard.cards.costBasisHelp} />
          <Card label={m.dashboard.cards.unrealizedPnl} value={maskUsd(scopedTotals.unrealizedPnlUsd)} helpText={m.dashboard.cards.unrealizedHelp} />
        </div>

        {refreshMutation.isError && (
          <div className="mb-4 rounded-md border border-rose-700/60 bg-rose-950/40 px-3 py-2 text-sm text-rose-200">
            {m.dashboard.errors.refreshFailed} {(refreshMutation.error as Error)?.message ?? m.common.systemError}
          </div>
        )}

        {activeTab === "overview" && (
          <section className="mb-4 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{m.dashboard.chart.title}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  {m.dashboard.chart.points}: {filteredHistory.length}
                </div>
              </div>
              <div className="inline-flex items-center gap-1 rounded-md border border-slate-300 p-1 dark:border-slate-700">
                {historyRanges.map((range) => (
                  <button
                    className={`rounded px-2 py-1 text-xs ${
                      historyRange === range
                        ? "bg-brand-600 text-white"
                        : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                    }`}
                    key={range}
                    onClick={() => setHistoryRange(range)}
                    type="button"
                  >
                    {m.dashboard.chart.ranges[range]}
                  </button>
                ))}
              </div>
            </div>
            <PortfolioHistoryChart
              points={filteredHistory}
              privacyMode={privacyMode}
              unknownLabel={m.dashboard.footer.unknown}
              noDataLabel={m.dashboard.chart.noData}
            />
            
            <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-3">
              <div>
                <span className="text-slate-500 dark:text-slate-400">{m.dashboard.chart.startValue}: </span>
                <span>{maskUsd(historyStartValue)}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{m.dashboard.chart.endValue}: </span>
                <span>{maskUsd(historyEndValue)}</span>
              </div>
              <div>
                <span className="text-slate-500 dark:text-slate-400">{m.dashboard.chart.change}: </span>
                <span className={historyDeltaUsd !== null && historyDeltaUsd < 0 ? "text-rose-500" : "text-emerald-500"}>
                  {privacyMode
                    ? "******"
                    : historyDeltaUsd === null
                      ? "-"
                      : `${formatUsd(historyDeltaUsd)}${historyDeltaPct === null ? "" : ` (${historyDeltaPct.toFixed(2)}%)`}`}
                </span>
              </div>
            </div>
          </section>
        )}

        {activeTab === "overview" && (
          <div className="mb-3 flex flex-wrap items-center gap-4 text-sm text-slate-600 dark:text-slate-300">
            <FilterSwitch
              checked={hideZeroBalances}
              label={m.dashboard.overview.hideZero}
              onChange={setHideZeroBalances}
            />
            <FilterSwitch
              checked={hideNoPriceTokens}
              label={m.dashboard.overview.hideNoPrice}
              onChange={setHideNoPriceTokens}
            />
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
                      <td className="px-4 py-3">
                        {asset.priceUsd === null ? (
                          m.dashboard.overview.noPrice
                        ) : (
                          <div>{maskUsd(asset.priceUsd)}</div>
                        )}
                      </td>
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
                          <div>
                            {maskUsdPrecise(tx.unitPriceUsd)}{" "}
                            {tx.valueSource === "spot" && tx.amount > 0 ? (
                              <span className="text-[10px] uppercase tracking-wide text-slate-500 dark:text-slate-400">
                                {m.dashboard.transactions.estimated}
                              </span>
                            ) : null}
                          </div>
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
                    <Fragment key={row.id}>
                      <tr
                        className="cursor-pointer border-t border-slate-200 hover:bg-slate-50/70 dark:border-slate-800 dark:hover:bg-slate-800/30"
                        onClick={() => setExpandedDefiRowId((current) => (current === row.id ? null : row.id))}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-start justify-between gap-2">
                            <div className="font-medium text-slate-900 dark:text-slate-100">
                              {row.protocol} {m.dashboard.defi.vaultSuffix}
                            </div>
                            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
                              {expandedDefiRowId === row.id ? m.dashboard.defi.hideDetails : m.dashboard.defi.viewDetails}
                            </span>
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
                      {expandedDefiRowId === row.id && (
                        <tr className="border-t border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-950/40">
                          <td className="px-4 py-3" colSpan={7}>
                            <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{m.dashboard.defi.tokenBreakdown}</div>
                            {row.detailTokens.length > 0 ? (
                              <div className="overflow-x-auto rounded-md border border-slate-200 dark:border-slate-700">
                                <table className="w-full text-left text-xs sm:text-sm">
                                  <thead className="bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                    <tr>
                                      <th className="px-3 py-2">{m.dashboard.defi.token}</th>
                                      <th className="px-3 py-2">{m.dashboard.defi.amount}</th>
                                      <th className="px-3 py-2">USD</th>
                                      <th className="px-3 py-2">ALGO</th>
                                    </tr>
                                  </thead>
                                  <tbody>
                                    {row.detailTokens.map((token) => (
                                      <tr className="border-t border-slate-200 dark:border-slate-800" key={token.key}>
                                        <td className="px-3 py-2 text-slate-700 dark:text-slate-200">
                                          <span className="font-medium">{token.label}</span>
                                          {token.assetId ? (
                                            <span className="ml-2 text-xs text-slate-500 dark:text-slate-400">ASA {token.assetId}</span>
                                          ) : null}
                                        </td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{maskNumber(token.amount)}</td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">{maskUsd(token.valueUsd)}</td>
                                        <td className="px-3 py-2 text-slate-600 dark:text-slate-300">
                                          <div>{maskAlgo(token.valueAlgo)}</div>
                                          {token.valueAlgo !== null && token.amount > 0 ? (
                                            <div className="text-[11px] text-slate-500 dark:text-slate-400">
                                              {(token.valueAlgo / token.amount).toFixed(6)} {m.dashboard.defi.algoPerToken}
                                            </div>
                                          ) : null}
                                        </td>
                                      </tr>
                                    ))}
                                  </tbody>
                                </table>
                              </div>
                            ) : (
                              <div className="text-sm text-slate-500 dark:text-slate-400">{m.dashboard.defi.noTokenDetails}</div>
                            )}
                          </td>
                        </tr>
                      )}
                    </Fragment>
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

        {activeTab === "walletAnalytics" && (
          <section className="space-y-3">
            <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-800 dark:bg-slate-900">
              <div className="mb-3 flex flex-wrap items-end gap-2">
                <div className="min-w-[180px]">
                  <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{m.dashboard.walletAnalytics.metric}</label>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    value={analyticsMetric}
                    onChange={(event) => setAnalyticsMetric(event.target.value as AnalyticsMetric)}
                  >
                    <option value="value">{m.dashboard.walletAnalytics.valueMode}</option>
                    <option value="balance">{m.dashboard.walletAnalytics.balanceMode}</option>
                  </select>
                </div>
                <div className="min-w-[180px]">
                  <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{m.dashboard.walletAnalytics.view}</label>
                  <select
                    className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                    value={analyticsMode}
                    onChange={(event) => setAnalyticsMode(event.target.value as AnalyticsMode)}
                  >
                    <option value="aggregate">{m.dashboard.walletAnalytics.aggregate}</option>
                    <option value="perWallet">{m.dashboard.walletAnalytics.perWallet}</option>
                  </select>
                </div>
                {analyticsMetric === "balance" && (
                  <div className="min-w-[200px]">
                    <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400">{m.dashboard.walletAnalytics.asset}</label>
                    <select
                      className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200"
                      value={analyticsAssetKey}
                      onChange={(event) => setAnalyticsAssetKey(event.target.value)}
                    >
                      {availableAssets.map((asset) => (
                        <option key={asset.key} value={asset.key}>
                          {asset.label}
                        </option>
                      ))}
                    </select>
                  </div>
                )}
                <details className="min-w-[260px]">
                  <summary className="cursor-pointer list-none rounded-md border border-slate-300 px-3 py-2 text-sm text-slate-700 dark:border-slate-700 dark:text-slate-200">
                    {m.dashboard.walletAnalytics.wallets}: {selectedWalletSet.length}
                  </summary>
                  <div className="mt-2 max-h-44 space-y-1 overflow-auto rounded-md border border-slate-200 bg-slate-50 p-2 text-sm dark:border-slate-700 dark:bg-slate-950">
                    {availableWallets.map((wallet) => {
                      const checked = selectedWalletSet.includes(wallet);
                      return (
                        <label className="flex items-center gap-2" key={wallet}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(event) => {
                              setSelectedWallets((previous) => {
                                if (event.target.checked) {
                                  return [...new Set([...previous, wallet])];
                                }
                                const next = previous.filter((item) => item !== wallet);
                                return next.length ? next : availableWallets;
                              });
                            }}
                          />
                          <span>{shortAddress(wallet)}</span>
                        </label>
                      );
                    })}
                  </div>
                </details>
                <div className="ml-auto inline-flex items-center gap-1 rounded-md border border-slate-300 p-1 dark:border-slate-700">
                  {historyRanges.map((range) => (
                    <button
                      className={`rounded px-2 py-1 text-xs ${
                        analyticsRange === range
                          ? "bg-brand-600 text-white"
                          : "text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
                      }`}
                      key={range}
                      onClick={() => setAnalyticsRange(range)}
                      type="button"
                    >
                      {m.dashboard.chart.ranges[range]}
                    </button>
                  ))}
                </div>
              </div>

              {analyticsMode === "aggregate" && analyticsMetric === "value" ? (
                <PortfolioHistoryChart
                  points={analyticsSeries[0]?.points.map((point) => ({ ts: point.ts, valueUsd: point.value })) ?? []}
                  privacyMode={privacyMode}
                  unknownLabel={m.dashboard.footer.unknown}
                  noDataLabel={m.dashboard.chart.noData}
                />
              ) : (
                <MultiSeriesHistoryChart
                  series={analyticsSeries}
                  privacyMode={privacyMode}
                  isUsd={analyticsMetric === "value"}
                  noDataLabel={m.dashboard.chart.noData}
                />
              )}

              <div className="mt-3 grid gap-2 text-sm text-slate-600 dark:text-slate-300 md:grid-cols-3">
                <div>
                  <span className="text-slate-500 dark:text-slate-400">{m.dashboard.chart.startValue}: </span>
                  <span>{analyticsMetric === "value" ? maskUsd(analyticsStartValue) : maskNumber(analyticsStartValue ?? 0)}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">{m.dashboard.chart.endValue}: </span>
                  <span>{analyticsMetric === "value" ? maskUsd(analyticsEndValue) : maskNumber(analyticsEndValue ?? 0)}</span>
                </div>
                <div>
                  <span className="text-slate-500 dark:text-slate-400">{m.dashboard.chart.change}: </span>
                  <span className={analyticsDelta !== null && analyticsDelta < 0 ? "text-rose-500" : "text-emerald-500"}>
                    {privacyMode
                      ? "******"
                      : analyticsDelta === null
                        ? "-"
                        : `${analyticsMetric === "value" ? formatUsd(analyticsDelta) : maskNumber(analyticsDelta)}${
                            analyticsDeltaPct === null ? "" : ` (${analyticsDeltaPct.toFixed(2)}%)`
                          }`}
                  </span>
                </div>
              </div>
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
              <span className="rounded-md border border-slate-300 px-3 py-2 text-xs text-slate-600 dark:border-slate-700 dark:text-slate-300">
                {m.dashboard.settings.darkOnly}
              </span>
            </div>
            <div className="mb-4 rounded-md border border-slate-200 p-3 dark:border-slate-800">
              <div className="font-medium text-slate-900 dark:text-slate-100">{m.dashboard.settings.walletMgmt}</div>
              <div className="mt-1 text-slate-500 dark:text-slate-400">{m.dashboard.settings.walletMgmtDesc}</div>
              <div className="mt-3">
                <Link className="rounded-md bg-brand-600 px-3 py-2 text-sm text-white hover:bg-brand-700" href="/wallets">
                  {m.dashboard.settings.openWalletMgmt}
                </Link>
              </div>
            </div>
            <div className="mb-4 rounded-md border border-rose-300/60 bg-rose-50/40 p-3 dark:border-rose-800 dark:bg-rose-950/20">
              <div className="font-medium text-rose-800 dark:text-rose-300">{m.dashboard.settings.dangerZone}</div>
              <div className="mt-1 text-slate-600 dark:text-slate-300">{m.dashboard.settings.deleteAccountDesc}</div>
              <div className="mt-3">
                <button
                  className="rounded-md border border-rose-300 px-3 py-2 text-sm text-rose-700 hover:bg-rose-100 disabled:opacity-60 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-900/40"
                  disabled={deleteAccountMutation.isPending}
                  onClick={() => {
                    if (!window.confirm(m.dashboard.settings.deleteAccountConfirm)) {
                      return;
                    }
                    deleteAccountMutation.mutate();
                  }}
                  type="button"
                >
                  {deleteAccountMutation.isPending ? m.dashboard.settings.deletingAccount : m.dashboard.settings.deleteAccount}
                </button>
                {deleteAccountMutation.isError && (
                  <p className="mt-2 text-xs text-rose-700 dark:text-rose-300">
                    {m.dashboard.settings.deleteAccountFailed} {(deleteAccountMutation.error as Error)?.message ?? ""}
                  </p>
                )}
              </div>
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

function FilterSwitch({
  checked,
  label,
  onChange
}: {
  checked: boolean;
  label: string;
  onChange: (next: boolean) => void;
}) {
  return (
    <button
      aria-checked={checked}
      className="inline-flex items-center gap-2 rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-700 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
      onClick={() => onChange(!checked)}
      role="switch"
      type="button"
    >
      <span
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition ${
          checked ? "bg-brand-600" : "bg-slate-300 dark:bg-slate-700"
        }`}
      >
        <span
          className={`inline-block h-4 w-4 transform rounded-full bg-white transition ${
            checked ? "translate-x-4" : "translate-x-0.5"
          }`}
        />
      </span>
      <span>{label}</span>
    </button>
  );
}

function formatTransactionTime(unixTs: number, unknownLabel: string): string {
  if (!Number.isFinite(unixTs) || unixTs <= 0) {
    return unknownLabel;
  }
  return new Date(unixTs * 1000).toLocaleString();
}

function filterHistoryByRange(points: Array<{ ts: string; valueUsd: number }>, range: HistoryRange) {
  if (range === "max" || points.length === 0) {
    return points;
  }

  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;
  return points.slice(-Math.min(points.length, days));
}

function filterSeriesByRange(series: WalletSeries[], range: HistoryRange): WalletSeries[] {
  if (range === "max") return series;
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90;

  return series.map((item) => {
    const points = item.points.slice(-Math.min(item.points.length, days));
    return { ...item, points: points.length > 1 ? points : item.points.slice(-Math.min(2, item.points.length)) };
  });
}

function PortfolioHistoryChart({
  points,
  privacyMode,
  unknownLabel,
  noDataLabel
}: {
  points: Array<{ ts: string; valueUsd: number }>;
  privacyMode: boolean;
  unknownLabel: string;
  noDataLabel: string;
}) {
  const latestIndex = Math.max(0, points.length - 1);
  const [activeIndex, setActiveIndex] = useState(latestIndex);

  if (points.length < 2) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
        {noDataLabel}
      </div>
    );
  }

  const width = 900;
  const height = 220;
  const minY = Math.min(...points.map((p) => p.valueUsd));
  const maxY = Math.max(...points.map((p) => p.valueUsd));
  const ySpan = maxY - minY || 1;
  const xStep = width / (points.length - 1);
  const coords = points.map((point, index) => {
    const x = index * xStep;
    const y = height - ((point.valueUsd - minY) / ySpan) * height;
    return { x, y, point };
  });
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(2)} ${c.y.toFixed(2)}`).join(" ");
  const area = `${path} L ${width} ${height} L 0 ${height} Z`;
  const active = coords[Math.min(Math.max(activeIndex, 0), latestIndex)] ?? coords[latestIndex];

  const getClosestIndex = (clientX: number, left: number, boxWidth: number) => {
    if (boxWidth <= 0) return latestIndex;
    const relativeX = Math.min(Math.max(clientX - left, 0), boxWidth);
    const ratio = relativeX / boxWidth;
    return Math.min(latestIndex, Math.max(0, Math.round(ratio * latestIndex)));
  };

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
      <div className="mb-2 text-xs text-slate-500 dark:text-slate-400">
        {privacyMode ? "******" : formatUsd(active?.point.valueUsd)} •{" "}
        {active?.point.ts ? new Date(active.point.ts).toLocaleString(undefined, { timeZoneName: "short" }) : unknownLabel}
      </div>
      <div className="relative">
        <svg
          className="h-56 w-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          role="img"
          aria-label="Portfolio history chart"
          onMouseLeave={() => setActiveIndex(latestIndex)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setActiveIndex(getClosestIndex(event.clientX, rect.left, rect.width));
          }}
          onTouchMove={(event) => {
            const touch = event.touches.item(0);
            if (!touch) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setActiveIndex(getClosestIndex(touch.clientX, rect.left, rect.width));
          }}
        >
          <defs>
            <linearGradient id="historyArea" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="rgb(16 185 129 / 0.35)" />
              <stop offset="100%" stopColor="rgb(16 185 129 / 0.03)" />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#historyArea)" />
          <path d={path} fill="none" stroke="rgb(16 185 129)" strokeWidth="2.25" strokeLinecap="round" />
          <line x1={active.x} x2={active.x} y1={0} y2={height} stroke="rgb(148 163 184 / 0.45)" strokeDasharray="3 4" />
          <circle cx={active.x} cy={active.y} r="4.5" fill="rgb(16 185 129)" stroke="rgb(2 6 23)" strokeWidth="2" />
        </svg>
        <div
          className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-md border border-slate-300 bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"
          style={{ left: `${(active.x / width) * 100}%` }}
        >
          <div>{privacyMode ? "******" : formatUsd(active.point.valueUsd)}</div>
          <div className="text-slate-500 dark:text-slate-400">
            {new Date(active.point.ts).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </div>
        </div>
      </div>
    </div>
  );
}

const SERIES_COLORS = [
  "rgb(16 185 129)",
  "rgb(56 189 248)",
  "rgb(168 85 247)",
  "rgb(244 114 182)",
  "rgb(251 146 60)",
  "rgb(99 102 241)"
];

function MultiSeriesHistoryChart({
  series,
  privacyMode,
  isUsd,
  noDataLabel
}: {
  series: WalletSeries[];
  privacyMode: boolean;
  isUsd: boolean;
  noDataLabel: string;
}) {
  const aligned = alignSeriesByTimestamp(series);
  const timestamps = aligned.timestamps;
  const latestIndex = Math.max(0, timestamps.length - 1);
  const [activeIndex, setActiveIndex] = useState(latestIndex);
  const visibleSeries = aligned.series;

  if (timestamps.length < 2 || visibleSeries.length === 0) {
    return (
      <div className="rounded-md border border-slate-200 bg-slate-50 p-4 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-400">
        {noDataLabel}
      </div>
    );
  }

  const values = visibleSeries.flatMap((item) => item.values);
  const minY = Math.min(...values);
  const maxY = Math.max(...values);
  const ySpan = maxY - minY || 1;
  const width = 900;
  const height = 220;
  const xStep = width / (timestamps.length - 1);
  const clampedIndex = Math.min(Math.max(activeIndex, 0), latestIndex);

  const toPath = (seriesValues: number[]) =>
    seriesValues
      .map((value, index) => {
        const x = index * xStep;
        const y = height - ((value - minY) / ySpan) * height;
        return `${index === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
      })
      .join(" ");

  const getClosestIndex = (clientX: number, left: number, boxWidth: number) => {
    if (boxWidth <= 0) return latestIndex;
    const relativeX = Math.min(Math.max(clientX - left, 0), boxWidth);
    const ratio = relativeX / boxWidth;
    return Math.min(latestIndex, Math.max(0, Math.round(ratio * latestIndex)));
  };

  return (
    <div className="space-y-2 rounded-md border border-slate-200 bg-slate-50 p-3 dark:border-slate-700 dark:bg-slate-950">
      <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
        {visibleSeries.map((item, index) => (
          <div className="inline-flex items-center gap-1.5" key={item.key}>
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />
            <span>{shortAddress(item.label)}</span>
          </div>
        ))}
      </div>
      <div className="relative">
        <svg
          className="h-56 w-full"
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          onMouseLeave={() => setActiveIndex(latestIndex)}
          onMouseMove={(event) => {
            const rect = event.currentTarget.getBoundingClientRect();
            setActiveIndex(getClosestIndex(event.clientX, rect.left, rect.width));
          }}
          onTouchMove={(event) => {
            const touch = event.touches.item(0);
            if (!touch) return;
            const rect = event.currentTarget.getBoundingClientRect();
            setActiveIndex(getClosestIndex(touch.clientX, rect.left, rect.width));
          }}
        >
          {visibleSeries.map((item, index) => (
            <path
              key={item.key}
              d={toPath(item.values)}
              fill="none"
              stroke={SERIES_COLORS[index % SERIES_COLORS.length]}
              strokeWidth={2.2}
              strokeLinecap="round"
            />
          ))}
          <line x1={clampedIndex * xStep} x2={clampedIndex * xStep} y1={0} y2={height} stroke="rgb(148 163 184 / 0.45)" strokeDasharray="3 4" />
          {visibleSeries.map((item, index) => {
            const value = item.values[clampedIndex] ?? 0;
            const x = clampedIndex * xStep;
            const y = height - ((value - minY) / ySpan) * height;
            return (
              <circle
                key={`${item.key}-active`}
                cx={x}
                cy={y}
                r="3.5"
                fill={SERIES_COLORS[index % SERIES_COLORS.length]}
                stroke="rgb(2 6 23)"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
        <div
          className="pointer-events-none absolute top-2 -translate-x-1/2 rounded-md border border-slate-300 bg-white/95 px-2 py-1 text-[11px] text-slate-700 shadow-sm dark:border-slate-700 dark:bg-slate-900/95 dark:text-slate-200"
          style={{ left: `${(clampedIndex / latestIndex) * 100}%` }}
        >
          <div className="mb-1 text-slate-500 dark:text-slate-400">
            {new Date(timestamps[clampedIndex] ?? "").toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
          </div>
          {visibleSeries.map((item, index) => {
            const value = item.values[clampedIndex] ?? 0;
            const rendered = privacyMode ? "******" : isUsd ? formatUsd(value) : new Intl.NumberFormat("en-US", { maximumFractionDigits: 6 }).format(value);
            return (
              <div className="flex items-center gap-1.5" key={`${item.key}-tooltip`}>
                <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: SERIES_COLORS[index % SERIES_COLORS.length] }} />
                <span>{shortAddress(item.label)}: {rendered}</span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
