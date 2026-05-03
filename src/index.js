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
  buildFixtureReclaimVerification,
  buildWalletControlMessage,
  createApplicantCommitment,
  createReclaimClient,
  createReclaimEthBalanceRequest,
  createWalletCommitment,
  extractBalanceHex,
  requestReclaimEthHolderProof,
  verifyReclaimProofBinding,
  verifyWalletControlSignature
} from "./reclaimProof.js";

export {
  DEFAULT_KEEPERHUB_API_BASE_URL,
  DEFAULT_KEEPERHUB_DEPLOYMENT_PATH,
  DEFAULT_KEEPERHUB_NETWORK,
  EVENT_PASS_ABI,
  EVENT_PASS_KEEPERHUB_ABI,
  buildReceiptBinding,
  assertKeeperHubNetworkSupportedForDeployment,
  buildPassIssuancePlan,
  buildKeeperHubContractCallBody,
  createKeeperHubClient,
  deriveChainEventId,
  executePassIssuanceOnchain,
  normalizeAbiForKeeperHub,
  resolveKeeperHubExecutionTarget
} from "./keeperHub.js";

export {
  GATE_AGENT_DATA_DESCRIPTIONS,
  GATE_AGENT_INFT_ABI,
  GATE_AGENT_VERIFIER_ABI,
  GATE_AGENT_VERSION,
  buildGateAgentIntelligentData,
  buildGateAgentMetadata,
  buildGateAgentTransferProof,
  computeGateAgentDataRoot,
  encryptGateAgentMetadata,
  hashGateAgentTransferReceipt,
  rootFromPointer
} from "./gateAgent.js";

// I/O adapters such as ogStorage.js intentionally stay out of the pure core
// barrel. Import them directly from their module so verifier consumers do not
// pull network-facing dependencies by default.
