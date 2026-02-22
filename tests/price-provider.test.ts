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

  it("returns price source/confidence metadata for spot quotes", async () => {
    process.env.PRICE_API_URL = "https://invalid-price-endpoint.example/prices";
    process.env.DEFI_LLAMA_PRICE_API_URL = "https://coins.llama.fi/prices/current";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({}, false))
      .mockResolvedValueOnce(makeResponse({}, false))
      .mockResolvedValueOnce(makeResponse({ coins: { "coingecko:algorand": { price: 0.2 } } }));
    vi.stubGlobal("fetch", fetchMock);

    const { getSpotPriceQuotes } = await import("@/lib/price/provider");
    const quotes = await getSpotPriceQuotes([null]);

    expect(quotes.ALGO.usd).toBe(0.2);
    expect(quotes.ALGO.source).toBe("defillama");
    expect(quotes.ALGO.confidence).toBe("medium");
  });

  it("uses DexScreener fallback for unmapped/missing ASA prices (e.g. tALGO)", async () => {
    process.env.PRICE_API_URL = "https://invalid-price-endpoint.example/prices";
    process.env.DEFI_LLAMA_PRICE_API_URL = "https://custom-llama-endpoint.example/current";
    process.env.DEXSCREENER_PRICE_API_URL = "https://api.dexscreener.com/latest/dex/search";
    process.env.ASA_PRICE_MAP_JSON = "{}";

    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("dexscreener.com/latest/dex/search") && url.includes("q=2537013734")) {
        return makeResponse({
          pairs: [
            {
              chainId: "algorand",
              priceUsd: "0.095",
              liquidity: { usd: 120000 },
              baseToken: { address: "2537013734" },
              quoteToken: { symbol: "ALGO" }
            }
          ]
        });
      }

      return makeResponse({}, false);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getSpotPriceQuotes } = await import("@/lib/price/provider");
    const quotes = await getSpotPriceQuotes([null, 2537013734]);
    const calledUrls = fetchMock.mock.calls.map((args) => String(args[0]));

    expect(quotes.ALGO.usd).toBeNull();
    expect(calledUrls.some((url) => url.includes("dexscreener.com/latest/dex/search") && url.includes("q=2537013734"))).toBe(true);
    expect(quotes["2537013734"].usd).toBe(0.095);
    expect(quotes["2537013734"].source).toBe("dexscreener");
    expect(quotes["2537013734"].confidence).toBe("medium");
  });

  it("uses CoinGecko token-price fallback for unmapped ASA ids (e.g. X-NFT)", async () => {
    process.env.PRICE_API_URL = "https://invalid-price-endpoint.example/prices";
    process.env.DEFI_LLAMA_PRICE_API_URL = "https://custom-llama-endpoint.example/current";
    process.env.DEXSCREENER_PRICE_API_URL = "https://api.dexscreener.com/latest/dex/search";
    process.env.ASA_PRICE_MAP_JSON = "{}";

    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/simple/token_price/algorand") && url.includes("contract_addresses=1164556102")) {
        return makeResponse({
          "1164556102": {
            usd: 0.6177
          }
        });
      }
      return makeResponse({}, false);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getSpotPriceQuotes } = await import("@/lib/price/provider");
    const quotes = await getSpotPriceQuotes([1164556102]);
    const tokenCalls = fetchMock.mock.calls.filter((call) => String(call[0]).includes("/simple/token_price/algorand"));

    expect(tokenCalls.length).toBeGreaterThanOrEqual(1);
    expect(String(tokenCalls[0]?.[0])).toContain("/simple/token_price/algorand");
    expect(quotes["1164556102"].usd).toBe(0.6177);
    expect(["configured", "coingecko"]).toContain(quotes["1164556102"].source);
    expect(quotes["1164556102"].confidence).toBe("high");
  });

  it("falls back to DexScreener when token-price endpoint has no quote", async () => {
    process.env.PRICE_API_URL = "https://invalid-price-endpoint.example/prices";
    process.env.DEFI_LLAMA_PRICE_API_URL = "https://custom-llama-endpoint.example/current";
    process.env.DEXSCREENER_PRICE_API_URL = "https://api.dexscreener.com/latest/dex/search";
    process.env.ASA_PRICE_MAP_JSON = "{}";

    const fetchMock = vi.fn(async (input: unknown) => {
      const url = String(input);
      if (url.includes("/simple/token_price/algorand")) {
        return makeResponse({}, true);
      }
      if (url.includes("dexscreener.com/latest/dex/search") && url.includes("q=1164556102")) {
        return makeResponse({
          pairs: [
            {
              chainId: "algorand",
              priceUsd: "0.618",
              liquidity: { usd: 10000 },
              baseToken: { address: "1164556102" },
              quoteToken: { symbol: "ALGO" }
            }
          ]
        });
      }
      return makeResponse({}, false);
    });
    vi.stubGlobal("fetch", fetchMock);

    const { getSpotPriceQuotes } = await import("@/lib/price/provider");
    const quotes = await getSpotPriceQuotes([1164556102]);

    expect(quotes["1164556102"].usd).toBe(0.618);
    expect(quotes["1164556102"].source).toBe("dexscreener");
    expect(quotes["1164556102"].confidence).toBe("medium");
  });

  it("retries historical day fetch when a previous attempt returned null", async () => {
    process.env.PRICE_API_URL = "https://api.coingecko.com/api/v3/simple/price";
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(makeResponse({ prices: [] })) // range attempt #1
      .mockResolvedValueOnce(makeResponse({ market_data: { current_price: {} } })) // day fallback #1 => null
      .mockResolvedValueOnce(makeResponse({ prices: [] })) // range attempt #2
      .mockResolvedValueOnce(makeResponse({ market_data: { current_price: { usd: 0.25 } } })); // day fallback #2
    vi.stubGlobal("fetch", fetchMock);

    const { getHistoricalPricesUsdByDay, getHistoricalPriceKey } = await import("@/lib/price/provider");
    const ts = 1767225600; // 2026-01-01 00:00:00 UTC

    const first = await getHistoricalPricesUsdByDay(["ALGO"], [ts]);
    const second = await getHistoricalPricesUsdByDay(["ALGO"], [ts]);
    const key = getHistoricalPriceKey("ALGO", ts);

    expect(first[key]).toBeNull();
    expect(second[key]).toBe(0.25);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
