import { readFile } from "node:fs/promises";

import { ethers } from "ethers";

import { canonicalize } from "./canonical.js";
import { hashPolicy } from "./hash.js";
import { validateEligibilityPolicy, validateVerificationResult } from "./schemas.js";

export const DEFAULT_KEEPERHUB_API_BASE_URL = "https://app.keeperhub.com";
export const DEFAULT_KEEPERHUB_NETWORK = "sepolia";
export const DEFAULT_OG_DEPLOYMENT_PATH = "deployments/0g-galileo/addresses.json";
export const DEFAULT_KEEPERHUB_DEPLOYMENT_PATH = "deployments/sepolia/addresses.json";
export const KNOWN_UNSUPPORTED_KEEPERHUB_0G_NETWORKS = new Set(["0g-galileo", "16602"]);

export const EVENT_PASS_ABI = [
  "function mintWithVerifiedReceipt(address recipient,bytes32 receiptId,string calldata passTokenURI) external returns (uint256 tokenId)",
  "event EventPassMinted(uint256 indexed tokenId,address indexed recipient,bytes32 indexed eventId,bytes32 receiptId,bytes32 nullifier,string tokenURI)",
];
export const EVENT_PASS_KEEPERHUB_ABI = [
  "function mintWithVerifiedReceipt(address recipient,bytes32 receiptId,string calldata passTokenURI) external returns (uint256 tokenId)",
];

const EVENT_REGISTRY_ABI = [
  "function createEvent(bytes32 eventId,bytes32 policyHash,string calldata metadataURI) external",
  "function getEvent(bytes32 eventId) view returns (tuple(bytes32 eventId,bytes32 policyHash,address organizer,bool active,string metadataURI,uint64 createdAt))",
  "error EventAlreadyExists(bytes32 eventId)",
  "error EventDoesNotExist(bytes32 eventId)",
  "error EmptyPolicyHash()",
];

const VERIFIER_RECEIPT_REGISTRY_ABI = [
  "function recordReceipt((bytes32 receiptId,bytes32 eventId,bytes32 policyHash,bytes32 proofHash,bytes32 nullifier,bool approved,uint64 expiresAt,address verifier,string auditURI) receipt) external",
  "function getReceipt(bytes32 receiptId) view returns (tuple(bytes32 receiptId,bytes32 eventId,bytes32 policyHash,bytes32 proofHash,bytes32 nullifier,bool approved,uint64 expiresAt,address verifier,string auditURI))",
  "error ReceiptAlreadyExists(bytes32 receiptId)",
  "error ReceiptDoesNotExist(bytes32 receiptId)",
  "error EmptyReceiptField()",
  "error NotRecorder(address caller)",
];

const ZERO_BYTES32 = "0x0000000000000000000000000000000000000000000000000000000000000000";

export function buildPassIssuancePlan({
  policy,
  applicantProof,
  verificationResult,
  recipientAddress,
  sourceWalletAddress,
  memory,
} = {}) {
  validateEligibilityPolicy(policy);
  validateVerificationResult(verificationResult);
  assertAddress(recipientAddress, "recipientAddress");
  if (sourceWalletAddress) {
    assertAddress(sourceWalletAddress, "sourceWalletAddress");
    if (recipientAddress.toLowerCase() === sourceWalletAddress.toLowerCase()) {
      throw new Error("fresh pass recipient must not equal the ETH holder source wallet");
    }
  }
  if (!verificationResult.approved) {
    throw new Error(`cannot issue pass for rejected proof: ${verificationResult.reasonCode}`);
  }

  const policyHash = hashPolicy(policy);
  const eventId = deriveChainEventId({ policyId: policy.policyId, policyHash });
  const proofHash = applicantProof?.proof?.proofHash;
  const nullifier = applicantProof?.antiSybil?.eventNullifier;
  assertBytes32(proofHash, "applicantProof.proof.proofHash");
  assertBytes32(nullifier, "applicantProof.antiSybil.eventNullifier");
  if (verificationResult.policyHash !== policyHash) {
    throw new Error("verificationResult.policyHash does not match policy hash");
  }
  if (verificationResult.proofHash !== proofHash) {
    throw new Error("verificationResult.proofHash does not match applicant proof");
  }
  if (verificationResult.eventNullifier !== nullifier) {
    throw new Error("verificationResult.eventNullifier does not match applicant proof");
  }

  const auditPointer = resolveAuditPointer(memory);
  const receiptId = ethers.keccak256(ethers.toUtf8Bytes(canonicalize({
    eventId,
    policyHash,
    proofHash,
    nullifier,
    auditPointer,
  })));
  const expiresAt = applicantProof?.proof?.expiresAt
    ? Math.floor(new Date(applicantProof.proof.expiresAt).getTime() / 1000)
    : 0;

  return {
    eventId,
    policyHash,
    proofHash,
    nullifier,
    receiptId,
    recipientAddress: ethers.getAddress(recipientAddress),
    auditURI: auditPointer,
    tokenURI: auditPointer,
    expiresAt: Number.isFinite(expiresAt) && expiresAt > 0 ? expiresAt : 0,
    recipientPrivacy: {
      recipientType: "fresh_pass_wallet",
      sourceWalletHidden: true,
      exactBalanceHidden: true,
      recipientAddressPublic: true,
    },
  };
}

export function deriveChainEventId({ policyId, policyHash } = {}) {
  if (typeof policyId !== "string" || policyId.length === 0) {
    throw new TypeError("policyId must be a non-empty string");
  }
  assertBytes32(policyHash, "policyHash");
  return ethers.keccak256(ethers.toUtf8Bytes(`verigate:chain-event:v1:${policyId}:${policyHash}`));
}

export async function executePassIssuanceOnchain({
  policy,
  applicantProof,
  verificationResult,
  recipientAddress,
  sourceWalletAddress,
  memory,
  mode = "direct-live",
  deploymentPath = DEFAULT_OG_DEPLOYMENT_PATH,
  rpcUrl = process.env.OG_RPC_URL,
  privateKey = process.env.OG_PRIVATE_KEY,
  keeperHubClient,
} = {}) {
  const plan = buildPassIssuancePlan({
    policy,
    applicantProof,
    verificationResult,
    recipientAddress,
    sourceWalletAddress,
    memory,
  });
  if (mode === "keeperhub-live") {
    const target = resolveKeeperHubExecutionTarget({
      deploymentPath,
      rpcUrl,
      privateKey,
    });
    const deployment = await readDeployment(target.deploymentPath);
    await prepareVerifierReceipt({
      plan,
      deployment,
      rpcUrl: target.rpcUrl,
      privateKey: target.privateKey,
    });
    return executeWithKeeperHub({
      plan,
      deployment,
      keeperHubClient: keeperHubClient ?? createKeeperHubClient({ network: target.network }),
    });
  }

  if (mode === "direct-live") {
    const deployment = await readDeployment(deploymentPath);
    await prepareVerifierReceipt({
      plan,
      deployment,
      rpcUrl,
      privateKey,
    });
    return executeDirectMint({
      plan,
      deployment,
      rpcUrl,
      privateKey,
    });
  }

  if (mode === "dry-run") {
    return {
      tool: "executePassIssuance",
      mode: "dry-run-pass-issuance",
      plan,
      executionReceipt: buildExecutionReceipt({
        plan,
        executor: "KeeperHub",
        mode,
        status: "READY_FOR_MINT",
        txHash: "dry-run:pass-mint-ready",
      }),
    };
  }

  throw new Error(`unsupported pass execution mode: ${mode}`);
}

export function resolveKeeperHubExecutionTarget({
  deploymentPath,
  rpcUrl,
  privateKey,
} = {}) {
  const requestedNetwork = process.env.KH_NETWORK ?? DEFAULT_KEEPERHUB_NETWORK;
  const network = KNOWN_UNSUPPORTED_KEEPERHUB_0G_NETWORKS.has(String(requestedNetwork))
    ? DEFAULT_KEEPERHUB_NETWORK
    : requestedNetwork;
  return {
    network,
    deploymentPath: process.env.KH_DEPLOYMENT_PATH
      ?? (network === "sepolia" ? DEFAULT_KEEPERHUB_DEPLOYMENT_PATH : deploymentPath),
    rpcUrl: process.env.KH_RPC_URL
      ?? (network === "sepolia" ? process.env.SEPOLIA_RPC_URL : rpcUrl)
      ?? "https://ethereum-sepolia-rpc.publicnode.com",
    privateKey: process.env.KH_PRIVATE_KEY
      ?? (network === "sepolia" ? (process.env.SEPOLIA_PRIVATE_KEY ?? process.env.OG_PRIVATE_KEY) : privateKey),
  };
}

export function createKeeperHubClient({
  apiKey = process.env.KH_API_KEY,
  baseUrl = process.env.KH_API_BASE_URL ?? DEFAULT_KEEPERHUB_API_BASE_URL,
  network = process.env.KH_NETWORK ?? DEFAULT_KEEPERHUB_NETWORK,
  fetchImpl = fetch,
} = {}) {
  if (!apiKey) {
    throw new Error("KH_API_KEY is required for KeeperHub live execution");
  }
  assertNonEmptyString(baseUrl, "KH_API_BASE_URL");
  assertNonEmptyString(network, "KH_NETWORK");
  return {
    baseUrl,
    network,
    async contractCall({ contractAddress, functionName, functionArgs, abi, value = "0", gasLimitMultiplier = "1.2" }) {
      const body = buildKeeperHubContractCallBody({
        contractAddress,
        network,
        functionName,
        functionArgs,
        abi,
        value,
        gasLimitMultiplier,
      });
      const response = await fetchImpl(`${baseUrl}/api/execute/contract-call`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          "X-API-Key": apiKey,
        },
        body: JSON.stringify(body),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(formatKeeperHubError("contract-call", payload, response.statusText));
      }
      return payload;
    },
    async status(executionId) {
      assertNonEmptyString(executionId, "executionId");
      const response = await fetchImpl(`${baseUrl}/api/execute/${executionId}/status`, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "X-API-Key": apiKey,
        },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(formatKeeperHubError("status", payload, response.statusText));
      }
      return payload;
    },
  };
}

export function buildKeeperHubContractCallBody({
  contractAddress,
  network,
  functionName,
  functionArgs = [],
  abi,
  value = "0",
  gasLimitMultiplier = "1.2",
} = {}) {
  assertAddress(contractAddress, "contractAddress");
  assertNonEmptyString(network, "network");
  assertNonEmptyString(functionName, "functionName");
  if (!Array.isArray(functionArgs)) {
    throw new TypeError("functionArgs must be an array before KeeperHub JSON-string encoding");
  }
  assertNonEmptyString(value, "value");
  assertNonEmptyString(gasLimitMultiplier, "gasLimitMultiplier");

  return {
    contractAddress,
    network,
    functionName,
    functionArgs: JSON.stringify(functionArgs),
    abi: JSON.stringify(normalizeAbiForKeeperHub(abi)),
    value,
    gasLimitMultiplier,
  };
}

export function normalizeAbiForKeeperHub(abi) {
  if (!Array.isArray(abi)) {
    throw new TypeError("abi must be an array");
  }
  if (abi.length === 0) {
    throw new TypeError("abi must not be empty");
  }
  if (typeof abi[0] === "string") {
    return JSON.parse(new ethers.Interface(abi).formatJson());
  }
  return abi;
}

async function executeWithKeeperHub({ plan, deployment, keeperHubClient = createKeeperHubClient() }) {
  assertKeeperHubNetworkSupportedForDeployment({
    network: keeperHubClient.network,
    deployment,
  });
  const result = await keeperHubClient.contractCall({
    contractAddress: deployment.contracts.EventPassSBT,
    functionName: "mintWithVerifiedReceipt",
    functionArgs: [plan.recipientAddress, plan.receiptId, plan.tokenURI],
    abi: EVENT_PASS_KEEPERHUB_ABI,
  });
  const status = result.executionId ? await keeperHubClient.status(result.executionId) : result;
  const txHash = status.transactionHash ?? result.transactionHash ?? `keeperhub:${result.executionId ?? "submitted"}`;
  return {
    tool: "executePassIssuance",
    mode: "keeperhub-live",
    plan,
    keeperHub: {
      executionId: result.executionId ?? status.executionId,
      status: status.status ?? result.status,
      transactionHash: status.transactionHash ?? result.transactionHash,
      transactionLink: status.transactionLink,
      error: status.error ?? result.error,
      rawStatus: status,
      network: keeperHubClient.network,
    },
    executionReceipt: buildExecutionReceipt({
      plan,
      executor: "KeeperHub",
      mode: "keeperhub-live",
      status: normalizeKeeperHubStatus(status.status ?? result.status),
      txHash,
      transactionLink: status.transactionLink,
      error: status.error ?? result.error,
    }),
  };
}

export function assertKeeperHubNetworkSupportedForDeployment({ network, deployment } = {}) {
  assertNonEmptyString(network, "network");
  if (deployment?.chainId === 16602 && KNOWN_UNSUPPORTED_KEEPERHUB_0G_NETWORKS.has(String(network))) {
    throw new Error(
      [
        `KeeperHub Direct Execution does not currently support 0G Galileo via network=${network}.`,
        "Use Direct live fallback for the 0G deployed pass contract, or deploy a KeeperHub-targeted pass contract on a supported network such as sepolia.",
      ].join(" "),
    );
  }
}

async function executeDirectMint({ plan, deployment, rpcUrl, privateKey }) {
  const { wallet } = createOnchainContext({ rpcUrl, privateKey });
  const eventPass = new ethers.Contract(deployment.contracts.EventPassSBT, EVENT_PASS_ABI, wallet);
  const tx = await eventPass.mintWithVerifiedReceipt(plan.recipientAddress, plan.receiptId, plan.tokenURI);
  const receipt = await tx.wait();
  const parsed = parsePassMinted(eventPass, receipt);
  return {
    tool: "executePassIssuance",
    mode: "direct-live",
    plan,
    onchain: {
      network: deployment.network,
      chainId: deployment.chainId,
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
      tokenId: parsed?.tokenId,
      recipient: parsed?.recipient ?? plan.recipientAddress,
    },
    executionReceipt: buildExecutionReceipt({
      plan,
      executor: "KeeperHub",
      mode: "direct-live",
      status: "MINTED",
      txHash: tx.hash,
      tokenId: parsed?.tokenId,
      blockNumber: receipt.blockNumber,
    }),
  };
}

async function prepareVerifierReceipt({ plan, deployment, rpcUrl, privateKey }) {
  const { wallet } = createOnchainContext({ rpcUrl, privateKey });
  const eventRegistry = new ethers.Contract(deployment.contracts.EventRegistry, EVENT_REGISTRY_ABI, wallet);
  const receiptRegistry = new ethers.Contract(
    deployment.contracts.VerifierReceiptRegistry,
    VERIFIER_RECEIPT_REGISTRY_ABI,
    wallet,
  );

  const eventPrepared = await ensureEvent({ eventRegistry, plan });
  const receiptPrepared = await ensureReceipt({ receiptRegistry, plan, verifier: wallet.address });
  return {
    eventPrepared,
    receiptPrepared,
  };
}

async function ensureEvent({ eventRegistry, plan }) {
  try {
    const existing = await eventRegistry.getFunction("getEvent")(plan.eventId);
    return validateExistingEvent(existing, plan);
  } catch (error) {
    if (!isContractError(error, "EventDoesNotExist")) {
      throw explainContractError(error, "failed to read gate event");
    }
  }

  try {
    const tx = await eventRegistry.createEvent(plan.eventId, plan.policyHash, plan.auditURI);
    const receipt = await tx.wait();
    return {
      status: "created",
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    if (isContractError(error, "EventAlreadyExists")) {
      const existing = await eventRegistry.getFunction("getEvent")(plan.eventId);
      return validateExistingEvent(existing, plan);
    }
    throw explainContractError(error, "failed to create gate event");
  }
}

async function ensureReceipt({ receiptRegistry, plan, verifier }) {
  try {
    const existing = await receiptRegistry.getFunction("getReceipt")(plan.receiptId);
    return {
      status: "already_exists",
      receiptId: existing.receiptId,
    };
  } catch (error) {
    if (!isContractError(error, "ReceiptDoesNotExist")) {
      throw explainContractError(error, "failed to read verifier receipt");
    }
  }

  try {
    const tx = await receiptRegistry.recordReceipt({
      receiptId: plan.receiptId,
      eventId: plan.eventId,
      policyHash: plan.policyHash,
      proofHash: plan.proofHash,
      nullifier: plan.nullifier,
      approved: true,
      expiresAt: plan.expiresAt,
      verifier,
      auditURI: plan.auditURI,
    });
    const receipt = await tx.wait();
    return {
      status: "recorded",
      txHash: tx.hash,
      blockNumber: receipt.blockNumber,
    };
  } catch (error) {
    if (isContractError(error, "ReceiptAlreadyExists")) {
      const existing = await receiptRegistry.getFunction("getReceipt")(plan.receiptId);
      return {
        status: "already_exists",
        receiptId: existing.receiptId,
      };
    }
    throw explainContractError(error, "failed to record verifier receipt");
  }
}

function validateExistingEvent(existing, plan) {
  if (existing.policyHash.toLowerCase() !== plan.policyHash.toLowerCase()) {
    throw new Error(
      `event ${plan.eventId} already exists with a different policy hash; compile a policy with a new policyId`,
    );
  }
  return {
    status: "already_exists",
    eventId: existing.eventId,
    policyHash: existing.policyHash,
  };
}

function isContractError(error, name) {
  return error?.revert?.name === name
    || error?.errorName === name
    || error?.info?.errorName === name
    || error?.data === errorSelector(name)
    || String(error?.message ?? "").includes(name);
}

function errorSelector(name) {
  const signatures = {
    EventAlreadyExists: "EventAlreadyExists(bytes32)",
    EventDoesNotExist: "EventDoesNotExist(bytes32)",
    ReceiptAlreadyExists: "ReceiptAlreadyExists(bytes32)",
    ReceiptDoesNotExist: "ReceiptDoesNotExist(bytes32)",
  };
  return signatures[name] ? ethers.id(signatures[name]).slice(0, 10) : undefined;
}

function explainContractError(error, prefix) {
  const known = error?.revert?.name ?? error?.errorName ?? error?.info?.errorName;
  if (known) {
    return new Error(`${prefix}: ${known}`);
  }
  return new Error(`${prefix}: ${error instanceof Error ? error.message : String(error)}`);
}

function buildExecutionReceipt({
  plan,
  executor,
  mode,
  status,
  txHash,
  transactionLink,
  error,
  tokenId,
  blockNumber,
  now = new Date(),
}) {
  return {
    executor,
    action: "mint_rsvp_pass",
    txHash,
    status,
    createdAt: now.toISOString(),
    recipient: plan.recipientAddress,
    receiptId: plan.receiptId,
    eventId: plan.eventId,
    tokenURI: plan.tokenURI,
    mode,
    transactionLink,
    error,
    tokenId: tokenId?.toString?.() ?? tokenId,
    blockNumber,
    recipientPrivacy: plan.recipientPrivacy,
  };
}

async function readDeployment(path) {
  const deployment = JSON.parse(await readFile(path, "utf8"));
  for (const key of ["EventRegistry", "VerifierReceiptRegistry", "EventPassSBT"]) {
    if (!deployment?.contracts?.[key]) {
      throw new Error(`deployment missing contracts.${key}`);
    }
  }
  return deployment;
}

function createOnchainContext({ rpcUrl = process.env.OG_RPC_URL, privateKey = process.env.OG_PRIVATE_KEY } = {}) {
  if (!rpcUrl) {
    throw new Error("OG_RPC_URL is required for direct pass issuance");
  }
  if (!privateKey) {
    throw new Error("OG_PRIVATE_KEY is required for direct pass issuance");
  }
  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  return { provider, wallet };
}

function parsePassMinted(contract, receipt) {
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "EventPassMinted") {
        return {
          tokenId: parsed.args.tokenId,
          recipient: parsed.args.recipient,
        };
      }
    } catch {
      // Ignore logs from other contracts in the same transaction.
    }
  }
  return null;
}

function resolveAuditPointer(memory) {
  const manifestRoot = memory?.manifestPointer?.rootHash;
  if (manifestRoot) {
    return `0G://${manifestRoot}`;
  }
  const pointer = memory?.auditRecord?.storage?.pointer;
  if (pointer) {
    return pointer;
  }
  return "0G://pending-pass-audit";
}

function normalizeKeeperHubStatus(status) {
  if (status === "completed") {
    return "MINTED";
  }
  if (status === "failed") {
    return "FAILED";
  }
  return "SUBMITTED";
}

function formatKeeperHubError(action, payload, fallback) {
  const parts = [`KeeperHub ${action} failed: ${payload.error ?? fallback}`];
  if (payload.code) {
    parts.push(`code=${payload.code}`);
  }
  if (payload.field) {
    parts.push(`field=${payload.field}`);
  }
  if (payload.details) {
    parts.push(`details=${payload.details}`);
  }
  return parts.join("; ");
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function assertAddress(value, field) {
  if (!ethers.isAddress(value)) {
    throw new TypeError(`${field} must be a valid 0x address`);
  }
}

function assertBytes32(value, field) {
  if (typeof value !== "string" || !/^0x[0-9a-fA-F]{64}$/.test(value) || value === ZERO_BYTES32) {
    throw new TypeError(`${field} must be a non-zero bytes32 hex string`);
  }
}
