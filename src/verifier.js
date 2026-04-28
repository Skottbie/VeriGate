import { hashPolicy, hashProof } from "./hash.js";
import {
  isSupportedClaim,
  validateApplicantProof,
  validateEligibilityPolicy,
  validateVerificationResult
} from "./schemas.js";

export function verifyProof(policy, proof, options = {}) {
  validateEligibilityPolicy(policy);
  validateApplicantProof(proof);

  const policyHash = hashPolicy(policy);
  const proofHash = hashProof(proof);
  const eventNullifier = proof.antiSybil.eventNullifier;

  const base = {
    policyHash,
    proofHash,
    eventNullifier
  };

  if (proof.policyHash !== policyHash || policy.metadata.policyHash && policy.metadata.policyHash !== policyHash) {
    return result(false, "WRONG_POLICY_HASH", base);
  }

  if (proof.proof.proofHash !== proofHash) {
    return result(false, "INVALID_PROOF_HASH", base);
  }

  for (const claim of policy.requiredClaims) {
    if (!isSupportedClaim(claim)) {
      return result(false, "UNSUPPORTED_CLAIM", base);
    }
  }

  if (proof.proof.expiresAt && new Date(proof.proof.expiresAt).getTime() <= getNow(options).getTime()) {
    return result(false, "EXPIRED_PROOF", base);
  }

  if (isNullifierUsed(eventNullifier, options.usedNullifiers)) {
    return result(false, "DUPLICATE_NULLIFIER", base);
  }

  if (!satisfiesRequiredClaims(policy, proof)) {
    return result(false, "INSUFFICIENT_PROOF", base);
  }

  return result(true, "POLICY_SATISFIED", base);
}

function satisfiesRequiredClaims(policy, proof) {
  for (const claim of policy.requiredClaims) {
    if (claim === "ETH_HOLDER" && !isQualifiedEthHolder(proof)) {
      return false;
    }
    if (claim === "MULTI_WALLET_AGGREGATION" && proof.walletCommitments.length === 0) {
      return false;
    }
  }

  if (policy.privacy.revealWalletAddress === false && proof.privacy.walletAddressesHidden !== true) {
    return false;
  }
  if (policy.privacy.revealExactBalance === false && proof.privacy.exactBalancesHidden !== true) {
    return false;
  }
  if (policy.privacy.revealWalletBreakdown === false && proof.privacy.walletBreakdownHidden !== true) {
    return false;
  }

  return true;
}

function isQualifiedEthHolder(proof) {
  return proof.claims.asset === "ETH" && proof.claims.aggregatedExposureTier === "qualified";
}

function isNullifierUsed(eventNullifier, usedNullifiers) {
  if (!usedNullifiers) {
    return false;
  }
  if (typeof usedNullifiers.has === "function") {
    return usedNullifiers.has(eventNullifier);
  }
  return Array.from(usedNullifiers).includes(eventNullifier);
}

function getNow(options) {
  return options.now ? new Date(options.now) : new Date();
}

function result(approved, reasonCode, details) {
  return validateVerificationResult({
    approved,
    result: approved ? "approved" : "rejected",
    reasonCode,
    ...details
  });
}
