function decodeBase64(input: string): Uint8Array | null {
  try {
    return Uint8Array.from(Buffer.from(input, "base64"));
  } catch {
    return null;
  }
}

function decodeHex(input: string): Uint8Array | null {
  if (!/^[0-9a-f]+$/i.test(input) || input.length % 2 !== 0) {
    return null;
  }
  try {
    return Uint8Array.from(Buffer.from(input, "hex"));
  } catch {
    return null;
  }
}

function decodeStringPayload(input: string): Uint8Array | null {
  const trimmed = input.trim();
  if (!trimmed) {
    return null;
  }

  const b64 = decodeBase64(trimmed);
  if (b64 && b64.length > 0) {
    return b64;
  }

  const hex = decodeHex(trimmed);
  if (hex && hex.length > 0) {
    return hex;
  }

  return null;
}

function extractFromObject(input: Record<string, unknown>): Uint8Array | null {
  const candidateKeys = ["blob", "signedTxn", "signedTransaction", "txn", "transaction", "txns"];
  for (const key of candidateKeys) {
    if (!(key in input)) continue;
    const extracted = extractSignedTransactionBytes(input[key]);
    if (extracted) {
      return extracted;
    }
  }
  return null;
}

export function extractSignedTransactionBytes(input: unknown): Uint8Array | null {
  if (!input) {
    return null;
  }

  if (input instanceof Uint8Array) {
    return input;
  }

  if (ArrayBuffer.isView(input)) {
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  }

  if (Array.isArray(input)) {
    for (const value of input) {
      const extracted = extractSignedTransactionBytes(value);
      if (extracted) {
        return extracted;
      }
    }
    return null;
  }

  if (typeof input === "string") {
    return decodeStringPayload(input);
  }

  if (typeof input === "object") {
    return extractFromObject(input as Record<string, unknown>);
  }

  return null;
}
