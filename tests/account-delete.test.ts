import { describe, expect, it, vi } from "vitest";

import { createDeleteAccountService } from "@/lib/account/delete";

describe("createDeleteAccountService", () => {
  it("deletes an existing user account", async () => {
    const findUserById = vi.fn(async () => ({ id: "u1" }));
    const deleteUserById = vi.fn(async () => {});

    const deleteAccountForUser = createDeleteAccountService({
      findUserById,
      deleteUserById
    });

    const result = await deleteAccountForUser("u1");

    expect(result).toEqual({ ok: true });
    expect(findUserById).toHaveBeenCalledWith("u1");
    expect(deleteUserById).toHaveBeenCalledWith("u1");
  });

  it("returns 404 when user does not exist", async () => {
    const deleteUserById = vi.fn(async () => {});
    const deleteAccountForUser = createDeleteAccountService({
      findUserById: async () => null,
      deleteUserById
    });

    const result = await deleteAccountForUser("missing");

    expect(result).toEqual({ ok: false, status: 404, error: "User not found" });
    expect(deleteUserById).not.toHaveBeenCalled();
  });
});
