import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";

import { getAssetInfo } from "@/lib/algorand/indexer";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { computePortfolioSnapshot } from "@/lib/portfolio/snapshot";
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
    key: `portfolio-snapshot:${session.user.id}:${ip}`,
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
    orderBy: { computedAt: "desc" },
    select: {
      id: true,
      data: true
    }
  });

  let data = snapshot?.data as
    | {
        totals?: {
          valueUsd?: number | null;
          costBasisUsd?: number | null;
          realizedPnlUsd?: number | null;
          unrealizedPnlUsd?: number | null;
        };
        assets?: Array<{
          assetKey: string;
          assetName?: string;
          balance?: number | null;
          walletBreakdown?: Array<{
            wallet: string;
            balance: number;
            valueUsd: number | null;
          }> | null;
          priceUsd?: number | null;
          costBasisUsd?: number | null;
          realizedPnlUsd?: number | null;
          unrealizedPnlUsd?: number | null;
        }>;
        transactions?: Array<{
          ts?: number | null;
          assetKey?: string;
          amount?: number | null;
          valueUsd?: number | null;
        }>;
      }
    | null
    | undefined;

  const hasInvalidTotals =
    !data?.totals ||
    data.totals.costBasisUsd === null ||
    data.totals.realizedPnlUsd === null ||
    data.totals.unrealizedPnlUsd === null ||
    data.totals.valueUsd === null;
  const hasInvalidAssets =
    (data?.assets ?? []).some(
      (asset) =>
        (asset.balance ?? 0) > 0 &&
        (asset.assetKey === "ALGO" || asset.costBasisUsd !== null || asset.realizedPnlUsd !== null) &&
        (asset.costBasisUsd === null || asset.realizedPnlUsd === null)
    );
  const hasInvalidTxTimestamps = (data?.transactions ?? []).some((tx) => {
    const ts = tx.ts;
    return !Number.isFinite(ts) || (ts ?? 0) <= 0;
  });
  const hasMissingWalletBreakdown = (data?.assets ?? []).some(
    (asset) => (asset.balance ?? 0) > 0 && !Array.isArray(asset.walletBreakdown)
  );
  const pricedKeys = new Set(
    (data?.assets ?? [])
      .filter((asset) => asset.priceUsd !== null && Number.isFinite(asset.priceUsd))
      .map((asset) => asset.assetKey)
  );
  const hasMissingPricedTxValues = (data?.transactions ?? []).some((tx) => {
    if (!tx.assetKey || !pricedKeys.has(tx.assetKey)) {
      return false;
    }
    if ((tx.amount ?? 0) === 0) {
      return false;
    }
    return tx.valueUsd === null || !Number.isFinite(tx.valueUsd);
  });
  const needsRecompute =
    !data ||
    !Array.isArray(data.transactions) ||
    data.transactions.length === 0 ||
    hasInvalidTotals ||
    hasInvalidAssets ||
    hasInvalidTxTimestamps ||
    hasMissingWalletBreakdown ||
    hasMissingPricedTxValues;
  if (needsRecompute) {
    const wallets = await prisma.linkedWallet.findMany({
      where: {
        userId: session.user.id,
        verifiedAt: { not: null }
      },
      select: { address: true }
    });

    const walletAddresses = wallets.map((w) => w.address);
    if (walletAddresses.length > 0) {
      const fresh = await computePortfolioSnapshot(walletAddresses);
      await prisma.portfolioSnapshot.create({
        data: {
          userId: session.user.id,
          method: "FIFO",
          data: fresh as Prisma.InputJsonValue
        }
      });
      data = fresh;
    }
  }

  if (data?.assets?.length) {
    for (const asset of data.assets) {
      if (asset.assetName && asset.assetName !== asset.assetKey) {
        continue;
      }
      if (asset.assetKey === "ALGO") {
        asset.assetName = "ALGO";
        continue;
      }
      const id = Number(asset.assetKey);
      if (!Number.isInteger(id)) {
        asset.assetName = asset.assetKey;
        continue;
      }
      try {
        const info = await getAssetInfo(id);
        asset.assetName = info.unitName ?? info.name ?? asset.assetKey;
      } catch {
        asset.assetName = asset.assetKey;
      }
    }
  }

  return NextResponse.json({ snapshot: data ?? null });
}
