import { ethers } from "ethers";
import { createRequire } from "node:module";
import { access } from "node:fs/promises";

import { canonicalize } from "./canonical.js";
import { generateEventNullifier, hashPolicy, hashProof, sha256Hex } from "./hash.js";
import { validateApplicantProof, validateEligibilityPolicy } from "./schemas.js";

const require = createRequire(import.meta.url);
const DEFAULT_ETH_RPC_URL = "https://ethereum-rpc.publicnode.com";
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
} = {}) {
  validateEligibilityPolicy(policy);
  verifyWalletControlSignature({
    walletAddress,
    message: walletMessage,
    signature: walletSignature,
  });

  if (expiresAt && new Date(expiresAt).getTime() <= new Date(now).getTime()) {
    throw new Error("proof request is expired before zkTLS generation");
  }

  const client = reclaimClient ?? await createReclaimClient();
  const request = createReclaimEthBalanceRequest({ walletAddress, ethRpcUrl });
  const zkResponse = await client.zkFetch(
    request.url,
    request.publicOptions,
    request.privateOptions,
  );

  const balanceHex = extractBalanceHex(zkResponse);
  const qualified = BigInt(balanceHex) > 0n;
  return buildApplicantProofFromReclaim({
    policy,
    walletAddress,
    applicantSecret,
    expiresAt,
    qualified,
    reclaimProof: zkResponse,
  });
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

export function assertPublicProofSafe(value, { forbiddenValues = [] } = {}) {
  const forbidden = forbiddenValues.filter(Boolean).map((item) => String(item).toLowerCase());
  visitPublicValue(value, "$", (path, key, nested) => {
    if (key && FORBIDDEN_PUBLIC_KEYS.some((pattern) => pattern.test(key))) {
      throw new Error(`public proof leaks forbidden key ${path}`);
    }
    if (typeof nested === "string") {
      const lower = nested.toLowerCase();
      for (const secret of forbidden) {
        if (secret && lower.includes(secret)) {
          throw new Error(`public proof leaks forbidden value at ${path}`);
        }
      }
    }
  });
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
