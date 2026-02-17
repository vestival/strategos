import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { buildPortfolioHistoryFromTransactions } from "@/lib/portfolio/history";
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
    latestValueUsd: data?.totals?.valueUsd ?? null,
    latestTs: snapshot?.computedAt ?? null
  });

  return NextResponse.json({ history });
}
