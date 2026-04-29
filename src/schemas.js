const CLAIMS = new Set([
  "ETH_HOLDER",
  "HOLD_DURATION_30D_PLUS",
  "MULTI_WALLET_AGGREGATION",
  "X_ACCOUNT_BOUND",
  "OKX_WALLET_ACTIVE"
]);

const DISCLOSURE_MODES = new Set(["eligible_only", "tier_only", "range_only"]);
const NULLIFIER_SCOPES = new Set(["event", "organizer", "global"]);
const ON_PASS_ACTIONS = new Set(["mint_rsvp_pass", "update_allowlist", "issue_badge"]);
const PROOF_TYPES = new Set(["zkTLS", "zk", "attestation"]);
const EXPOSURE_TIERS = new Set(["qualified", "not_qualified"]);
const VERIFIER_RESULTS = new Set(["approved", "rejected"]);
const REASON_CODES = new Set([
  "POLICY_SATISFIED",
  "INSUFFICIENT_PROOF",
  "DUPLICATE_NULLIFIER",
  "EXPIRED_PROOF",
  "WRONG_POLICY_HASH",
  "UNSUPPORTED_CLAIM",
  "INVALID_PROOF_HASH"
]);

const VERIFIER_SUPPORTED_CLAIMS = new Set([
  "ETH_HOLDER",
  "MULTI_WALLET_AGGREGATION"
]);
const ETH_ADDRESS = /^0x[0-9a-fA-F]{40}$/;

export function validateEligibilityPolicy(policy) {
  object(policy, "policy");
  requiredString(policy.policyId, "policy.policyId");
  requiredString(policy.eventName, "policy.eventName");
  requiredAddress(policy.organizer, "policy.organizer");
  enumArray(policy.requiredClaims, CLAIMS, "policy.requiredClaims");

  object(policy.privacy, "policy.privacy");
  boolean(policy.privacy.revealWalletAddress, "policy.privacy.revealWalletAddress");
  boolean(policy.privacy.revealExactBalance, "policy.privacy.revealExactBalance");
  boolean(policy.privacy.revealWalletBreakdown, "policy.privacy.revealWalletBreakdown");
  enumValue(policy.privacy.disclosureMode, DISCLOSURE_MODES, "policy.privacy.disclosureMode");

  object(policy.antiSybil, "policy.antiSybil");
  boolean(policy.antiSybil.enabled, "policy.antiSybil.enabled");
  enumValue(policy.antiSybil.nullifierScope, NULLIFIER_SCOPES, "policy.antiSybil.nullifierScope");

  object(policy.execution, "policy.execution");
  enumValue(policy.execution.onPass, ON_PASS_ACTIONS, "policy.execution.onPass");
  if (policy.execution.executor !== "keeperhub") {
    throw new TypeError("policy.execution.executor must be keeperhub");
  }

  object(policy.metadata, "policy.metadata");
  optionalString(policy.metadata.policyHash, "policy.metadata.policyHash");
  requiredString(policy.metadata.verifierVersion, "policy.metadata.verifierVersion");
  requiredString(policy.metadata.agentVersion, "policy.metadata.agentVersion");
  requiredString(policy.metadata.createdAt, "policy.metadata.createdAt");

  return policy;
}

export function validateApplicantProof(proof) {
  object(proof, "proof");
  requiredString(proof.eventId, "proof.eventId");
  requiredString(proof.policyHash, "proof.policyHash");
  requiredString(proof.applicantCommitment, "proof.applicantCommitment");
  arrayOfStrings(proof.walletCommitments, "proof.walletCommitments");

  object(proof.claims, "proof.claims");
  if (proof.claims.asset !== "ETH") {
    throw new TypeError("proof.claims.asset must be ETH");
  }
  enumValue(proof.claims.aggregatedExposureTier, EXPOSURE_TIERS, "proof.claims.aggregatedExposureTier");
  optionalString(proof.claims.holdingDurationTier, "proof.claims.holdingDurationTier");

  object(proof.privacy, "proof.privacy");
  literalTrue(proof.privacy.walletAddressesHidden, "proof.privacy.walletAddressesHidden");
  literalTrue(proof.privacy.exactBalancesHidden, "proof.privacy.exactBalancesHidden");
  literalTrue(proof.privacy.walletBreakdownHidden, "proof.privacy.walletBreakdownHidden");

  object(proof.antiSybil, "proof.antiSybil");
  requiredString(proof.antiSybil.eventNullifier, "proof.antiSybil.eventNullifier");

  object(proof.proof, "proof.proof");
  requiredString(proof.proof.proofHash, "proof.proof.proofHash");
  enumValue(proof.proof.proofType, PROOF_TYPES, "proof.proof.proofType");
  optionalString(proof.proof.expiresAt, "proof.proof.expiresAt");

  return proof;
}

export function validateComputeReceipt(receipt) {
  object(receipt, "receipt");
  optionalString(receipt.receiptHash, "receipt.receiptHash");
  requiredString(receipt.promptHash, "receipt.promptHash");
  requiredString(receipt.outputHash, "receipt.outputHash");
  requiredString(receipt.policyDraftHash, "receipt.policyDraftHash");
  requiredString(receipt.provider, "receipt.provider");
  requiredString(receipt.model, "receipt.model");
  optionalString(receipt.signature, "receipt.signature");
  optionalString(receipt.proof, "receipt.proof");
  requiredString(receipt.createdAt, "receipt.createdAt");
  optionalString(receipt.storagePointer, "receipt.storagePointer");
  return receipt;
}

export function validateAuditRecord(record) {
  object(record, "record");
  requiredString(record.auditId, "record.auditId");
  requiredString(record.eventId, "record.eventId");
  requiredString(record.policyHash, "record.policyHash");
  requiredString(record.proofHash, "record.proofHash");
  requiredString(record.applicantCommitment, "record.applicantCommitment");
  requiredString(record.eventNullifier, "record.eventNullifier");

  object(record.verifier, "record.verifier");
  requiredString(record.verifier.verifierVersion, "record.verifier.verifierVersion");
  enumValue(record.verifier.result, VERIFIER_RESULTS, "record.verifier.result");
  enumValue(record.verifier.reasonCode, REASON_CODES, "record.verifier.reasonCode");

  object(record.storage, "record.storage");
  if (record.storage.provider !== "0G") {
    throw new TypeError("record.storage.provider must be 0G");
  }
  requiredString(record.storage.pointer, "record.storage.pointer");
  requiredString(record.createdAt, "record.createdAt");
  return record;
}

export function validateExecutionReceipt(receipt) {
  object(receipt, "receipt");
  if (receipt.executor !== "KeeperHub") {
    throw new TypeError("receipt.executor must be KeeperHub");
  }
  requiredString(receipt.action, "receipt.action");
  requiredString(receipt.txHash, "receipt.txHash");
  requiredString(receipt.status, "receipt.status");
  requiredString(receipt.createdAt, "receipt.createdAt");
  return receipt;
}

export function validateVerificationResult(result) {
  object(result, "result");
  boolean(result.approved, "result.approved");
  enumValue(result.result, VERIFIER_RESULTS, "result.result");
  enumValue(result.reasonCode, REASON_CODES, "result.reasonCode");
  requiredString(result.policyHash, "result.policyHash");
  optionalString(result.proofHash, "result.proofHash");
  optionalString(result.eventNullifier, "result.eventNullifier");
  return result;
}

export function isSupportedClaim(claim) {
  return VERIFIER_SUPPORTED_CLAIMS.has(claim);
}

function object(value, field) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError(`${field} must be an object`);
  }
}

function requiredString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}

function requiredAddress(value, field) {
  requiredString(value, field);
  if (!ETH_ADDRESS.test(value)) {
    throw new TypeError(`${field} must be a 0x-prefixed 20-byte address`);
  }
}

function optionalString(value, field) {
  if (value !== undefined && typeof value !== "string") {
    throw new TypeError(`${field} must be a string when present`);
  }
}

function boolean(value, field) {
  if (typeof value !== "boolean") {
    throw new TypeError(`${field} must be a boolean`);
  }
}

function literalTrue(value, field) {
  if (value !== true) {
    throw new TypeError(`${field} must be true`);
  }
}

function enumValue(value, choices, field) {
  if (!choices.has(value)) {
    throw new TypeError(`${field} has unsupported value`);
  }
}

function enumArray(value, choices, field) {
  if (!Array.isArray(value) || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty array`);
  }
  for (const item of value) {
    enumValue(item, choices, field);
  }
}

function arrayOfStrings(value, field) {
  if (!Array.isArray(value)) {
    throw new TypeError(`${field} must be an array`);
  }
  for (const item of value) {
    requiredString(item, field);
  }
}
