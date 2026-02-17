import { describe, expect, it } from "vitest";

import { computePortfolioSnapshot } from "@/lib/portfolio/snapshot";

describe("computePortfolioSnapshot", () => {
  it("builds a snapshot with balances and pnl using mocked dependencies", async () => {
    const snapshot = await computePortfolioSnapshot(["W1"], {
      getAccountStateFn: async () => ({
        address: "W1",
        algoAmount: 10,
        assets: [
          {
            assetId: 31566704,
            amount: 100,
            decimals: 6
          }
        ],
        appsLocalState: [552635992]
      }),
      getTransactionsFn: async () => [
        {
          id: "tx1",
          sender: "X",
          fee: 1000,
          confirmedRoundTime: 1,
          paymentTransaction: {
            receiver: "W1",
            amount: 10_000_000
          }
        },
        {
          id: "tx2",
          sender: "W1",
          fee: 1000,
          confirmedRoundTime: 2,
          assetTransferTransaction: {
            receiver: "Y",
            amount: 10_000_000,
            assetId: 31566704
          }
        }
      ],
      getSpotPricesFn: async () => ({
        ALGO: 2,
        "31566704": 1
      }),
      getDefiPositionsFn: async () => [
        {
          protocol: "Tinyman",
          wallet: "W1",
          positionType: "lp",
          estimated: true,
          valueUsd: null
        }
      ]
    });

    expect(snapshot.assets.length).toBeGreaterThan(0);
    expect(snapshot.totals.valueUsd).toBeGreaterThan(0);
    expect(snapshot.defiPositions.length).toBe(1);
    expect(snapshot.method).toBe("FIFO");
    expect(typeof snapshot.priceAsOf).toBe("string");
  });

  it("attributes wallet cost basis from inbound buys, not only sender txns", async () => {
    const snapshot = await computePortfolioSnapshot(["W1"], {
      getAccountStateFn: async () => ({
        address: "W1",
        algoAmount: 5,
        assets: [],
        appsLocalState: []
      }),
      getTransactionsFn: async () => [
        {
          id: "inbound-buy",
          sender: "X",
          fee: 1000,
          confirmedRoundTime: 1,
          paymentTransaction: {
            receiver: "W1",
            amount: 5_000_000
          }
        }
      ],
      getSpotPricesFn: async () => ({
        ALGO: 2
      }),
      getDefiPositionsFn: async () => []
    });

    expect(snapshot.wallets).toHaveLength(1);
    expect(snapshot.wallets[0]?.totalCostBasisUsd).toBeCloseTo(10);
  });

  it("sanitizes invalid numeric values so cost basis and pnl remain displayable", async () => {
    const snapshot = await computePortfolioSnapshot(["W1"], {
      getAccountStateFn: async () => ({
        address: "W1",
        algoAmount: 1,
        assets: [],
        appsLocalState: []
      }),
      getTransactionsFn: async () => [
        {
          id: "bad-fee",
          sender: "X",
          fee: Number.NaN,
          confirmedRoundTime: 1,
          paymentTransaction: {
            receiver: "W1",
            amount: 1_000_000
          }
        }
      ],
      getSpotPricesFn: async () => ({
        ALGO: 0.1
      }),
      getDefiPositionsFn: async () => []
    });

    expect(Number.isFinite(snapshot.totals.costBasisUsd)).toBe(true);
    expect(Number.isFinite(snapshot.totals.realizedPnlUsd)).toBe(true);
    expect(Number.isFinite(snapshot.totals.unrealizedPnlUsd)).toBe(true);
    expect(Number.isFinite(snapshot.assets[0]?.costBasisUsd ?? Number.NaN)).toBe(true);
  });

  it("uses historical tx-date pricing for transaction value and cost basis", async () => {
    const snapshot = await computePortfolioSnapshot(["W1"], {
      getAccountStateFn: async () => ({
        address: "W1",
        algoAmount: 1,
        assets: [],
        appsLocalState: []
      }),
      getTransactionsFn: async () => [
        {
          id: "tx-historical",
          sender: "X",
          fee: 1000,
          confirmedRoundTime: 1_700_000_000,
          paymentTransaction: {
            receiver: "W1",
            amount: 1_000_000
          }
        }
      ],
      getSpotPricesFn: async () => ({
        ALGO: 0.1
      }),
      getHistoricalPricesFn: async () => ({
        ALGO: 0.1,
        "ALGO:14-11-2023": 0.2
      }),
      getDefiPositionsFn: async () => []
    });

    expect(snapshot.transactions[0]?.valueUsd).toBeCloseTo(0.2);
    expect(snapshot.assets.find((a) => a.assetKey === "ALGO")?.costBasisUsd).toBeCloseTo(0.2);
  });

  it("falls back to spot price when historical price is unavailable for a tx date", async () => {
    const snapshot = await computePortfolioSnapshot(["W1"], {
      getAccountStateFn: async () => ({
        address: "W1",
        algoAmount: 1,
        assets: [],
        appsLocalState: []
      }),
      getTransactionsFn: async () => [
        {
          id: "tx-spot-fallback",
          sender: "X",
          fee: 1000,
          confirmedRoundTime: 1_700_000_000,
          paymentTransaction: {
            receiver: "W1",
            amount: 1_000_000
          }
        }
      ],
      getSpotPricesFn: async () => ({
        ALGO: 0.1
      }),
      getHistoricalPricesFn: async () => ({
        "ALGO:14-11-2023": null
      }),
      getDefiPositionsFn: async () => []
    });

    expect(snapshot.transactions[0]?.valueUsd).toBeCloseTo(0.1);
  });
});
