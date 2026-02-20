import { getAccountState, getAssetInfo } from "@/lib/algorand/indexer";
import { getEnv, parseAppIds } from "@/lib/env";
import { getSpotPricesUsd } from "@/lib/price/provider";
import type { DefiAdapter, DefiPosition } from "@/lib/defi/types";

const appIds = parseAppIds(getEnv().TINYMAN_APP_IDS);

type TinymanAdapterDeps = {
  getAccountStateFn?: typeof getAccountState;
  getAssetInfoFn?: typeof getAssetInfo;
  getSpotPricesFn?: typeof getSpotPricesUsd;
  appIds?: number[];
};

type TinymanComponent = {
  assetId: number;
  label: string;
  amount: number;
  valueUsd: number | null;
};

function isTinymanLpAsset(name: string | null, unitName: string | null): boolean {
  const n = (name ?? "").toLowerCase();
  const u = (unitName ?? "").toLowerCase();
  return u.startsWith("tmpool") || n.includes("tinyman") || n.includes("pool token");
}

export const tinymanAdapter: DefiAdapter = {
  async getPositions(wallets) {
    return getTinymanPositions(wallets);
  }
};

export async function getTinymanPositions(wallets: string[], deps: TinymanAdapterDeps = {}): Promise<DefiPosition[]> {
  const getAccountStateFn = deps.getAccountStateFn ?? getAccountState;
  const getAssetInfoFn = deps.getAssetInfoFn ?? getAssetInfo;
  const getSpotPricesFn = deps.getSpotPricesFn ?? getSpotPricesUsd;
  const knownAppIds = deps.appIds ?? appIds;
  const out: DefiPosition[] = [];

  for (const wallet of wallets) {
    const account = await getAccountStateFn(wallet);
    const hasTinymanAppState = account.appsLocalState.some((id) => knownAppIds.includes(id));
    const positiveAssets = account.assets.filter((asset) => asset.amount > 0 && asset.assetId !== null);

    const components: TinymanComponent[] = [];
    for (const asset of positiveAssets) {
      const info = await getAssetInfoFn(asset.assetId as number);
      if (!isTinymanLpAsset(info.name, info.unitName)) {
        continue;
      }

      const label = info.unitName ?? info.name ?? `ASA ${asset.assetId}`;
      components.push({
        assetId: asset.assetId as number,
        label,
        amount: asset.amount,
        valueUsd: null
      });
    }

    const hasTinymanHoldings = components.length > 0;
    if (!hasTinymanAppState && !hasTinymanHoldings) {
      continue;
    }

    if (hasTinymanHoldings) {
      const prices = await getSpotPricesFn(components.map((component) => component.assetId));
      const enriched = components.map((component) => {
        const price = prices[String(component.assetId)] ?? null;
        return {
          ...component,
          valueUsd: price === null ? null : component.amount * price
        };
      });
      const totalValueUsd = enriched.reduce((sum, component) => sum + (component.valueUsd ?? 0), 0);

      out.push({
        protocol: "Tinyman",
        wallet,
        positionType: "lp",
        estimated: true,
        valueUsd: totalValueUsd > 0 ? totalValueUsd : null,
        meta: {
          source: "tinyman-lp-holdings",
          components: enriched
        }
      });
      continue;
    }

    out.push({
      protocol: "Tinyman",
      wallet,
      positionType: "lp",
      estimated: true,
      valueUsd: null,
      meta: {
        note: "Detected Tinyman app local state. LP composition not detected from holdings."
      }
    });
  }

  return out;
}
