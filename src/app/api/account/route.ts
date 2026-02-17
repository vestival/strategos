import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";

import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, getClientIp } from "@/lib/security/request";
import { createDeleteAccountService } from "@/lib/account/delete";

const env = getEnv();

const deleteAccountForUser = createDeleteAccountService({
  findUserById: async (userId) => prisma.user.findUnique({ where: { id: userId }, select: { id: true } }),
  deleteUserById: async (userId) => {
    await prisma.user.delete({ where: { id: userId } });
  }
});

export async function DELETE(request: Request) {
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
    key: `account-delete:${session.user.id}:${ip}`,
    userId: session.user.id,
    ip,
    windowMs: env.PUBLIC_RATE_LIMIT_WINDOW_MS,
    max: Math.max(1, Math.floor(env.PUBLIC_RATE_LIMIT_MAX / 2))
  });
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const result = await deleteAccountForUser(session.user.id);
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }

  return NextResponse.json({ ok: true });
}

