import { describe, expect, it } from "vitest";

import { extractSignedTransactionBytes } from "@/lib/wallet/signed-payload";

describe("extractSignedTransactionBytes", () => {
  it("returns bytes when input is Uint8Array", () => {
    const bytes = new Uint8Array([1, 2, 3]);
    expect(extractSignedTransactionBytes(bytes)).toEqual(bytes);
  });

  it("extracts bytes from nested array/object payload", () => {
    const bytes = new Uint8Array([9, 8, 7, 6]);
    const payload = [[{ blob: bytes }]];
    expect(extractSignedTransactionBytes(payload)).toEqual(bytes);
  });

  it("extracts bytes from base64 blob payload", () => {
    const bytes = new Uint8Array([11, 22, 33]);
    const base64 = Buffer.from(bytes).toString("base64");
    const payload = [{ signedTxn: base64 }];
    expect(extractSignedTransactionBytes(payload)).toEqual(bytes);
  });

  it("returns null for unsupported payload", () => {
    expect(extractSignedTransactionBytes({ hello: "world" })).toBeNull();
    expect(extractSignedTransactionBytes(undefined)).toBeNull();
  });
});
