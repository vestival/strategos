"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import algosdk from "algosdk";
import Link from "next/link";
import { useState } from "react";

import { apiFetch } from "@/lib/api-client";
import { shortAddress } from "@/lib/utils";

type WalletListResponse = {
  wallets: Array<{
    id: string;
    address: string;
    label: string | null;
    verifiedAt: string | null;
  }>;
};

type LinkResponse = {
  challengeId: string;
  noteText: string;
  expiresAt: string;
  receiver: string;
  unsignedTxnB64: string;
  expectedTxId: string;
};

type PeraWallet = {
  connect: () => Promise<string[]>;
  reconnectSession?: () => Promise<string[]>;
  disconnect?: () => Promise<void>;
  signTransaction: (txGroups: unknown, signerAddress?: string) => Promise<Uint8Array[]>;
};

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary);
}

function fromBase64(base64: string): Uint8Array {
  const binary = atob(base64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    out[i] = binary.charCodeAt(i);
  }
  return out;
}

export default function WalletsPage() {
  const [connectedAddress, setConnectedAddress] = useState<string | null>(null);
  const [availableAccounts, setAvailableAccounts] = useState<string[]>([]);
  const [peraWallet, setPeraWallet] = useState<PeraWallet | null>(null);
  const [statusText, setStatusText] = useState<string>("");

  const queryClient = useQueryClient();

  const walletsQuery = useQuery({
    queryKey: ["wallets"],
    queryFn: () => apiFetch<WalletListResponse>("/api/wallets/list")
  });

  const connectedWalletRecord = walletsQuery.data?.wallets.find((w) => w.address === connectedAddress);
  const connectedAlreadyVerified = Boolean(connectedWalletRecord?.verifiedAt);

  const verifyMutation = useMutation({
    mutationFn: (payload: { challengeId: string; signedTxnB64: string }) =>
      apiFetch<{ ok: boolean }>("/api/wallets/verify", { method: "POST", body: JSON.stringify(payload) }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      setStatusText("Wallet verified and linked.");
    },
    onError: (error) => {
      setStatusText(error instanceof Error ? error.message : "Verification failed");
    }
  });

  const deleteWalletMutation = useMutation({
    mutationFn: (walletId: string) =>
      apiFetch<{ ok: boolean }>(`/api/wallets/${walletId}`, {
        method: "DELETE"
      }),
    onSuccess: async (_data, walletId) => {
      const deletedWallet = walletsQuery.data?.wallets.find((w) => w.id === walletId);
      const deletedAddress = deletedWallet?.address ?? null;

      if (deletedAddress && connectedAddress === deletedAddress) {
        setConnectedAddress(null);
      }
      if (deletedAddress) {
        setAvailableAccounts((prev) => prev.filter((account) => account !== deletedAddress));
      }
      await queryClient.invalidateQueries({ queryKey: ["wallets"] });
      await queryClient.invalidateQueries({ queryKey: ["portfolio-snapshot"] });
      setStatusText("Wallet removed.");
    },
    onError: (error) => {
      setStatusText(error instanceof Error ? error.message : "Failed to remove wallet");
    }
  });

  const linkMutation = useMutation({
    mutationFn: () => apiFetch<LinkResponse>("/api/wallets/link", { method: "POST", body: JSON.stringify({ address: connectedAddress }) }),
    onSuccess: async (data) => {
      if (!connectedAddress || !peraWallet) {
        setStatusText("Connect Pera Wallet first.");
        return;
      }

      try {
        setStatusText("Awaiting wallet signature...");
        const unsignedTxnBytes = fromBase64(data.unsignedTxnB64);
        const unsignedTxn = algosdk.decodeUnsignedTransaction(unsignedTxnBytes);
        const signed = await peraWallet.signTransaction(
          [[{ txn: unsignedTxn, signers: [connectedAddress] }]] as unknown,
          connectedAddress
        );
        const signedTxn = signed[0];

        if (!signedTxn) {
          setStatusText("No signed transaction returned by wallet.");
          return;
        }

        setStatusText("Submitting signed transaction...");
        await verifyMutation.mutateAsync({
          challengeId: data.challengeId,
          signedTxnB64: toBase64(new Uint8Array(signedTxn))
        });
      } catch (error) {
        setStatusText(error instanceof Error ? error.message : "Wallet signing failed");
      }
    },
    onError: (error) => {
      setStatusText(error instanceof Error ? error.message : "Challenge creation failed");
    }
  });

  async function connectPeraWallet() {
    try {
      const mod = await import("@perawallet/connect");
      const PeraWalletConnect = mod.PeraWalletConnect;

      const wallet = new PeraWalletConnect() as unknown as PeraWallet;
      let accounts: string[] = [];

      // Force fresh account picker so users can link multiple wallets.
      if (peraWallet?.disconnect) {
        await peraWallet.disconnect();
      }

      try {
        accounts = await wallet.connect();
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        if (message.toLowerCase().includes("session currently connected") && wallet.reconnectSession) {
          accounts = await wallet.reconnectSession();
        } else {
          throw error;
        }
      }

      if (!accounts.length) {
        setPeraWallet(wallet);
        setStatusText("No wallet account returned. If Pera is already connected, use Disconnect and try again.");
        return;
      }

      const linked = new Set((walletsQuery.data?.wallets ?? []).map((w) => w.address));
      const addr = accounts.find((account) => !linked.has(account)) ?? accounts[0];
      if (!algosdk.isValidAddress(addr)) {
        setStatusText("Wallet returned invalid address");
        return;
      }

      setPeraWallet(wallet);
      setAvailableAccounts(accounts);
      setConnectedAddress(addr);
      setStatusText("Wallet connected.");
    } catch (error) {
      setStatusText(error instanceof Error ? error.message : "Wallet connection failed");
    }
  }

  async function disconnectPeraWallet() {
    try {
      if (peraWallet?.disconnect) {
        await peraWallet.disconnect();
      } else {
        const mod = await import("@perawallet/connect");
        const PeraWalletConnect = mod.PeraWalletConnect;
        const wallet = new PeraWalletConnect() as unknown as PeraWallet;
        await wallet.disconnect?.();
      }
    } finally {
      setPeraWallet(null);
      setAvailableAccounts([]);
      setConnectedAddress(null);
      setStatusText("Wallet disconnected.");
    }
  }

  return (
    <main className="min-h-screen bg-slate-50 p-4 text-slate-900 dark:bg-slate-950 dark:text-slate-100 md:p-8">
      <div className="mx-auto max-w-4xl">
        <header className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-semibold">Wallet Linking</h1>
          <Link className="rounded-md border border-slate-300 px-3 py-2 text-sm hover:bg-slate-100 dark:border-slate-700 dark:hover:bg-slate-800" href="/dashboard">
            Back to dashboard
          </Link>
        </header>

        <div className="rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="rounded-md bg-brand-500 px-4 py-2 text-sm hover:bg-brand-700"
              onClick={connectPeraWallet}
              type="button"
            >
              {connectedAddress ? "Switch wallet" : "Connect wallet"}
            </button>
            <button
              className="rounded-md border border-slate-300 px-4 py-2 text-sm hover:bg-slate-100 disabled:opacity-60 dark:border-slate-700 dark:hover:bg-slate-800"
              disabled={!connectedAddress && !peraWallet}
              onClick={disconnectPeraWallet}
              type="button"
            >
              Disconnect
            </button>
          </div>

          <div className="mt-4 rounded-md border border-slate-200 bg-slate-50 p-3 text-sm dark:border-slate-800 dark:bg-slate-950">
            <div className="text-slate-500 dark:text-slate-400">Connected wallet</div>
            <div className="font-medium">{connectedAddress ? shortAddress(connectedAddress) : "Not connected"}</div>
            {availableAccounts.length > 1 && (
              <div className="mt-2">
                <label className="mb-1 block text-xs text-slate-500 dark:text-slate-400" htmlFor="wallet-account-select">
                  Select account
                </label>
                <select
                  id="wallet-account-select"
                  className="w-full rounded-md border border-slate-300 bg-white px-2 py-1.5 text-sm text-slate-900 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100"
                  onChange={(e) => setConnectedAddress(e.target.value)}
                  value={connectedAddress ?? ""}
                >
                  {availableAccounts.map((account) => (
                    <option key={account} value={account}>
                      {account}
                    </option>
                  ))}
                </select>
              </div>
            )}
            {connectedAddress && (
              <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                {connectedAlreadyVerified ? "This wallet is already verified." : "This wallet is not linked yet."}
              </div>
            )}
          </div>

          <button
            className="mt-4 rounded-md bg-brand-500 px-4 py-2 text-sm hover:bg-brand-700 disabled:opacity-60"
            disabled={!connectedAddress || connectedAlreadyVerified || linkMutation.isPending || verifyMutation.isPending}
            onClick={() => linkMutation.mutate()}
            type="button"
          >
            {connectedAlreadyVerified
              ? "Already verified"
              : linkMutation.isPending || verifyMutation.isPending
                ? "Verifying..."
                : "Verify wallet ownership"}
          </button>

          <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
            This creates a 0-ALGO verification transaction with a nonce note, requests wallet signature, and submits it
            automatically.
          </p>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            To link multiple wallets, repeat: connect another wallet, then verify.
          </p>

          {statusText && <p className="mt-3 text-sm text-slate-600 dark:text-slate-300">{statusText}</p>}
        </div>

        <section className="mt-6 rounded-xl border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
          <h2 className="mb-3 text-lg font-medium">Linked wallets</h2>
          <div className="space-y-2">
            {walletsQuery.data?.wallets.map((wallet) => (
              <div className="flex items-start justify-between gap-3 rounded-md border border-slate-200 p-3 text-sm dark:border-slate-800" key={wallet.id}>
                <div>
                  <div className="font-medium">{shortAddress(wallet.address)}</div>
                  <div className="text-slate-500 dark:text-slate-400">Status: {wallet.verifiedAt ? "Verified" : "Pending verification"}</div>
                </div>
                <button
                  className="rounded-md border border-rose-300 px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-50 disabled:opacity-60 dark:border-rose-700 dark:text-rose-300 dark:hover:bg-rose-950/40"
                  disabled={deleteWalletMutation.isPending}
                  onClick={() => {
                    if (!window.confirm(`Remove wallet ${shortAddress(wallet.address)}?`)) {
                      return;
                    }
                    deleteWalletMutation.mutate(wallet.id);
                  }}
                  type="button"
                >
                  Remove
                </button>
              </div>
            ))}
            {!walletsQuery.data?.wallets.length && <p className="text-sm text-slate-500 dark:text-slate-400">No linked wallets yet.</p>}
          </div>
        </section>
      </div>
    </main>
  );
}
