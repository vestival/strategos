import { afterEach, describe, expect, it, vi } from "vitest";

type MockResponse = {
  ok: boolean;
  json: () => Promise<unknown>;
};

function makeResponse(payload: unknown, ok = true): MockResponse {
  return {
    ok,
    json: async () => payload
  };
}

describe("price provider resilience", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.resetModules();
  });

  it("falls back to default CoinGecko endpoint when configured endpoint fails", async () => {
    process.env.PRICE_API_URL = "https://invalid-price-endpoint.example/prices";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({}, false))
      .mockResolvedValueOnce(makeResponse({ algorand: { usd: 0.11 } }, true));
    vi.stubGlobal("fetch", fetchMock);

    const { getSpotPricesUsd } = await import("@/lib/price/provider");
    const prices = await getSpotPricesUsd([null]);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(prices.ALGO).toBe(0.11);
  });

  it("uses last known good cached price when all spot endpoints fail", async () => {
    process.env.PRICE_API_URL = "https://invalid-price-endpoint.example/prices";
    const fetchMock = vi.fn();
    fetchMock
      .mockResolvedValueOnce(makeResponse({}, false))
      .mockResolvedValueOnce(makeResponse({ algorand: { usd: 0.12 }, "usd-coin": { usd: 1 } }, true))
      .mockResolvedValueOnce(makeResponse({}, false))
      .mockResolvedValueOnce(makeResponse({}, false));
    vi.stubGlobal("fetch", fetchMock);

    const { getSpotPricesUsd } = await import("@/lib/price/provider");
    const first = await getSpotPricesUsd([null, 31566704]);
    const second = await getSpotPricesUsd([null, 31566704]);

    expect(first.ALGO).toBe(0.12);
    expect(first["31566704"]).toBe(1);
    expect(second.ALGO).toBe(0.12);
    expect(second["31566704"]).toBe(1);
  });

  it("falls back to DefiLlama when CoinGecko responses are unavailable", async () => {
    process.env.PRICE_API_URL = "https://invalid-price-endpoint.example/prices";
    process.env.DEFI_LLAMA_PRICE_API_URL = "https://coins.llama.fi/prices/current";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({}, false))
      .mockResolvedValueOnce(makeResponse({}, false))
      .mockResolvedValueOnce(
        makeResponse({
          coins: {
            "coingecko:algorand": { price: 0.15 },
            "coingecko:usd-coin": { price: 1 }
          }
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    const { getSpotPricesUsd } = await import("@/lib/price/provider");
    const prices = await getSpotPricesUsd([null, 31566704]);

    expect(prices.ALGO).toBe(0.15);
    expect(prices["31566704"]).toBe(1);
  });
});
