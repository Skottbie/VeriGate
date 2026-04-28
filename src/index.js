export {
  canonicalize
} from "./canonical.js";

export {
  generateEventNullifier,
  hashComputeReceipt,
  hashPolicy,
  hashProof,
  sha256Hex
} from "./hash.js";

export {
  validateApplicantProof,
  validateAuditRecord,
  validateComputeReceipt,
  validateEligibilityPolicy,
  validateExecutionReceipt,
  validateVerificationResult
} from "./schemas.js";

export {
  verifyProof
} from "./verifier.js";

// I/O adapters such as ogStorage.js intentionally stay out of the pure core
// barrel. Import them directly from their module so verifier consumers do not
// pull network-facing dependencies by default.
