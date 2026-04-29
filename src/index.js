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

export {
  DEFAULT_AGENT_ENS_NAME,
  DEFAULT_ENS_NETWORK,
  ENS_TEXT_KEYS,
  buildEnsIdentityPayload,
  buildEnsTextRecords,
  buildEventEnsLabel,
  buildEventEnsName,
  createEnsResolverAdapter,
  publishEnsTextRecords,
  validateEnsRecordAlignment
} from "./ensIdentity.js";

export {
  assertPublicProofSafe,
  assertReclaimResourcesReady,
  buildApplicantProofFromReclaim,
  buildPublicReclaimProofMeta,
  buildWalletControlMessage,
  createApplicantCommitment,
  createReclaimClient,
  createReclaimEthBalanceRequest,
  createWalletCommitment,
  extractBalanceHex,
  requestReclaimEthHolderProof,
  verifyWalletControlSignature
} from "./reclaimProof.js";

// I/O adapters such as ogStorage.js intentionally stay out of the pure core
// barrel. Import them directly from their module so verifier consumers do not
// pull network-facing dependencies by default.
