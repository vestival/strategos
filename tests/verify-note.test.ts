import { describe, expect, it, vi } from "vitest";

import { getEnv } from "@/lib/env";
import { verifyByNoteTransaction } from "@/lib/verification/verify";

describe("verifyByNoteTransaction", () => {
  const env = getEnv();

  it("retries until matching transaction appears", async () => {
    const findMock = vi
      .fn()
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "TX-123",
        sender: "ADDR",
        fee: 1000,
        confirmedRoundTime: 123,
        paymentTransaction: {
          receiver: env.ALGORAND_VERIFICATION_RECEIVER,
          amount: 0
        }
      });

    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const result = await verifyByNoteTransaction(
      {
        walletAddress: "ADDR",
        noteText: "ALGOPORTFOLIO|VERIFY|nonce",
        createdAt: new Date("2026-02-25T10:00:00.000Z"),
        expiresAt: new Date("2026-02-25T10:15:00.000Z")
      },
      {
        findVerificationTransactionFn: findMock as never,
        sleepFn: sleepMock
      }
    );

    expect(result).toEqual({ ok: true, txId: "TX-123" });
    expect(findMock).toHaveBeenCalledTimes(3);
    expect(sleepMock).toHaveBeenCalledTimes(2);
  });

  it("fails cleanly after max retries without a matching tx", async () => {
    const findMock = vi.fn().mockResolvedValue(null);
    const sleepMock = vi.fn().mockResolvedValue(undefined);

    const result = await verifyByNoteTransaction(
      {
        walletAddress: "ADDR",
        noteText: "ALGOPORTFOLIO|VERIFY|nonce",
        createdAt: new Date("2026-02-25T10:00:00.000Z"),
        expiresAt: new Date("2026-02-25T10:15:00.000Z")
      },
      {
        findVerificationTransactionFn: findMock as never,
        sleepFn: sleepMock
      }
    );

    expect(result).toEqual({ ok: false });
    expect(findMock).toHaveBeenCalledTimes(6);
    expect(sleepMock).toHaveBeenCalledTimes(5);
  });
});
