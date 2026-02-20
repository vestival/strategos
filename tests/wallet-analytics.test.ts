import { describe, expect, it } from "vitest";

import {
  alignSeriesByTimestamp,
  buildPerWalletAssetBalanceSeries,
  buildPerWalletValueSeries,
  normalizeSeriesToUtcDailyClose,
  sumAlignedSeries
} from "@/lib/portfolio/wallet-analytics";

describe("wallet analytics series", () => {
  it("builds per-wallet value and aggregate series", () => {
    const perWallet = buildPerWalletValueSeries({
      wallets: ["W1", "W2"],
      latestTs: "2026-02-17T00:00:00.000Z",
      latestValueByWallet: { W1: 3, W2: 2 },
      transactions: [
        {
          ts: 1739606400,
          wallet: "W1",
          assetKey: "ALGO",
          amount: 10,
          direction: "in",
          unitPriceUsd: 0.2,
          feeAlgo: 0
        },
        {
          ts: 1739692800,
          wallet: "W2",
          assetKey: "ALGO",
          amount: 5,
          direction: "in",
          unitPriceUsd: 0.4,
          feeAlgo: 0
        }
      ]
    });

    const aligned = alignSeriesByTimestamp(perWallet);
    const aggregate = sumAlignedSeries(aligned);

    expect(perWallet).toHaveLength(2);
    expect(aggregate.points.at(-1)?.value).toBeCloseTo(5);
  });

  it("builds asset balance series with ALGO fee effect", () => {
    const perWallet = buildPerWalletAssetBalanceSeries({
      wallets: ["W1"],
      assetKey: "ALGO",
      latestTs: null,
      latestBalanceByWallet: {},
      transactions: [
        {
          ts: 1739606400,
          wallet: "W1",
          assetKey: "ALGO",
          amount: 1,
          direction: "in",
          unitPriceUsd: 0.2,
          feeAlgo: 0
        },
        {
          ts: 1739692800,
          wallet: "W1",
          assetKey: "USDC",
          amount: 10,
          direction: "in",
          unitPriceUsd: 1,
          feeAlgo: 0.001
        }
      ]
    });

    expect(perWallet[0]?.points.at(-1)?.value).toBeCloseTo(0.999);
  });

  it("normalizes series to UTC daily close points", () => {
    const normalized = normalizeSeriesToUtcDailyClose([
      {
        key: "W1",
        label: "W1",
        points: [
          { ts: "2026-02-18T01:00:00.000Z", value: 10 },
          { ts: "2026-02-18T22:00:00.000Z", value: 15 },
          { ts: "2026-02-19T02:00:00.000Z", value: 8 }
        ]
      }
    ]);

    expect(normalized[0]?.points).toEqual([
      { ts: "2026-02-18T22:00:00.000Z", value: 15 },
      { ts: "2026-02-19T02:00:00.000Z", value: 8 }
    ]);
  });
});
