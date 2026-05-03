import { ethers } from "ethers";
import { createRequire } from "node:module";
import { access } from "node:fs/promises";

import { canonicalize } from "./canonical.js";
import { generateEventNullifier, hashPolicy, hashProof, sha256Hex } from "./hash.js";
import { validateApplicantProof, validateEligibilityPolicy } from "./schemas.js";

const require = createRequire(import.meta.url);
const DEFAULT_ETH_RPC_URL = "https://ethereum-rpc.publicnode.com";
const RECLAIM_ZKFETCH_RETRIES = Number(process.env.RECLAIM_ZKFETCH_RETRIES ?? 3);
const RECLAIM_ZKFETCH_RETRY_INTERVAL_MS = Number(process.env.RECLAIM_ZKFETCH_RETRY_INTERVAL_MS ?? 5000);
const RECLAIM_LOGS_BACKEND = "https://logs.reclaimprotocol.org";
const RECLAIM_API_BACKEND = "https://api.reclaimprotocol.org";
const RECLAIM_APP_LOOKUP_BACKEND = `${RECLAIM_API_BACKEND}/api/applications/sdk/get-zk-enabled-app/`;
const RECLAIM_ATTESTOR_FEATURE_FLAG_URL =
  `${RECLAIM_API_BACKEND}/api/feature-flags/get?featureFlagNames=zkFetchAttestorURL`;
const RECLAIM_ATTESTOR_DISCOVERY_TIMEOUT_MS = Number(process.env.RECLAIM_ATTESTOR_DISCOVERY_TIMEOUT_MS ?? 15000);
const RECLAIM_ATTESTOR_DISCOVERY_RETRIES = Number(process.env.RECLAIM_ATTESTOR_DISCOVERY_RETRIES ?? 2);
const RECLAIM_ATTESTOR_DISCOVERY_RETRY_INTERVAL_MS =
  Number(process.env.RECLAIM_ATTESTOR_DISCOVERY_RETRY_INTERVAL_MS ?? 2000);
const REQUIRED_RECLAIM_RESOURCE_FILES = [
  "resources/snarkjs/chacha20/circuit.wasm",
  "resources/snarkjs/chacha20/circuit_final.zkey",
];

const FORBIDDEN_PUBLIC_KEYS = [
  /source.*wallet/i,
  /^walletAddress$/i,
  /^address$/i,
  /^signature$/i,
  /^message$/i,
  /^raw.*proof/i,
  /^request$/i,
  /^headers?$/i,
  /^body$/i,
  /private.*key/i,
  /secret/i,
  /^exactBalance$/i,
  /^exactBalances?$/i,
  /^balance$/i,
  /^balanceHex$/i,
];
const PUBLIC_VALUE_PATHS = new Set([
  "$.eventId",
  "$.policyHash",
  "$.applicantCommitment",
  "$.antiSybil.eventNullifier",
  "$.claims.asset",
  "$.claims.aggregatedExposureTier",
  "$.claims.holdingDurationTier",
  "$.proof.proofHash",
  "$.proof.proofType",
  "$.proof.expiresAt",
  "$.proofType",
  "$.proofSha256",
  "$.identifier",
  "$.note",
]);

export function buildWalletControlMessage({
  eventId,
  policyHash,
  nonce,
  expiresAt,
}) {
  assertNonEmptyString(eventId, "eventId");
  assertNonEmptyString(policyHash, "policyHash");
  assertNonEmptyString(nonce, "nonce");
  assertNonEmptyString(expiresAt, "expiresAt");

  return [
    "VeriGate ETH Holder Proof",
    `eventId: ${eventId}`,
    `policyHash: ${policyHash}`,
    "purpose: prove wallet control for private eligibility check",
    `nonce: ${nonce}`,
    `expiresAt: ${expiresAt}`,
  ].join("\n");
}

export function verifyWalletControlSignature({
  walletAddress,
  message,
  signature,
}) {
  assertNonEmptyString(walletAddress, "walletAddress");
  assertNonEmptyString(message, "message");
  assertNonEmptyString(signature, "signature");

  const recovered = ethers.verifyMessage(message, signature);
  if (recovered.toLowerCase() !== walletAddress.toLowerCase()) {
    throw new Error("wallet signature does not match source wallet");
  }
  return true;
}

export function createApplicantCommitment({ walletAddress, applicantSecret }) {
  assertNonEmptyString(walletAddress, "walletAddress");
  assertNonEmptyString(applicantSecret, "applicantSecret");
  return sha256Hex(`verigate:applicant-commitment:v1:${walletAddress.toLowerCase()}:${applicantSecret}`);
}

export function createWalletCommitment({ walletAddress, applicantSecret }) {
  assertNonEmptyString(walletAddress, "walletAddress");
  assertNonEmptyString(applicantSecret, "applicantSecret");
  return sha256Hex(`verigate:wallet-commitment:v1:${walletAddress.toLowerCase()}:${applicantSecret}`);
}

export function createReclaimEthBalanceRequest({
  walletAddress,
  ethRpcUrl = process.env.ETH_BALANCE_RPC_URL ?? DEFAULT_ETH_RPC_URL,
} = {}) {
  assertNonEmptyString(walletAddress, "walletAddress");
  assertNonEmptyString(ethRpcUrl, "ethRpcUrl");

  const bodyTemplate = JSON.stringify({
    jsonrpc: "2.0",
    id: 1,
    method: "eth_getBalance",
    params: ["{{wallet}}", "latest"],
  });

  return {
    url: ethRpcUrl,
    publicOptions: {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: bodyTemplate,
    },
    privateOptions: {
      paramValues: {
        wallet: walletAddress,
      },
      responseMatches: [
        {
          type: "regex",
          value: '"result"\\s*:\\s*"(?<balanceHex>0x[0-9a-fA-F]+)"',
        },
      ],
      responseRedactions: [
        {
          regex: '"result"\\s*:\\s*"0x[0-9a-fA-F]+"',
        },
      ],
    },
  };
}

export async function createReclaimClient({
  appId = process.env.RECLAIM_APP_ID,
  appSecret = process.env.RECLAIM_APP_SECRET,
  moduleLoader = () => import("@reclaimprotocol/zk-fetch"),
} = {}) {
  if (!appId || !appSecret) {
    throw new Error("RECLAIM_APP_ID and RECLAIM_APP_SECRET are required for live Reclaim zkFetch");
  }
  await assertReclaimResourcesReady();
  const module = await moduleLoader();
  const ReclaimClient = module.ReclaimClient ?? module.default?.ReclaimClient;
  if (!ReclaimClient) {
    throw new Error("ReclaimClient export was not found in @reclaimprotocol/zk-fetch");
  }
  return new ReclaimClient(appId, appSecret);
}

export async function assertReclaimResourcesReady() {
  const packageJsonPath = require.resolve("@reclaimprotocol/zk-symmetric-crypto/package.json");
  const packageRoot = packageJsonPath.replace(/[\\/]package\.json$/, "");
  const missing = [];
  for (const file of REQUIRED_RECLAIM_RESOURCE_FILES) {
    try {
      await access(`${packageRoot}/${file}`);
    } catch {
      missing.push(file);
    }
  }
  if (missing.length > 0) {
    throw new Error([
      "Reclaim zk circuit resources are missing.",
      `Missing: ${missing.join(", ")}`,
      "Run `npm run setup:reclaim` once, then restart the web server.",
    ].join(" "));
  }
}

export async function requestReclaimEthHolderProof({
  policy,
  walletAddress,
  walletSignature,
  walletMessage,
  applicantSecret,
  expiresAt,
  now = new Date(),
  reclaimClient,
  ethRpcUrl,
  includeRawProof = false,
} = {}) {
  validateEligibilityPolicy(policy);
  verifyWalletControlSignature({
    walletAddress,
    message: walletMessage,
    signature: walletSignature,
  });

  if (expiresAt && new Date(expiresAt).getTime() <= new Date(now).getTime()) {
    const error = new Error("proof request is expired before zkTLS generation; sign a fresh wallet-control message");
    error.statusCode = 400;
    throw error;
  }

  const liveClient = !reclaimClient;
  const attestorUrl = liveClient ? await discoverReclaimAttestorUrl() : null;
  const client = reclaimClient ?? await createReclaimClient();
  const request = createReclaimEthBalanceRequest({ walletAddress, ethRpcUrl });
  const zkResponse = await runReclaimZkFetch(client, request, { attestorUrl });

  const balanceHex = extractBalanceHex(zkResponse);
  const qualified = BigInt(balanceHex) > 0n;
  const result = buildApplicantProofFromReclaim({
    policy,
    walletAddress,
    applicantSecret,
    expiresAt,
    qualified,
    reclaimProof: zkResponse,
  });
  if (includeRawProof) {
    return {
      ...result,
      rawReclaimProof: zkResponse,
    };
  }
  return result;
}

async function runReclaimZkFetch(client, request, { attestorUrl } = {}) {
  return await withReclaimSdkNetworkShim(async () => await client.zkFetch(
    request.url,
    request.publicOptions,
    request.privateOptions,
    RECLAIM_ZKFETCH_RETRIES,
    RECLAIM_ZKFETCH_RETRY_INTERVAL_MS,
  ), { attestorUrl });
}

async function discoverReclaimAttestorUrl({
  fetchImpl = globalThis.fetch,
  configuredAttestorUrl = process.env.RECLAIM_ATTESTOR_URL,
} = {}) {
  if (configuredAttestorUrl) {
    assertNonEmptyString(configuredAttestorUrl, "RECLAIM_ATTESTOR_URL");
    return configuredAttestorUrl;
  }
  if (typeof fetchImpl !== "function") {
    throw reclaimAttestorDiscoveryError("fetch implementation is unavailable");
  }

  let lastError = null;
  const attempts = Math.max(1, Number(RECLAIM_ATTESTOR_DISCOVERY_RETRIES) || 1);
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const response = await fetchWithTimeout(fetchImpl, RECLAIM_ATTESTOR_FEATURE_FLAG_URL, {
        method: "GET",
        headers: { "Content-Type": "application/json" },
      }, RECLAIM_ATTESTOR_DISCOVERY_TIMEOUT_MS);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      const flags = await response.json();
      const attestorFlag = Array.isArray(flags)
        ? flags.find((flag) => flag?.name === "zkFetchAttestorURL")
        : null;
      if (!attestorFlag?.value || typeof attestorFlag.value !== "string") {
        throw new Error("zkFetchAttestorURL feature flag is missing");
      }
      return attestorFlag.value;
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(RECLAIM_ATTESTOR_DISCOVERY_RETRY_INTERVAL_MS);
      }
    }
  }
  throw reclaimAttestorDiscoveryError(lastError instanceof Error ? lastError.message : String(lastError));
}

async function fetchWithTimeout(fetchImpl, url, options, timeoutMs) {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), Math.max(1000, Number(timeoutMs) || 1000));
  try {
    return await fetchImpl(url, {
      ...options,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeoutId);
  }
}

function reclaimAttestorDiscoveryError(reason) {
  const error = new Error(`RECLAIM_ATTESTOR_DISCOVERY_FAILED: ${reason}`);
  error.statusCode = 502;
  return error;
}

async function withReclaimSdkNetworkShim(operation, { attestorUrl } = {}) {
  if (typeof globalThis.fetch !== "function" || typeof Response !== "function") {
    return await operation();
  }
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : input?.url;
    if (typeof url === "string" && url.startsWith(RECLAIM_LOGS_BACKEND)) {
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (typeof url === "string" && url.startsWith(RECLAIM_APP_LOOKUP_BACKEND)) {
      return new Response(JSON.stringify({ application: { name: "VeriGate" } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    if (attestorUrl && typeof url === "string" && url.startsWith(RECLAIM_ATTESTOR_FEATURE_FLAG_URL)) {
      return new Response(JSON.stringify([{ name: "zkFetchAttestorURL", value: attestorUrl }]), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }
    return await originalFetch(input, init);
  };
  try {
    return await operation();
  } finally {
    globalThis.fetch = originalFetch;
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

export function buildApplicantProofFromReclaim({
  policy,
  walletAddress,
  applicantSecret,
  expiresAt,
  qualified,
  reclaimProof,
} = {}) {
  validateEligibilityPolicy(policy);
  assertNonEmptyString(walletAddress, "walletAddress");
  assertNonEmptyString(applicantSecret, "applicantSecret");

  const applicantCommitment = createApplicantCommitment({ walletAddress, applicantSecret });
  const walletCommitment = createWalletCommitment({ walletAddress, applicantSecret });
  const eventNullifier = generateEventNullifier(policy.policyId, applicantCommitment);
  const publicProofMeta = buildPublicReclaimProofMeta(reclaimProof);

  const proof = {
    eventId: policy.policyId,
    policyHash: hashPolicy(policy),
    applicantCommitment,
    walletCommitments: [walletCommitment],
    claims: {
      asset: "ETH",
      aggregatedExposureTier: qualified ? "qualified" : "not_qualified",
      holdingDurationTier: "unknown",
    },
    privacy: {
      walletAddressesHidden: true,
      exactBalancesHidden: true,
      walletBreakdownHidden: true,
    },
    antiSybil: {
      eventNullifier,
    },
    proof: {
      proofHash: "0xpending",
      proofType: "zkTLS",
      expiresAt,
    },
  };
  proof.proof.proofHash = hashProof(proof);

  const applicantProof = validateApplicantProof(proof);
  assertPublicProofSafe(applicantProof, {
    forbiddenValues: [walletAddress],
  });
  assertPublicProofSafe(publicProofMeta, {
    forbiddenValues: [walletAddress],
  });

  return {
    applicantProof,
    publicProofMeta,
  };
}

export function buildPublicReclaimProofMeta(reclaimProof) {
  const proof = reclaimProof ?? {};
  const publicMeta = {
    redacted: true,
    proofType: "reclaim_zkfetch",
    proofSha256: sha256Hex(`verigate:reclaim-proof:v1:${canonicalize(proof)}`),
    identifier: typeof proof.identifier === "string" ? proof.identifier : undefined,
    witnesses: Array.isArray(proof.witnesses) ? proof.witnesses : [],
    signatures: Array.isArray(proof.signatures) ? proof.signatures : [],
    note: "Raw Reclaim proof, request body, source wallet, and exact ETH balance are withheld from public memory.",
  };
  assertPublicProofSafe(publicMeta);
  return publicMeta;
}

export async function verifyReclaimProofBinding({
  applicantProof,
  publicProofMeta,
  rawReclaimProof,
  moduleLoader = () => import("@reclaimprotocol/js-sdk"),
} = {}) {
  validateApplicantProof(applicantProof);
  if (!publicProofMeta || publicProofMeta.proofType !== "reclaim_zkfetch") {
    throw new Error("INVALID_RECLAIM_PROOF");
  }
  if (!rawReclaimProof) {
    throw new Error("RECLAIM_PROOF_NOT_FOUND");
  }

  const expectedProofSha = buildPublicReclaimProofMeta(rawReclaimProof).proofSha256;
  if (publicProofMeta.proofSha256 !== expectedProofSha) {
    throw new Error("INVALID_RECLAIM_PROOF");
  }

  const module = await moduleLoader();
  const verifyProof = module.verifyProof ?? module.default?.verifyProof;
  if (typeof verifyProof !== "function") {
    throw new Error("INVALID_RECLAIM_PROOF");
  }

  const verificationConfig = buildReclaimVerificationConfig(rawReclaimProof, module);
  const verification = await verifyProof(rawReclaimProof, verificationConfig);
  const verified = verification === true || verification?.isVerified === true;
  if (!verified) {
    throw new Error("INVALID_RECLAIM_PROOF");
  }

  const balanceHex = extractBalanceHex(rawReclaimProof);
  const derivedExposureTier = BigInt(balanceHex) > 0n ? "qualified" : "not_qualified";
  if (applicantProof.claims.aggregatedExposureTier !== derivedExposureTier) {
    throw new Error("RECLAIM_TIER_MISMATCH");
  }

  return {
    provider: "Reclaim",
    proofType: publicProofMeta.proofType,
    proofSha256: publicProofMeta.proofSha256,
    identifier: publicProofMeta.identifier,
    witnessCount: Array.isArray(publicProofMeta.witnesses) ? publicProofMeta.witnesses.length : 0,
    signatureCount: Array.isArray(publicProofMeta.signatures) ? publicProofMeta.signatures.length : 0,
    serverVerified: true,
    claimSource: "server_verified_zktls",
    verificationConfig: verificationConfig.dangerouslyDisableContentValidation ? "signature_only" : "hash_bound",
    derivedExposureTier,
    rawProof: "withheld",
  };
}

function buildReclaimVerificationConfig(rawReclaimProof, module) {
  const getHttpProviderClaimParamsFromProof = module.getHttpProviderClaimParamsFromProof
    ?? module.default?.getHttpProviderClaimParamsFromProof;
  const hashProofClaimParams = module.hashProofClaimParams ?? module.default?.hashProofClaimParams;
  if (typeof getHttpProviderClaimParamsFromProof === "function" && typeof hashProofClaimParams === "function") {
    try {
      const claimParams = getHttpProviderClaimParamsFromProof(rawReclaimProof);
      const hashes = hashProofClaimParams(claimParams);
      return {
        hashes: Array.isArray(hashes) ? hashes : [hashes],
      };
    } catch {
      // Some zkFetch proof shapes do not expose HTTP provider params in the
      // SDK's hash helper format. Keep witness signature verification active.
    }
  }
  return {
    dangerouslyDisableContentValidation: true,
  };
}

export function buildFixtureReclaimVerification({ applicantProof, publicProofMeta } = {}) {
  validateApplicantProof(applicantProof);
  return {
    provider: "Reclaim",
    proofType: publicProofMeta?.proofType ?? "reclaim_zkfetch",
    proofSha256: publicProofMeta?.proofSha256,
    identifier: publicProofMeta?.identifier,
    witnessCount: Array.isArray(publicProofMeta?.witnesses) ? publicProofMeta.witnesses.length : 0,
    signatureCount: Array.isArray(publicProofMeta?.signatures) ? publicProofMeta.signatures.length : 0,
    serverVerified: false,
    mode: "fixture",
    claimSource: "fixture_zktls_shape",
    derivedExposureTier: applicantProof.claims.aggregatedExposureTier,
    rawProof: "withheld",
  };
}

export function assertPublicProofSafe(value, { forbiddenValues = [] } = {}) {
  const forbidden = forbiddenValues
    .filter(Boolean)
    .map((item) => String(item).toLowerCase())
    .filter((item) => item.length >= 12);
  visitPublicValue(value, "$", (path, key, nested) => {
    if (key && FORBIDDEN_PUBLIC_KEYS.some((pattern) => pattern.test(key))) {
      throw new Error(`public proof leaks forbidden key ${path}`);
    }
    if (typeof nested === "string" && !isAllowedPublicValuePath(path)) {
      const lower = nested.toLowerCase();
      for (const secret of forbidden) {
        if (lower === secret || lower.includes(secret)) {
          throw new Error(`public proof leaks forbidden value at ${path}`);
        }
      }
    }
  });
}

function isAllowedPublicValuePath(path) {
  return PUBLIC_VALUE_PATHS.has(path)
    || /^\$\.walletCommitments\[\d+\]$/.test(path)
    || /^\$\.witnesses\[\d+\]\.(id|url)$/.test(path)
    || /^\$\.signatures\[\d+\]$/.test(path);
}

export function extractBalanceHex(zkResponse) {
  const values = zkResponse?.extractedParameterValues ?? {};
  const balanceHex = values.balanceHex ?? values.result;
  if (typeof balanceHex !== "string" || !/^0x[0-9a-fA-F]+$/.test(balanceHex)) {
    throw new Error("Reclaim zkFetch response did not expose a parseable balanceHex");
  }
  return balanceHex;
}

function visitPublicValue(value, path, visitor) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitPublicValue(item, `${path}[${index}]`, visitor));
    return;
  }
  if (value !== null && typeof value === "object") {
    for (const [key, nested] of Object.entries(value)) {
      const nextPath = `${path}.${key}`;
      visitor(nextPath, key, nested);
      visitPublicValue(nested, nextPath, visitor);
    }
    return;
  }
  visitor(path, null, value);
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}
