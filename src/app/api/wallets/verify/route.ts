import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { z } from "zod";
import algosdk from "algosdk";

import { submitSignedTransaction } from "@/lib/algorand/algod";
import { authOptions } from "@/lib/auth";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";
import { getEnv } from "@/lib/env";
import { checkRateLimit } from "@/lib/rate-limit";
import { assertSameOrigin, getClientIp } from "@/lib/security/request";
import { verifyByNoteTransaction } from "@/lib/verification/verify";

const inputSchema = z.object({
  challengeId: z.string().min(5),
  signedTxnB64: z.string().min(10).optional(),
  txId: z.string().min(10).optional()
});

const env = getEnv();

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
    key: `wallets-verify:${session.user.id}:${ip}`,
    userId: session.user.id,
    ip,
    windowMs: env.PUBLIC_RATE_LIMIT_WINDOW_MS,
    max: env.PUBLIC_RATE_LIMIT_MAX
  });
  if (!allowed) {
    return NextResponse.json({ error: "Rate limit exceeded" }, { status: 429 });
  }

  const parsed = inputSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const challenge = await prisma.walletVerificationChallenge.findUnique({
    where: { id: parsed.data.challengeId }
  });

  if (!challenge || challenge.userId !== session.user.id) {
    return NextResponse.json({ error: "Challenge not found" }, { status: 404 });
  }

  if (challenge.consumedAt) {
    return NextResponse.json({ error: "Challenge already used" }, { status: 400 });
  }

  if (challenge.expiresAt.getTime() < Date.now()) {
    return NextResponse.json({ error: "Challenge expired" }, { status: 400 });
  }

  const wallet = await prisma.linkedWallet.findUnique({ where: { id: challenge.walletId } });
  if (!wallet) {
    return NextResponse.json({ error: "Wallet not found" }, { status: 404 });
  }

  let verification: { ok: boolean; txId?: string } = { ok: false };

  if (parsed.data.signedTxnB64) {
    const normalizedSignedB64 = parsed.data.signedTxnB64.replace(/-/g, "+").replace(/_/g, "/").replace(/\s+/g, "");
    const signedTxnBytes = Buffer.from(normalizedSignedB64, "base64");
    let decoded: ReturnType<typeof algosdk.decodeSignedTransaction>;

    try {
      decoded = algosdk.decodeSignedTransaction(signedTxnBytes);
    } catch {
      return NextResponse.json({ error: "Invalid signed transaction payload" }, { status: 400 });
    }

    const sender = decoded.txn.sender.toString();
    const receiver = decoded.txn.payment?.receiver?.toString() ?? "";
    const noteText = decoded.txn.note ? Buffer.from(decoded.txn.note).toString("utf8") : "";

    if (sender !== wallet.address) {
      return NextResponse.json({ error: "Signed transaction sender does not match wallet" }, { status: 400 });
    }

    if (receiver !== env.ALGORAND_VERIFICATION_RECEIVER) {
      return NextResponse.json({ error: "Signed transaction receiver mismatch" }, { status: 400 });
    }

    if (noteText !== challenge.noteText) {
      return NextResponse.json({ error: "Signed transaction note mismatch" }, { status: 400 });
    }

    try {
      const submittedTxId = await submitSignedTransaction(new Uint8Array(signedTxnBytes));
      verification = { ok: true, txId: submittedTxId };
    } catch {
      // If the wallet already broadcasted the transaction, fallback verification can still succeed.
      verification = await verifyByNoteTransaction({
        walletAddress: wallet.address,
        noteText: challenge.noteText,
        createdAt: challenge.createdAt,
        expiresAt: challenge.expiresAt
      });
      if (!verification.ok) {
        return NextResponse.json({ error: "Signed transaction could not be submitted or found on-chain yet" }, { status: 400 });
      }
    }
  } else if (parsed.data.txId) {
    verification = await verifyByNoteTransaction({
      walletAddress: wallet.address,
      noteText: challenge.noteText,
      createdAt: challenge.createdAt,
      expiresAt: challenge.expiresAt
    });
  } else {
    verification = await verifyByNoteTransaction({
      walletAddress: wallet.address,
      noteText: challenge.noteText,
      createdAt: challenge.createdAt,
      expiresAt: challenge.expiresAt
    });
  }

  if (!verification.ok) {
    return NextResponse.json({ error: "No matching verification transaction found yet" }, { status: 400 });
  }

  await prisma.$transaction([
    prisma.walletVerificationChallenge.update({
      where: { id: challenge.id },
      data: { consumedAt: new Date() }
    }),
    prisma.linkedWallet.update({
      where: { id: wallet.id },
      data: {
        verifiedAt: new Date(),
        verificationMethod: "note_transaction",
        verificationTxId: verification.txId,
        verificationMeta: {
          noteText: challenge.noteText,
          challengeId: challenge.id
        }
      }
    })
  ]);

  await writeAuditLog(session.user.id, "wallet.link.verified", {
    walletId: wallet.id,
    verificationTxId: verification.txId
  });

  return NextResponse.json({ ok: true });
}
