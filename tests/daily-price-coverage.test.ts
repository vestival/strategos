import { describe, expect, it } from "vitest";

import { calculateDailyCoverage, chooseBestDailyPrices, mergeDailyPrices } from "@/lib/portfolio/daily-price-coverage";

describe("daily price coverage helpers", () => {
  const scopedAssets = [{ assetKey: "ALGO", balance: 10 }];

  it("calculates non-null coverage for in-scope assets", () => {
    const rows = [
      { assetKey: "ALGO", dayKey: "2026-02-01", priceUsd: 0.2 },
      { assetKey: "ALGO", dayKey: "2026-02-02", priceUsd: null },
      { assetKey: "ALGO", dayKey: "2026-02-03", priceUsd: 0.3 }
    ];

    expect(calculateDailyCoverage(rows, scopedAssets)).toBeCloseTo(2 / 3, 6);
  });

  it("prefers fresh daily rows when stored coverage is poor", () => {
    const stored = [
      { assetKey: "ALGO", dayKey: "2026-02-01", priceUsd: 0.2 },
      { assetKey: "ALGO", dayKey: "2026-02-02", priceUsd: null },
      { assetKey: "ALGO", dayKey: "2026-02-03", priceUsd: null }
    ];
    const fresh = [
      { assetKey: "ALGO", dayKey: "2026-02-01", priceUsd: 0.21 },
      { assetKey: "ALGO", dayKey: "2026-02-02", priceUsd: 0.22 },
      { assetKey: "ALGO", dayKey: "2026-02-03", priceUsd: 0.23 }
    ];

    const chosen = chooseBestDailyPrices({ stored, fresh, scopedAssets });
    expect(chosen).toEqual(fresh);
  });

  it("merges with fresh rows even when stored coverage is solid", () => {
    const stored = [
      { assetKey: "ALGO", dayKey: "2026-02-01", priceUsd: 0.2 },
      { assetKey: "ALGO", dayKey: "2026-02-02", priceUsd: 0.201 },
      { assetKey: "ALGO", dayKey: "2026-02-03", priceUsd: 0.199 }
    ];
    const fresh = [
      { assetKey: "ALGO", dayKey: "2026-02-01", priceUsd: null },
      { assetKey: "ALGO", dayKey: "2026-02-02", priceUsd: 0.202 },
      { assetKey: "ALGO", dayKey: "2026-02-03", priceUsd: null }
    ];

    const chosen = chooseBestDailyPrices({ stored, fresh, scopedAssets });
    expect(chosen).toEqual([
      { assetKey: "ALGO", dayKey: "2026-02-01", priceUsd: 0.2 },
      { assetKey: "ALGO", dayKey: "2026-02-02", priceUsd: 0.202 },
      { assetKey: "ALGO", dayKey: "2026-02-03", priceUsd: 0.199 }
    ]);
  });

  it("merges stored and fresh rows preferring fresh non-null prices", () => {
    const stored = [
      { assetKey: "ALGO", dayKey: "2026-02-01", priceUsd: 0.2 },
      { assetKey: "ALGO", dayKey: "2026-02-02", priceUsd: null }
    ];
    const fresh = [
      { assetKey: "ALGO", dayKey: "2026-02-02", priceUsd: 0.22 },
      { assetKey: "ALGO", dayKey: "2026-02-03", priceUsd: 0.23 }
    ];

    const merged = mergeDailyPrices(stored, fresh);
    expect(merged).toEqual([
      { assetKey: "ALGO", dayKey: "2026-02-01", priceUsd: 0.2 },
      { assetKey: "ALGO", dayKey: "2026-02-02", priceUsd: 0.22 },
      { assetKey: "ALGO", dayKey: "2026-02-03", priceUsd: 0.23 }
    ]);
  });
});
