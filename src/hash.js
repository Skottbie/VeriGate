import { createHash } from "node:crypto";
import { canonicalize } from "./canonical.js";

export function sha256Hex(value) {
  return `0x${createHash("sha256").update(value).digest("hex")}`;
}

export function hashPolicy(policy) {
  const normalized = structuredClone(policy);
  if (normalized.metadata) {
    delete normalized.metadata.policyHash;
  }
  return sha256Hex(`verigate:policy:v1:${canonicalize(normalized)}`);
}

export function hashProof(proof) {
  const normalized = structuredClone(proof);
  if (normalized.proof) {
    delete normalized.proof.proofHash;
  }
  return sha256Hex(`verigate:proof:v1:${canonicalize(normalized)}`);
}

export function hashComputeReceipt(receipt) {
  const normalized = structuredClone(receipt);
  delete normalized.receiptHash;
  return sha256Hex(`verigate:compute-receipt:v1:${canonicalize(normalized)}`);
}

export function generateEventNullifier(eventId, applicantCommitment) {
  assertNonEmptyString(eventId, "eventId");
  assertNonEmptyString(applicantCommitment, "applicantCommitment");
  return sha256Hex(`verigate:nullifier:v1:${eventId}:${applicantCommitment}`);
}

function assertNonEmptyString(value, field) {
  if (typeof value !== "string" || value.length === 0) {
    throw new TypeError(`${field} must be a non-empty string`);
  }
}
