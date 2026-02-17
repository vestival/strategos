import { describe, expect, it } from "vitest";

import { messages } from "@/lib/i18n/translations";

describe("i18n messages", () => {
  it("contains english and spanish auth labels", () => {
    expect(messages.en.auth.signInWithGoogle).toBeTruthy();
    expect(messages.es.auth.signInWithGoogle).toBeTruthy();
    expect(messages.en.auth.signOut).toBeTruthy();
    expect(messages.es.auth.signOut).toBeTruthy();
  });

  it("contains translated dashboard tabs", () => {
    expect(messages.en.dashboard.tabs.transactions).toBe("Transactions");
    expect(messages.es.dashboard.tabs.transactions).toBe("Transacciones");
  });
});

