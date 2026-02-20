import { describe, expect, it, vi } from "vitest";

import { getTinymanPositions } from "@/lib/defi/adapters/tinyman";

describe("getTinymanPositions", () => {
  it("builds LP position with component breakdown from Tinyman-like holdings", async () => {
    const positions = await getTinymanPositions(["WALLET_A"], {
      getAccountStateFn: vi.fn().mockResolvedValue({
        address: "WALLET_A",
        algoAmount: 1,
        appsLocalState: [],
        assets: [
          { assetId: 999001, amount: 12.5, decimals: 6 },
          { assetId: 31566704, amount: 100, decimals: 6 }
        ]
      }),
      getAssetInfoFn: vi
        .fn()
        .mockImplementation(async (assetId: number) =>
          assetId === 999001
            ? { decimals: 6, name: "Tinyman Pool Token", unitName: "TMPOOL11" }
            : { decimals: 6, name: "USDC", unitName: "USDC" }
        ),
      getSpotPricesFn: vi.fn().mockResolvedValue({
        "999001": 0.45
      })
    });

    expect(positions).toHaveLength(1);
    expect(positions[0]?.protocol).toBe("Tinyman");
    expect(positions[0]?.positionType).toBe("lp");
    expect(positions[0]?.valueUsd).toBeCloseTo(5.625, 6);
    expect(positions[0]?.meta).toMatchObject({
      source: "tinyman-lp-holdings",
      components: [
        {
          assetId: 999001,
          label: "TMPOOL11",
          amount: 12.5,
          valueUsd: 5.625
        }
      ]
    });
  });

  it("falls back to placeholder when Tinyman app state exists but LP holdings are not detected", async () => {
    const positions = await getTinymanPositions(["WALLET_B"], {
      appIds: [148607000],
      getAccountStateFn: vi.fn().mockResolvedValue({
        address: "WALLET_B",
        algoAmount: 2,
        appsLocalState: [148607000],
        assets: []
      }),
      getAssetInfoFn: vi.fn(),
      getSpotPricesFn: vi.fn()
    });

    expect(positions).toHaveLength(1);
    expect(positions[0]?.protocol).toBe("Tinyman");
    expect(positions[0]?.meta).toMatchObject({
      note: "Detected Tinyman app local state. LP composition not detected from holdings."
    });
  });
});
