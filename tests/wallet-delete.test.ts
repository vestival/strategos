import { describe, expect, it, vi } from "vitest";

import { createDeleteWalletService } from "@/lib/wallets/delete";

describe("createDeleteWalletService", () => {
  it("deletes wallet and its challenges for the owner", async () => {
    const findWalletById = vi.fn(async () => ({ id: "w1", userId: "u1" }));
    const deleteChallengesForWallet = vi.fn(async () => {});
    const deleteWalletById = vi.fn(async () => {});

    const deleteWalletForUser = createDeleteWalletService({
      findWalletById,
      deleteChallengesForWallet,
      deleteWalletById
    });

    const result = await deleteWalletForUser({ walletId: "w1", userId: "u1" });

    expect(result).toEqual({ ok: true });
    expect(findWalletById).toHaveBeenCalledWith("w1");
    expect(deleteChallengesForWallet).toHaveBeenCalledWith("w1");
    expect(deleteWalletById).toHaveBeenCalledWith("w1");
  });

  it("returns 403 when wallet belongs to a different user", async () => {
    const deleteChallengesForWallet = vi.fn(async () => {});
    const deleteWalletById = vi.fn(async () => {});
    const deleteWalletForUser = createDeleteWalletService({
      findWalletById: async () => ({ id: "w1", userId: "other-user" }),
      deleteChallengesForWallet,
      deleteWalletById
    });

    const result = await deleteWalletForUser({ walletId: "w1", userId: "u1" });

    expect(result).toEqual({ ok: false, status: 403, error: "Forbidden" });
    expect(deleteChallengesForWallet).not.toHaveBeenCalled();
    expect(deleteWalletById).not.toHaveBeenCalled();
  });

  it("returns 404 when wallet is missing", async () => {
    const deleteWalletForUser = createDeleteWalletService({
      findWalletById: async () => null,
      deleteChallengesForWallet: async () => {},
      deleteWalletById: async () => {}
    });

    const result = await deleteWalletForUser({ walletId: "missing", userId: "u1" });

    expect(result).toEqual({ ok: false, status: 404, error: "Wallet not found" });
  });
});
