import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { mapLatestAssetStatesFromSnapshotAssets } from "@/lib/portfolio/history-mapper";
import { buildPortfolioHistoryFromTransactions } from "@/lib/portfolio/history";
import { getHistoricalPriceKey, getHistoricalPricesUsdByDay } from "@/lib/price/provider";
import { checkRateLimit } from "@/lib/rate-limit";
import { getClientIp } from "@/lib/security/request";

const env = getEnv();

export async function GET(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const allowed = await checkRateLimit({
    key: `portfolio-history:${session.user.id}:${ip}`,
    userId: session.user.id,
    ip,
    windowMs: env.PUBLIC_RATE_LIMIT_WINDOW_MS,
    max: env.PUBLIC_RATE_LIMIT_MAX
  });
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const snapshot = await prisma.portfolioSnapshot.findFirst({
    where: { userId: session.user.id },
    select: { computedAt: true, data: true },
    orderBy: { computedAt: "desc" }
  });

  const data = snapshot?.data as
    | {
        totals?: { valueUsd?: number | null };
        assets?: Array<{ assetKey?: string; balance?: number | null; priceUsd?: number | null }>;
        transactions?: Array<{
          ts?: number | null;
          assetKey?: string;
          amount?: number | null;
          direction?: "in" | "out" | "self";
          unitPriceUsd?: number | null;
          feeAlgo?: number | null;
        }>;
      }
    | undefined;

  const history = buildPortfolioHistoryFromTransactions({
    transactions: (data?.transactions ?? [])
      .map((tx) => ({
        ts: tx.ts ?? 0,
        assetKey: tx.assetKey ?? "ALGO",
        amount: tx.amount ?? 0,
        direction: tx.direction ?? "self",
        unitPriceUsd: tx.unitPriceUsd ?? null,
        feeAlgo: tx.feeAlgo ?? 0
      }))
      .filter((tx) => tx.assetKey.length > 0),
    latestAssetStates: mapLatestAssetStatesFromSnapshotAssets(data?.assets ?? []),
    dailyPrices: await buildDailyPriceRows({
      assets: data?.assets ?? [],
      transactions:
        (data?.transactions ?? [])
          .map((tx) => ({
            ts: tx.ts ?? 0,
            assetKey: tx.assetKey ?? "ALGO"
          }))
          .filter((tx) => tx.assetKey.length > 0) ?? [],
      latestTs: snapshot?.computedAt ?? null
    }),
    latestValueUsd: data?.totals?.valueUsd ?? null,
    latestTs: snapshot?.computedAt ?? null
  });

  return NextResponse.json({ history });
}

async function buildDailyPriceRows({
  assets,
  transactions,
  latestTs
}: {
  assets: Array<{ assetKey?: string; balance?: number | null; priceUsd?: number | null }>;
  transactions: Array<{ ts: number; assetKey: string }>;
  latestTs: Date | null;
}) {
  const latestMs = latestTs ? Date.parse(String(latestTs)) : NaN;
  const latestUnix = Number.isFinite(latestMs) ? Math.floor(latestMs / 1000) : 0;
  const earliestUnix = transactions
    .map((tx) => tx.ts)
    .filter((value) => Number.isFinite(value) && value > 0)
    .sort((a, b) => a - b)[0];

  if (!latestUnix || !earliestUnix) {
    return [];
  }

  const assetKeys = Array.from(
    new Set([
      ...assets.map((asset) => asset.assetKey ?? "").filter((assetKey) => assetKey.length > 0),
      ...transactions.map((tx) => tx.assetKey)
    ])
  );
  if (assetKeys.length === 0) {
    return [];
  }

  const timestamps: number[] = [];
  for (
    let ms = startOfUtcDayMs(earliestUnix * 1000);
    ms <= startOfUtcDayMs(latestUnix * 1000);
    ms += 24 * 60 * 60 * 1000
  ) {
    timestamps.push(Math.floor(ms / 1000) + 12 * 60 * 60);
  }

  const raw = await getHistoricalPricesUsdByDay(assetKeys, timestamps);
  const rows: Array<{ assetKey: string; dayKey: string; priceUsd: number | null }> = [];
  for (const assetKey of assetKeys) {
    for (const ts of timestamps) {
      const providerKey = getHistoricalPriceKey(assetKey, ts);
      const dayKey = toIsoDayKey(ts);
      rows.push({
        assetKey,
        dayKey,
        priceUsd: raw[providerKey] ?? null
      });
    }
  }

  return rows;
}

function startOfUtcDayMs(msTs: number): number {
  const d = new Date(msTs);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function toIsoDayKey(unixTs: number): string {
  const d = new Date(unixTs * 1000);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
