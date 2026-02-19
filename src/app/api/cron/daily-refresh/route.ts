import { NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { computePortfolioSnapshot } from "@/lib/portfolio/snapshot";

const env = getEnv();

function isAuthorizedCron(request: Request): boolean {
  if (!env.CRON_SECRET) {
    return false;
  }
  const auth = request.headers.get("authorization");
  return auth === `Bearer ${env.CRON_SECRET}`;
}

export async function GET(request: Request) {
  if (!isAuthorizedCron(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const rows = await prisma.linkedWallet.findMany({
    where: { verifiedAt: { not: null } },
    select: { userId: true, address: true }
  });

  const walletsByUser = new Map<string, string[]>();
  for (const row of rows) {
    const current = walletsByUser.get(row.userId) ?? [];
    current.push(row.address);
    walletsByUser.set(row.userId, current);
  }

  let refreshedUsers = 0;
  let failedUsers = 0;
  for (const [userId, wallets] of walletsByUser.entries()) {
    if (wallets.length === 0) {
      continue;
    }
    try {
      const snapshot = await computePortfolioSnapshot(wallets);
      await prisma.portfolioSnapshot.create({
        data: {
          userId,
          method: "FIFO",
          data: snapshot as Prisma.InputJsonValue
        }
      });
      await writeAuditLog(userId, "portfolio.refresh.auto", { walletCount: wallets.length });
      refreshedUsers += 1;
    } catch {
      failedUsers += 1;
    }
  }

  return NextResponse.json({
    ok: true,
    refreshedUsers,
    failedUsers
  });
}
