import { readFile } from "node:fs/promises";

import {
  buildPolicyCompilerPrompt,
  create0GComputeAdapter,
  createComputeReceipt,
  finalizePolicyDraft,
} from "../../src/ogCompute.js";
import { create0GStorageAdapter, createEventMemoryNamespace } from "../../src/ogStorage.js";
import {
  assertPublicProofSafe,
  canonicalize,
  generateEventNullifier,
  hashPolicy,
  hashProof,
  verifyProof,
} from "../../src/index.js";
import {
  validateAuditRecord,
  validateEligibilityPolicy,
  validateExecutionReceipt,
  validateVerificationResult,
} from "../../src/schemas.js";

export const DEFAULT_ORGANIZER_INTENT = [
  "Create an Open Agents ETH holder gate.",
  "Applicants should prove qualified ETH exposure without revealing wallet addresses, exact balances, or wallet breakdowns.",
  "On pass, prepare an RSVP pass issuance through KeeperHub.",
].join(" ");

export const DEFAULT_NOW = "2026-04-28T12:00:00.000Z";

export async function createPolicyFromIntent(options = {}) {
  const mode = options.mode ?? "0g-compute-live";
  if (mode === "dry-run") {
    return createPolicyFromIntentDryRun(options);
  }
  if (mode === "0g-compute-live") {
    return createPolicyFromIntentWith0GCompute(options);
  }
  throw new Error(`unsupported policy compiler mode: ${mode}`);
}

export async function createPolicyFromIntentDryRun({
  organizerIntent = DEFAULT_ORGANIZER_INTENT,
  organizerAddress,
  now = DEFAULT_NOW,
} = {}) {
  const prompt = buildPolicyCompilerPrompt(organizerIntent, { organizerAddress });
  const rawOutput = JSON.stringify({
    policyId: "policy-open-agents-eth-holder-v1",
    eventName: "Open Agents ETH Holder Gate",
    organizer: organizerAddress ?? "0xBC4CaCC01E81C7b9258DF424260342D3De72B3d8",
    requiredClaims: ["ETH_HOLDER"],
    privacy: {
      revealWalletAddress: false,
      revealExactBalance: false,
      revealWalletBreakdown: false,
      disclosureMode: "tier_only",
    },
    antiSybil: {
      enabled: true,
      nullifierScope: "event",
    },
    execution: {
      onPass: "mint_rsvp_pass",
      executor: "keeperhub",
    },
    metadata: {
      verifierVersion: "p1-deterministic-verifier",
      agentVersion: "p5-openclaw-agent",
      createdAt: now,
    },
  });
  const policyDraft = finalizePolicyDraft(JSON.parse(rawOutput), {
    now: new Date(now),
    agentVersion: "p5-openclaw-agent",
    organizerAddress,
  });
  const computeReceipt = createComputeReceipt({
    prompt,
    output: rawOutput,
    policyDraft,
    provider: "local-dry-run",
    model: "template-policy-compiler",
    storagePointer: "0G://dry-run/compute-receipt",
    now: new Date(now),
  });

  return {
    tool: "createPolicyFromIntent",
    mode: "dry-run",
    organizerIntent,
    policyDraft,
    computeReceipt,
    rawOutput,
  };
}

export async function createPolicyFromIntentWith0GCompute({
  organizerIntent = DEFAULT_ORGANIZER_INTENT,
  organizerAddress,
  adapter = create0GComputeAdapter(),
} = {}) {
  const result = await adapter.compilePolicyWith0GCompute(organizerIntent, { organizerAddress });
  return {
    tool: "createPolicyFromIntent",
    mode: "0g-compute-live",
    organizerIntent,
    policyDraft: result.policyDraft,
    computeReceipt: result.computeReceipt,
    rawOutput: result.rawOutput,
    metadata: result.metadata,
  };
}

export function validatePolicy(policyDraft) {
  const policy = validateEligibilityPolicy(policyDraft);
  return {
    tool: "validatePolicy",
    valid: true,
    policyHash: hashPolicy(policy),
    policy,
  };
}

export function generatePrivacyPlan(policyDraft) {
  validateEligibilityPolicy(policyDraft);
  return {
    tool: "generatePrivacyPlan",
    asset: "ETH",
    disclosureMode: policyDraft.privacy.disclosureMode,
    publicFields: [
      "eventId",
      "policyHash",
      "applicantCommitment",
      "eventNullifier",
      "aggregatedExposureTier",
      "proofHash",
      "proofType",
    ],
    hiddenFields: [
      "sourceWalletAddress",
      "exactBalance",
      "walletBreakdown",
      "requestHeaders",
      "rawProof",
    ],
  };
}

export function requestApplicantProof({
  policyDraft,
  applicantCommitment = "0x9e1f5b84e3a9a6a2f0a7a92ef13f06f59e03512d9d26d35f2b9f0af6b6e4e0a1",
  expiresAt = "2026-05-06T23:59:59.000Z",
} = {}) {
  validateEligibilityPolicy(policyDraft);
  const eventNullifier = generateEventNullifier(policyDraft.policyId, applicantCommitment);
  const proof = {
    eventId: policyDraft.policyId,
    policyHash: hashPolicy(policyDraft),
    applicantCommitment,
    walletCommitments: [
      "0x96d2c84ae5f7ed04d7f28df178376fb772f67d5193522b190f5fc05e7acb2a8c",
      "0x97da2eec9737d08356b6ebc9443ec428d7e3fb0c9d7ec4f468ac64a86e8b2892",
    ],
    claims: {
      asset: "ETH",
      aggregatedExposureTier: "qualified",
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

  return {
    tool: "requestApplicantProof",
    proof,
  };
}

export function verifyApplicantProof({ policyDraft, applicantProof, now = DEFAULT_NOW } = {}) {
  const result = verifyProof(policyDraft, applicantProof, { now });
  validateVerificationResult(result);
  return {
    tool: "verifyProof",
    verifier: "p1-deterministic-verifier",
    result,
  };
}

export async function write0GMemory({
  policyDraft,
  computeReceipt,
  applicantProof,
  publicProofMeta,
  verificationResult,
  executionReceipt,
  mode = "dry-run",
  now = DEFAULT_NOW,
  storageAdapter,
} = {}) {
  validateEligibilityPolicy(policyDraft);
  validateVerificationResult(verificationResult);
  const storagePointer = mode === "0g-compute-live"
    ? "0G://live-workflow/compute-receipt-pending"
    : await readExistingManifestPointer();
  const auditRecord = {
    auditId: `${policyDraft.policyId}-${mode === "0g-compute-live" ? "live" : "dry"}-audit`,
    eventId: policyDraft.policyId,
    policyHash: hashPolicy(policyDraft),
    proofHash: applicantProof.proof.proofHash,
    applicantCommitment: applicantProof.applicantCommitment,
    eventNullifier: applicantProof.antiSybil.eventNullifier,
    verifier: {
      verifierVersion: "p1-deterministic-verifier",
      result: verificationResult.result,
      reasonCode: verificationResult.reasonCode,
    },
    storage: {
      provider: "0G",
      pointer: storagePointer,
    },
    createdAt: now,
  };
  if (publicProofMeta) {
    assertPublicProofSafe(publicProofMeta);
    auditRecord.proofMetadata = {
      provider: "Reclaim",
      proofType: publicProofMeta.proofType,
      proofSha256: publicProofMeta.proofSha256,
      identifier: publicProofMeta.identifier,
      pointer: mode === "0g-compute-live" ? "0G://live-workflow/proof-metadata-pending" : "0G://dry-run/proof-metadata",
    };
  }

  if (mode === "0g-compute-live") {
    return writeLive0GMemory({
      policyDraft,
      computeReceipt,
      auditRecord: validateAuditRecord(auditRecord),
      publicProofMeta,
      executionReceipt,
      storageAdapter,
    });
  }

  return {
    tool: "write0GMemory",
    mode: "dry-run-plan",
    auditRecord: validateAuditRecord(auditRecord),
  };
}

export function executePassIssuance({ policyDraft, verificationResult, mode = "dry-run", now = DEFAULT_NOW } = {}) {
  validateEligibilityPolicy(policyDraft);
  validateVerificationResult(verificationResult);
  const executionReceipt = {
    executor: "KeeperHub",
    action: policyDraft.execution.onPass,
    txHash: verificationResult.approved
      ? (mode === "0g-compute-live" ? "pending:keeperhub-ready-for-mint" : "dry-run:keeperhub-ready-for-mint")
      : (mode === "0g-compute-live" ? "pending:not-executed" : "dry-run:not-executed"),
    status: verificationResult.approved ? "READY_FOR_MINT" : "SKIPPED",
    createdAt: now,
  };

  return {
    tool: "executePassIssuance",
    mode: mode === "0g-compute-live" ? "live-workflow-plan" : "dry-run-plan",
    executionReceipt: validateExecutionReceipt(executionReceipt),
  };
}

export async function runVeriGateWorkflow({
  organizerIntent = DEFAULT_ORGANIZER_INTENT,
  organizerAddress,
  mode = "0g-compute-live",
  now = DEFAULT_NOW,
} = {}) {
  const compute = await createPolicyFromIntent({ organizerIntent, organizerAddress, mode, now });
  const review = validatePolicy(compute.policyDraft);
  const privacyPlan = generatePrivacyPlan(compute.policyDraft);
  const proofRequest = requestApplicantProof({ policyDraft: compute.policyDraft });
  const verification = verifyApplicantProof({
    policyDraft: compute.policyDraft,
    applicantProof: proofRequest.proof,
    now,
  });
  const execution = executePassIssuance({
    policyDraft: compute.policyDraft,
    verificationResult: verification.result,
    mode,
    now,
  });
  const memory = await write0GMemory({
    policyDraft: compute.policyDraft,
    computeReceipt: compute.computeReceipt,
    applicantProof: proofRequest.proof,
    publicProofMeta: proofRequest.publicProofMeta,
    verificationResult: verification.result,
    executionReceipt: execution.executionReceipt,
    mode,
    now,
  });

  return {
    agent: "verigate",
    mode,
    workspace: "/mnt/d/VeriAgent Mesh",
    sequence: [
      "0g_compute_policy_compile",
      "organizer_policy_review",
      "deterministic_verifier",
      "0g_storage_memory",
      "execution",
    ],
    compute,
    review,
    privacyPlan,
    proofRequest,
    verification,
    memory,
    execution,
    sessionLog: [
      { step: "0g_compute_policy_compile", tool: "createPolicyFromIntent" },
      { step: "organizer_policy_review", tool: "validatePolicy" },
      { step: "privacy_plan", tool: "generatePrivacyPlan" },
      { step: "proof_request", tool: "requestApplicantProof" },
      { step: "deterministic_verifier", tool: "verifyProof" },
      { step: "0g_storage_memory", tool: "write0GMemory" },
      { step: "execution", tool: "executePassIssuance" },
    ],
  };
}

export function runVeriGateDryRun(options = {}) {
  return runVeriGateWorkflow({ ...options, mode: "dry-run" });
}

export function runVeriGateLiveWorkflow(options = {}) {
  return runVeriGateWorkflow({ ...options, mode: "0g-compute-live" });
}

async function readExistingManifestPointer() {
  try {
    const payload = JSON.parse(await readFile("deployments/0g-galileo/storage-pointers.json", "utf8"));
    const rootHash = payload?.pointers?.manifest?.rootHash;
    if (typeof rootHash === "string" && rootHash.length > 0) {
      return `0G://${rootHash}`;
    }
  } catch {
    // The agent can still dry-run before live 0G Storage has been refreshed.
  }
  return "0G://dry-run/pending";
}

export function summarizeDryRun(result) {
  return {
    agent: result.agent,
    mode: result.mode,
    workspace: result.workspace,
    sequence: result.sequence,
    approved: result.verification.result.approved,
    reasonCode: result.verification.result.reasonCode,
    policyHash: result.review.policyHash,
    proofHash: result.verification.result.proofHash,
    memoryPointer: result.memory.manifestPointer?.rootHash
      ? `0G://${result.memory.manifestPointer.rootHash}`
      : result.memory.auditRecord.storage.pointer,
    executionStatus: result.execution.executionReceipt.status,
    sessionLogHash: hashSessionLog(result.sessionLog),
  };
}

function hashSessionLog(sessionLog) {
  return `sha256:${Buffer.from(canonicalize(sessionLog)).toString("base64url")}`;
}

async function writeLive0GMemory({
  policyDraft,
  computeReceipt,
  auditRecord,
  publicProofMeta,
  executionReceipt,
  storageAdapter = create0GStorageAdapter(),
}) {
  if (!computeReceipt) {
    throw new Error("computeReceipt is required for live 0G memory");
  }
  if (!executionReceipt) {
    throw new Error("executionReceipt is required for live 0G memory");
  }

  validateExecutionReceipt(executionReceipt);
  const eventId = policyDraft.policyId;
  const namespace = createEventMemoryNamespace(eventId);
  const pointers = {};

  pointers.policy = await storageAdapter.uploadJson({
    eventId,
    namespace,
    kind: "policy",
    object: policyDraft,
  });

  pointers["compute-receipts"] = await storageAdapter.uploadJson({
    eventId,
    namespace,
    kind: "compute-receipts",
    object: computeReceipt,
  });

  if (publicProofMeta) {
    assertPublicProofSafe(publicProofMeta);
    pointers["proof-metadata"] = await storageAdapter.uploadJson({
      eventId,
      namespace,
      kind: "proof-metadata",
      object: publicProofMeta,
    });
  }

  const liveAuditRecord = validateAuditRecord({
    ...auditRecord,
    proofMetadata: publicProofMeta
      ? {
          provider: "Reclaim",
          proofType: publicProofMeta.proofType,
          proofSha256: publicProofMeta.proofSha256,
          identifier: publicProofMeta.identifier,
          pointer: `0G://${pointers["proof-metadata"].rootHash}`,
        }
      : auditRecord.proofMetadata,
    storage: {
      provider: "0G",
      pointer: `0G://${pointers["compute-receipts"].rootHash}`,
    },
  });

  pointers.audit = await storageAdapter.uploadJson({
    eventId,
    namespace,
    kind: "audit",
    object: liveAuditRecord,
  });

  pointers.execution = await storageAdapter.uploadJson({
    eventId,
    namespace,
    kind: "execution",
    object: executionReceipt,
  });

  const manifest = {
    eventId,
    namespace,
    schemaVersion: 1,
    pointers,
  };

  pointers.manifest = await storageAdapter.uploadJson({
    eventId,
    namespace,
    kind: "manifest",
    object: manifest,
  });

  return {
    tool: "write0GMemory",
    mode: "0g-storage-live",
    namespace,
    auditRecord: liveAuditRecord,
    pointers,
    manifestPointer: pointers.manifest,
  };
}
