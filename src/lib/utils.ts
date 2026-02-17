export function formatUsd(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return "-";
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

export function shortAddress(address: string): string {
  if (address.length <= 12) {
    return address;
  }
  return `${address.slice(0, 6)}...${address.slice(-6)}`;
}

export function getAlgorandExplorerTxUrl(txId: string): string | null {
  // Explorer cannot resolve synthetic inner-tx path identifiers like "ABC:inner:0".
  if (!/^[A-Z2-7]+$/.test(txId)) {
    return null;
  }
  return `https://explorer.perawallet.app/tx/${txId}`;
}
