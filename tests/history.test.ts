import { describe, expect, it } from "vitest";

import { buildPortfolioHistoryFromTransactions } from "@/lib/portfolio/history";

describe("buildPortfolioHistoryFromTransactions", () => {
  it("builds day points from transaction replay and appends latest snapshot value", () => {
    const history = buildPortfolioHistoryFromTransactions({
      transactions: [
        {
          ts: 1739606400, // 2025-02-15
          assetKey: "ALGO",
          amount: 10,
          direction: "in",
          unitPriceUsd: 0.2,
          feeAlgo: 0
        },
        {
          ts: 1739692800, // 2025-02-16
          assetKey: "ALGO",
          amount: 2,
          direction: "out",
          unitPriceUsd: 0.3,
          feeAlgo: 0.001
        }
      ],
      latestValueUsd: 2.41,
      latestTs: "2025-02-17T08:00:00.000Z"
    });

    expect(history).toHaveLength(3);
    expect(history[0]?.valueUsd).toBeCloseTo(2); // 10 * 0.2
    expect(history[1]?.valueUsd).toBeCloseTo(2.3997, 4); // (10 - 2 - 0.001) * 0.3
    expect(history[2]).toEqual({ ts: "2025-02-17T08:00:00.000Z", valueUsd: 2.41 });
  });

  it("ignores invalid transactions", () => {
    const history = buildPortfolioHistoryFromTransactions({
      transactions: [
        {
          ts: 0,
          assetKey: "ALGO",
          amount: 1,
          direction: "in",
          unitPriceUsd: 0.1,
          feeAlgo: 0
        },
        {
          ts: 1739606400,
          assetKey: "ALGO",
          amount: 1,
          direction: "in",
          unitPriceUsd: 0.1,
          feeAlgo: 0
        }
      ]
    });

    expect(history).toHaveLength(1);
    expect(history[0]?.valueUsd).toBeCloseTo(0.1);
  });

  it("anchors replay to latest asset balances to avoid drift from incomplete older history", () => {
    const history = buildPortfolioHistoryFromTransactions({
      transactions: [
        {
          ts: 1738022400, // 2025-01-28
          assetKey: "ALGO",
          amount: 25000,
          direction: "out",
          unitPriceUsd: 0.12,
          feeAlgo: 0
        },
        {
          ts: 1738022400, // 2025-01-28
          assetKey: "2537013734",
          amount: 23491.03,
          direction: "in",
          unitPriceUsd: 0.09,
          feeAlgo: 0
        }
      ],
      latestValueUsd: 2189.38,
      latestTs: "2026-02-18T11:57:26.000Z",
      latestAssetStates: [
        { assetKey: "ALGO", balance: 4.68, priceUsd: 0.09 },
        { assetKey: "2537013734", balance: 23491.03, priceUsd: 0.09 }
      ]
    });

    expect(history.length).toBeGreaterThan(0);
    expect(history[history.length - 1]?.valueUsd).toBeCloseTo(2189.38, 2);
    expect(history[0]?.valueUsd).toBeGreaterThan(0);
    expect(history[0]?.valueUsd).toBeLessThan(10000);
  });

  it("does not let same-timestamp transactions overwrite the latest anchor point", () => {
    const history = buildPortfolioHistoryFromTransactions({
      transactions: [
        {
          ts: 1739870400,
          assetKey: "ALGO",
          amount: 0,
          direction: "self",
          unitPriceUsd: 0.09,
          feeAlgo: 0.001
        }
      ],
      latestValueUsd: 2188.2,
      latestTs: "2025-02-18T00:00:00.000Z",
      latestAssetStates: [{ assetKey: "ALGO", balance: 4.68, priceUsd: 0.09 }]
    });

    expect(history).toHaveLength(1);
    expect(history[0]?.valueUsd).toBeCloseTo(2188.2, 2);
  });

  it("builds UTC end-of-day points for anchored history", () => {
    const history = buildPortfolioHistoryFromTransactions({
      transactions: [
        {
          ts: 1738020000, // 2025-01-28T03:20:00Z
          assetKey: "ALGO",
          amount: 10,
          direction: "in",
          unitPriceUsd: 0.1,
          feeAlgo: 0
        },
        {
          ts: 1738106400, // 2025-01-29T03:20:00Z
          assetKey: "ALGO",
          amount: 5,
          direction: "out",
          unitPriceUsd: 0.2,
          feeAlgo: 0
        }
      ],
      latestValueUsd: 1,
      latestTs: "2025-01-29T23:30:00.000Z",
      latestAssetStates: [{ assetKey: "ALGO", balance: 5, priceUsd: 0.2 }]
    });

    expect(history.length).toBeGreaterThanOrEqual(2);
    expect(history.every((point) => point.ts.endsWith("T23:59:59.999Z"))).toBe(true);
  });
});
