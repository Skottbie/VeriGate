import { Indexer, MemData } from "@0gfoundation/0g-ts-sdk";
import { ethers } from "ethers";

import { canonicalize } from "./canonical.js";
import { sha256Hex } from "./hash.js";

export const DEFAULT_OG_STORAGE_INDEXER_RPC = "https://indexer-storage-testnet-turbo.0g.ai";
export const DEFAULT_OG_STORAGE_UPLOAD_TIMEOUT_MS = 90_000;

const FORBIDDEN_PUBLIC_KEY_PATTERNS = [
  /^source.*wallet$/i,
  /^source.*wallet.*address$/i,
  /^wallet.*breakdown$/i,
  /^exact.*balance$/i,
  /^balance$/i,
  /^balances$/i,
  /api.*secret/i,
  /private.*key/i,
  /^secret$/i,
  /^authorization$/i,
  /^headers?$/i,
  /^body$/i,
  /request.*headers?/i,
  /request.*body/i,
  /^raw.*proof/i,
];

export function createEventMemoryNamespace(eventId) {
  if (typeof eventId !== "string" || eventId.length === 0) {
    throw new Error("eventId must be a non-empty string");
  }

  return `verigate/events/${eventId}`;
}

export function assertPublicMemorySafe(value, path = "$") {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index++) {
      assertPublicMemorySafe(value[index], `${path}[${index}]`);
    }
    return;
  }

  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      if (FORBIDDEN_PUBLIC_KEY_PATTERNS.some((pattern) => pattern.test(key))) {
        throw new Error(`public memory contains forbidden field ${path}.${key}`);
      }
      assertPublicMemorySafe(nested, `${path}.${key}`);
    }
  }
}

export function encodePublicMemoryJson(record) {
  assertPublicMemorySafe(record);
  return new TextEncoder().encode(`${canonicalize(record)}\n`);
}

export class OgStorageUploadTimeoutError extends Error {
  constructor(timeoutMs) {
    super(
      `0G Storage upload timed out after ${timeoutMs}ms while waiting for the indexer/storage node to sync`,
    );
    this.name = "OgStorageUploadTimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

function parsePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

async function withUploadTimeout(operation, timeoutMs) {
  let timeoutId;
  try {
    return await Promise.race([
      operation,
      new Promise((_, reject) => {
        timeoutId = setTimeout(() => {
          reject(new OgStorageUploadTimeoutError(timeoutMs));
        }, timeoutMs);
      }),
    ]);
  } finally {
    clearTimeout(timeoutId);
  }
}

export function create0GStorageAdapter({
  rpcUrl = process.env.OG_RPC_URL,
  indexerRpc = process.env.OG_STORAGE_INDEXER_RPC ?? DEFAULT_OG_STORAGE_INDEXER_RPC,
  privateKey = process.env.OG_PRIVATE_KEY,
  uploadTimeoutMs = parsePositiveInteger(
    process.env.OG_STORAGE_UPLOAD_TIMEOUT_MS,
    DEFAULT_OG_STORAGE_UPLOAD_TIMEOUT_MS,
  ),
  uploadOptions = {},
} = {}) {
  if (!rpcUrl) {
    throw new Error("OG_RPC_URL is required");
  }
  if (!indexerRpc) {
    throw new Error("OG_STORAGE_INDEXER_RPC is required");
  }
  if (!privateKey) {
    throw new Error("OG_PRIVATE_KEY is required for 0G Storage uploads");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const signer = new ethers.Wallet(privateKey, provider);
  const indexer = new Indexer(indexerRpc);
  const defaultUploadOptions = {
    expectedReplica: 1,
    taskSize: 1,
    finalityRequired: false,
    skipTx: false,
  };

  async function uploadJson({ eventId, namespace, kind, object, uploadOptions: callUploadOptions = {} }) {
    const memoryNamespace = namespace ?? createEventMemoryNamespace(eventId);
    const record = {
      eventId,
      kind,
      namespace: memoryNamespace,
      object,
      schemaVersion: 1,
      storedAt: new Date().toISOString(),
    };
    const encoded = encodePublicMemoryJson(record);
    const data = new MemData(encoded);
    const [tree, treeErr] = await data.merkleTree();
    if (treeErr !== null) {
      throw new Error(`0G merkle tree error: ${treeErr.message}`);
    }

    const localRootHash = tree?.rootHash();
    const [tx, uploadErr] = await withUploadTimeout(
      indexer.upload(data, rpcUrl, signer, {
        ...defaultUploadOptions,
        ...uploadOptions,
        ...callUploadOptions,
      }),
      uploadTimeoutMs,
    );
    if (uploadErr !== null) {
      throw new Error(`0G upload error: ${uploadErr.message}`);
    }
    if (!("rootHash" in tx)) {
      throw new Error("fragmented uploads are not supported for gate memory objects");
    }

    return {
      provider: "0G",
      network: "0G Galileo",
      indexerRpc,
      eventId,
      namespace: memoryNamespace,
      kind,
      rootHash: tx.rootHash,
      localRootHash,
      txHash: tx.txHash,
      txSeq: tx.txSeq,
      contentHash: sha256Hex(Buffer.from(encoded)),
      byteLength: encoded.byteLength,
    };
  }

  async function downloadJson(pointer, { proof = true } = {}) {
    const [blob, downloadErr] = await indexer.downloadToBlob(pointer.rootHash, { proof });
    if (downloadErr !== null) {
      throw new Error(`0G download error: ${downloadErr.message}`);
    }

    const text = await blob.text();
    return JSON.parse(text);
  }

  return {
    indexerRpc,
    rpcUrl,
    uploadJson,
    downloadJson,
  };
}
