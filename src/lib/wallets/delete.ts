type WalletRecord = {
  id: string;
  userId: string;
};

type DeleteWalletDeps = {
  findWalletById: (walletId: string) => Promise<WalletRecord | null>;
  deleteChallengesForWallet: (walletId: string) => Promise<void>;
  deleteWalletById: (walletId: string) => Promise<void>;
};

export type DeleteWalletResult =
  | { ok: true }
  | { ok: false; status: 403 | 404; error: string };

export function createDeleteWalletService(deps: DeleteWalletDeps) {
  return async function deleteWalletForUser(params: { walletId: string; userId: string }): Promise<DeleteWalletResult> {
    const wallet = await deps.findWalletById(params.walletId);
    if (!wallet) {
      return { ok: false, status: 404, error: "Wallet not found" };
    }

    if (wallet.userId !== params.userId) {
      return { ok: false, status: 403, error: "Forbidden" };
    }

    await deps.deleteChallengesForWallet(wallet.id);
    await deps.deleteWalletById(wallet.id);

    return { ok: true };
  };
}
