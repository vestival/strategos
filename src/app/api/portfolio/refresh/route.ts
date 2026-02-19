import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Prisma } from "@prisma/client";

import { authOptions } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { computePortfolioSnapshot } from "@/lib/portfolio/snapshot";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, getClientIp } from "@/lib/security/request";

const env = getEnv();

function getUtcDayBounds(now = new Date()) {
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0, 0));
  const end = new Date(start);
  end.setUTCDate(end.getUTCDate() + 1);
  return { start, end };
}

export async function POST(request: Request) {
  const originCheck = assertSameOrigin(request);
  if (!originCheck.ok) {
    return NextResponse.json({ error: originCheck.error }, { status: originCheck.status });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const ip = getClientIp(request);
  const allowed = await checkRateLimit({
    key: `portfolio-refresh:${session.user.id}:${ip}`,
    userId: session.user.id,
    ip,
    windowMs: env.PUBLIC_RATE_LIMIT_WINDOW_MS,
    max: env.PUBLIC_RATE_LIMIT_MAX
  });
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const wallets = await prisma.linkedWallet.findMany({
    where: {
      userId: session.user.id,
      verifiedAt: { not: null }
    },
    select: {
      address: true
    }
  });

  const walletAddresses = wallets.map((w) => w.address);

  if (walletAddresses.length === 0) {
    return NextResponse.json({ error: "No verified wallets linked" }, { status: 400 });
  }

  const userEmail = session.user.email?.toLowerCase() ?? null;
  const exemptEmail = env.REFRESH_EXEMPT_EMAIL.toLowerCase();
  const isExempt = userEmail === exemptEmail;
  if (!isExempt) {
    const { start, end } = getUtcDayBounds();
    const manualRefreshesToday = await prisma.auditLog.count({
      where: {
        userId: session.user.id,
        action: "portfolio.refresh.manual",
        createdAt: {
          gte: start,
          lt: end
        }
      }
    });
    if (manualRefreshesToday >= env.MANUAL_REFRESH_DAILY_MAX) {
      return NextResponse.json(
        {
          error: `Daily manual refresh limit reached (${env.MANUAL_REFRESH_DAILY_MAX}). Next window opens at 00:00 UTC.`
        },
        { status: 429 }
      );
    }
  }

  const snapshot = await computePortfolioSnapshot(walletAddresses);

  await prisma.portfolioSnapshot.create({
    data: {
      userId: session.user.id,
      method: "FIFO",
      data: snapshot as Prisma.InputJsonValue
    }
  });

  await writeAuditLog(session.user.id, "portfolio.refresh.manual", {
    walletCount: walletAddresses.length
  });

  return NextResponse.json({ ok: true });
}
