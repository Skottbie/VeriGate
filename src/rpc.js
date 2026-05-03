import { ethers } from "ethers";

export const OG_GALILEO_NETWORK = ethers.Network.from({ chainId: 16602, name: "0g-galileo" });
export const SEPOLIA_ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
export const SEPOLIA_NETWORK = ethers.Network.from({
  chainId: 11155111,
  name: "sepolia",
  ensAddress: SEPOLIA_ENS_REGISTRY,
});

const DEFAULT_RPC_RETRIES = Number(process.env.ONCHAIN_RPC_RETRIES ?? 3);
const DEFAULT_RPC_RETRY_INTERVAL_MS = Number(process.env.ONCHAIN_RPC_RETRY_INTERVAL_MS ?? 3000);

export class RetryingJsonRpcProvider extends ethers.JsonRpcProvider {
  constructor(rpcUrl, network, options = {}, retryOptions = {}) {
    super(rpcUrl, network, {
      staticNetwork: network,
      ...options,
    });
    this.retryOptions = {
      retries: Math.max(1, Number(retryOptions.retries ?? DEFAULT_RPC_RETRIES) || 1),
      retryIntervalMs: Math.max(0, Number(retryOptions.retryIntervalMs ?? DEFAULT_RPC_RETRY_INTERVAL_MS) || 0),
    };
  }

  async _send(payload) {
    return await retryRpcOperation(() => super._send(payload), this.retryOptions);
  }
}

export function create0GJsonRpcProvider(rpcUrl, retryOptions = {}) {
  return new RetryingJsonRpcProvider(rpcUrl, OG_GALILEO_NETWORK, {}, retryOptions);
}

export function createSepoliaJsonRpcProvider(rpcUrl, retryOptions = {}) {
  return new RetryingJsonRpcProvider(rpcUrl, SEPOLIA_NETWORK, {}, retryOptions);
}

export function createJsonRpcProviderForChain(rpcUrl, chainId, retryOptions = {}) {
  if (Number(chainId) === Number(OG_GALILEO_NETWORK.chainId)) {
    return create0GJsonRpcProvider(rpcUrl, retryOptions);
  }
  if (Number(chainId) === Number(SEPOLIA_NETWORK.chainId)) {
    return createSepoliaJsonRpcProvider(rpcUrl, retryOptions);
  }
  return new RetryingJsonRpcProvider(rpcUrl, undefined, {}, retryOptions);
}

export async function retryRpcOperation(operation, {
  retries = DEFAULT_RPC_RETRIES,
  retryIntervalMs = DEFAULT_RPC_RETRY_INTERVAL_MS,
} = {}) {
  const attempts = Math.max(1, Number(retries) || 1);
  let lastError = null;
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isRetryableRpcError(error) || attempt >= attempts) {
        throw error;
      }
      await delay(retryIntervalMs);
    }
  }
  throw lastError;
}

export function isRetryableRpcError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return error?.code === "TIMEOUT"
    || error?.code === "NETWORK_ERROR"
    || error?.code === "SERVER_ERROR"
    || /request timeout|failed to detect network|could not coalesce error|missing response|socket|ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|EAI_AGAIN|fetch failed/i.test(message);
}

export function explainRpcError(error, prefix, attempts = DEFAULT_RPC_RETRIES) {
  const message = error instanceof Error ? error.message : String(error);
  const next = new Error(`${prefix}: RPC request failed after ${attempts} attempt${attempts === 1 ? "" : "s"}: ${message}`);
  next.statusCode = 502;
  return next;
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}
