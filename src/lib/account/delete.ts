type DeleteAccountDeps = {
  findUserById: (userId: string) => Promise<{ id: string } | null>;
  deleteUserById: (userId: string) => Promise<void>;
};

export type DeleteAccountResult =
  | { ok: true }
  | { ok: false; status: 404; error: string };

export function createDeleteAccountService(deps: DeleteAccountDeps) {
  return async function deleteAccountForUser(userId: string): Promise<DeleteAccountResult> {
    const user = await deps.findUserById(userId);
    if (!user) {
      return { ok: false, status: 404, error: "User not found" };
    }

    await deps.deleteUserById(user.id);
    return { ok: true };
  };
}

