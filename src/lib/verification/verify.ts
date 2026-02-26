import { findVerificationTransaction } from "@/lib/algorand/indexer";
import { getEnv } from "@/lib/env";

const env = getEnv();

type VerifyByNoteDeps = {
  findVerificationTransactionFn?: typeof findVerificationTransaction;
  sleepFn?: (ms: number) => Promise<void>;
};

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

export async function verifyByNoteTransaction(params: {
  walletAddress: string;
  noteText: string;
  expiresAt: Date;
  createdAt: Date;
}, deps: VerifyByNoteDeps = {}): Promise<{ ok: boolean; txId?: string }> {
  const findFn = deps.findVerificationTransactionFn ?? findVerificationTransaction;
  const sleepFn = deps.sleepFn ?? sleep;

  const minUnixTime = Math.floor(params.createdAt.getTime() / 1000);
  // Allow confirmation lag around challenge expiry so valid wallets do not fail on indexer delays.
  const maxUnixTimeWithGrace = Math.floor(params.expiresAt.getTime() / 1000) + 120;
  const maxAttempts = 6;
  const retryDelayMs = 1200;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const tx = await findFn(
      params.walletAddress,
      params.noteText,
      minUnixTime,
      maxUnixTimeWithGrace
    );

    if (tx?.paymentTransaction && tx.paymentTransaction.receiver === env.ALGORAND_VERIFICATION_RECEIVER) {
      return { ok: true, txId: tx.id };
    }

    if (attempt < maxAttempts - 1) {
      await sleepFn(retryDelayMs);
    }
  }

  return { ok: false };
}
