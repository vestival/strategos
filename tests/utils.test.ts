import { describe, expect, it } from "vitest";

import { getAlgorandExplorerTxUrl } from "@/lib/utils";

describe("getAlgorandExplorerTxUrl", () => {
  it("returns explorer link for canonical tx ids", () => {
    const txId = "YBJ536UGOEKXLOM6JJDQLVJ3V4JHCB6XUTI75T7S2B4NID5KNDQA";
    expect(getAlgorandExplorerTxUrl(txId)).toBe(`https://explorer.perawallet.app/tx/${txId}`);
  });

  it("returns null for synthetic inner tx identifiers", () => {
    expect(getAlgorandExplorerTxUrl("ABC123:inner:0")).toBeNull();
  });
});
