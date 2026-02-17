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
});
