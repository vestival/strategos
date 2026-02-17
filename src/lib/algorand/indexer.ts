import { getEnv } from "@/lib/env";
import type { AccountState, AssetHolding, IndexerTxn } from "@/lib/algorand/types";

const env = getEnv();

type IndexerAccountResponse = {
  account: {
    address: string;
    amount: number;
    assets?: Array<{ "asset-id": number; amount: number }>;
    "apps-local-state"?: Array<{ id: number }>;
  };
};

type IndexerAssetResponse = {
  asset: {
    index: number;
    params?: {
      decimals?: number;
      name?: string;
      "unit-name"?: string;
    };
  };
};

type IndexerTxnResponse = {
  "next-token"?: string;
  transactions: Array<{
    id: string;
    sender: string;
    fee: number;
    "confirmed-round-time"?: number;
    "round-time"?: number;
    group?: string;
    note?: string;
    "payment-transaction"?: {
      receiver: string;
      amount: number;
    };
    "asset-transfer-transaction"?: {
      receiver: string;
      amount: number;
      "asset-id": number;
    };
    "inner-txns"?: Array<{
      id?: string;
      sender?: string;
      fee?: number;
      "confirmed-round-time"?: number;
      "round-time"?: number;
      group?: string;
      note?: string;
      "payment-transaction"?: {
        receiver: string;
        amount: number;
      };
      "asset-transfer-transaction"?: {
        receiver: string;
        amount: number;
        "asset-id": number;
      };
      "inner-txns"?: unknown[];
    }>;
  }>;
};

type RawTxn = {
  id?: string;
  sender?: string;
  fee?: number;
  "confirmed-round-time"?: number;
  "round-time"?: number;
  group?: string;
  note?: string;
  "payment-transaction"?: {
    receiver: string;
    amount: number;
  };
  "asset-transfer-transaction"?: {
    receiver: string;
    amount: number;
    "asset-id": number;
  };
  "inner-txns"?: RawTxn[];
};

function mapRawTxn(
  txn: RawTxn,
  fallbackId: string,
  fallbackSender: string,
  fallbackTime: number
): IndexerTxn {
  return {
    id: txn.id ?? fallbackId,
    sender: txn.sender ?? fallbackSender,
    fee: txn.fee ?? 0,
    confirmedRoundTime: txn["confirmed-round-time"] ?? txn["round-time"] ?? fallbackTime,
    group: txn.group,
    note: txn.note,
    paymentTransaction: txn["payment-transaction"],
    assetTransferTransaction: txn["asset-transfer-transaction"]
      ? {
          receiver: txn["asset-transfer-transaction"].receiver,
          amount: txn["asset-transfer-transaction"].amount,
          assetId: txn["asset-transfer-transaction"]["asset-id"]
        }
      : undefined
  };
}

function flattenRawTxn(
  txn: RawTxn & { id: string; sender: string }
): IndexerTxn[] {
  const out: IndexerTxn[] = [];
  const rootTime = txn["confirmed-round-time"] ?? txn["round-time"] ?? 0;
  out.push(mapRawTxn(txn, txn.id, txn.sender, rootTime));

  const queue: Array<{ item: RawTxn; path: string }> = [];
  (txn["inner-txns"] ?? []).forEach((inner, idx) => {
    queue.push({ item: inner, path: `${txn.id}:inner:${idx}` });
  });

  while (queue.length > 0) {
    const current = queue.shift()!;
    out.push(mapRawTxn(current.item, current.path, txn.sender, rootTime));
    (current.item["inner-txns"] ?? []).forEach((nested, idx) => {
      queue.push({ item: nested, path: `${current.path}:inner:${idx}` });
    });
  }

  return out;
}

async function indexerFetch<T>(path: string): Promise<T> {
  const url = `${env.ALGORAND_INDEXER_URL}${path}`;
  const response = await fetch(url, {
    headers: env.ALGORAND_INDEXER_TOKEN
      ? {
          "X-API-Key": env.ALGORAND_INDEXER_TOKEN
        }
      : undefined,
    next: { revalidate: 0 }
  });

  if (!response.ok) {
    throw new Error(`Indexer request failed: ${response.status} ${response.statusText}`);
  }

  return response.json() as Promise<T>;
}

export type AssetInfo = {
  decimals: number;
  name: string | null;
  unitName: string | null;
};

const assetInfoCache = new Map<number, AssetInfo>();

export async function getAssetInfo(assetId: number): Promise<AssetInfo> {
  const cached = assetInfoCache.get(assetId);
  if (cached !== undefined) {
    return cached;
  }

  const data = await indexerFetch<IndexerAssetResponse>(`/v2/assets/${assetId}`);
  const info: AssetInfo = {
    decimals: data.asset.params?.decimals ?? 0,
    name: data.asset.params?.name ?? null,
    unitName: data.asset.params?.["unit-name"] ?? null
  };
  assetInfoCache.set(assetId, info);
  return info;
}

export async function getAssetDecimals(assetId: number): Promise<number> {
  const info = await getAssetInfo(assetId);
  return info.decimals;
}

export async function getAccountState(address: string): Promise<AccountState> {
  const data = await indexerFetch<IndexerAccountResponse>(`/v2/accounts/${address}`);

  const assetRows = data.account.assets ?? [];
  const assets: AssetHolding[] = [];

  for (const row of assetRows) {
    const info = await getAssetInfo(row["asset-id"]);
    assets.push({
      assetId: row["asset-id"],
      amount: row.amount / 10 ** info.decimals,
      decimals: info.decimals
    });
  }

  return {
    address: data.account.address,
    algoAmount: data.account.amount / 1_000_000,
    assets,
    appsLocalState: (data.account["apps-local-state"] ?? []).map((x) => x.id)
  };
}

export async function getTransactionsForAddress(address: string, limit = env.INDEXER_TX_LIMIT): Promise<IndexerTxn[]> {
  const cappedLimit = Math.max(1, limit);
  const encodedAddress = encodeURIComponent(address);

  async function fetchForType(txType: "pay" | "axfer"): Promise<IndexerTxn[]> {
    const collected: IndexerTxn[] = [];
    let nextToken: string | undefined;

    while (collected.length < cappedLimit) {
      const remaining = cappedLimit - collected.length;
      const pageLimit = Math.min(remaining, 1000);
      const nextPart = nextToken ? `&next=${encodeURIComponent(nextToken)}` : "";
      const path = `/v2/transactions?address=${encodedAddress}&tx-type=${txType}&limit=${pageLimit}${nextPart}`;
      const data = await indexerFetch<IndexerTxnResponse>(path);

      const mapped = (data.transactions ?? []).flatMap((txn) =>
        flattenRawTxn(txn as RawTxn & { id: string; sender: string })
      );
      collected.push(...mapped);

      if (!data["next-token"] || data.transactions.length === 0) {
        break;
      }
      nextToken = data["next-token"];
    }

    return collected;
  }

  const [payments, assetTransfers] = await Promise.all([fetchForType("pay"), fetchForType("axfer")]);
  const deduped = new Map<string, IndexerTxn>();
  for (const txn of [...payments, ...assetTransfers]) {
    deduped.set(txn.id, txn);
  }

  return Array.from(deduped.values()).sort((a, b) => b.confirmedRoundTime - a.confirmedRoundTime);
}

export async function findVerificationTransaction(
  address: string,
  notePlainText: string,
  minUnixTime: number,
  maxUnixTime: number
): Promise<IndexerTxn | null> {
  const txns = await getTransactionsForAddress(address, 1000);

  const noteBase64 = Buffer.from(notePlainText, "utf8").toString("base64");

  return (
    txns.find((txn) => {
      if (!txn.note || !txn.paymentTransaction) {
        return false;
      }
      const ts = txn.confirmedRoundTime;
      return ts >= minUnixTime && ts <= maxUnixTime && txn.note === noteBase64;
    }) ?? null
  );
}
