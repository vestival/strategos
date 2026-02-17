import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";

import { authOptions } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, getClientIp } from "@/lib/security/request";
import { createDeleteWalletService } from "@/lib/wallets/delete";

const env = getEnv();
const paramsSchema = z.object({
  walletId: z.string().min(5)
});

const deleteWalletForUser = createDeleteWalletService({
  findWalletById: async (walletId) => prisma.linkedWallet.findUnique({ where: { id: walletId }, select: { id: true, userId: true } }),
  deleteChallengesForWallet: async (walletId) => {
    await prisma.walletVerificationChallenge.deleteMany({ where: { walletId } });
  },
  deleteWalletById: async (walletId) => {
    await prisma.linkedWallet.delete({ where: { id: walletId } });
  },
  clearCachedPortfolioDataForUser: async (userId) => {
    await prisma.portfolioSnapshot.deleteMany({ where: { userId } });
  }
});

export async function DELETE(request: Request, context: { params: { walletId: string } }) {
  const originCheck = assertSameOrigin(request);
  if (!originCheck.ok) {
    return NextResponse.json({ error: originCheck.error }, { status: originCheck.status });
  }

  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedParams = paramsSchema.safeParse(context.params);
  if (!parsedParams.success) {
    return NextResponse.json({ error: "Invalid wallet id" }, { status: 400 });
  }

  const ip = getClientIp(request);
  const allowed = await checkRateLimit({
    key: `wallets-delete:${session.user.id}:${ip}`,
    userId: session.user.id,
    ip,
    windowMs: env.PUBLIC_RATE_LIMIT_WINDOW_MS,
    max: env.PUBLIC_RATE_LIMIT_MAX
  });
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const result = await deleteWalletForUser({
    walletId: parsedParams.data.walletId,
    userId: session.user.id
  });

  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  await writeAuditLog(session.user.id, "wallet.deleted", {
    walletId: parsedParams.data.walletId
  });

  return NextResponse.json({ ok: true });
}
