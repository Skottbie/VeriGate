import { createCipheriv, randomBytes } from "node:crypto";

import { ethers } from "ethers";

import { canonicalize } from "./canonical.js";
import { hashPolicy, sha256Hex } from "./hash.js";

export const GATE_AGENT_VERSION = "p9-real-erc7857-gate-agent";
export const GATE_AGENT_DATA_DESCRIPTIONS = [
  "gate.policy",
  "gate.memory",
  "gate.executionPolicy",
  "gate.agentProfile",
];

const TRANSFER_RECEIPT_TYPEHASH = ethers.keccak256(ethers.toUtf8Bytes(
  "GateAgentTransferReceipt(bytes32 oldDataHash,bytes32 newDataHash,string oldMetadataURI,string newMetadataURI,address from,address to,uint256 tokenId,uint256 expiresAt,bytes32 nonce,string attestationURI)",
));
const RECEIPT_TUPLE = "tuple(bytes32 oldDataHash,bytes32 newDataHash,string oldMetadataURI,string newMetadataURI,string[] dataDescriptions,bytes32[] dataHashes,address from,address to,uint256 tokenId,uint256 expiresAt,bytes32 nonce,string attestationURI,bytes signature)";
const coder = ethers.AbiCoder.defaultAbiCoder();

export const GATE_AGENT_VERIFIER_ABI = [
  "function dataRoot(string[] descriptions,bytes32[] dataHashes,string metadataURI) pure returns (bytes32)",
  "function hashReceipt((bytes32 oldDataHash,bytes32 newDataHash,string oldMetadataURI,string newMetadataURI,string[] dataDescriptions,bytes32[] dataHashes,address from,address to,uint256 tokenId,uint256 expiresAt,bytes32 nonce,string attestationURI,bytes signature) receipt) pure returns (bytes32)",
];

export const GATE_AGENT_INFT_ABI = [
  "function mintGateAgent(address to,bytes32 eventId,bytes32 policyHash,bytes32 memoryRoot,string encryptedMetadataURI,(string dataDescription,bytes32 dataHash)[] data,address[] initialExecutors) returns (uint256 tokenId)",
  "function authorizeUsage(uint256 tokenId,address user)",
  "function revokeAuthorization(uint256 tokenId,address user)",
  "function assertAuthorizedUsage(uint256 tokenId,address executor) view returns (bool)",
  "function intelligentDataOf(uint256 tokenId) view returns ((string dataDescription,bytes32 dataHash)[])",
  "function gateAgentRecord(uint256 tokenId) view returns (tuple(uint256 tokenId,bytes32 eventId,bytes32 policyHash,bytes32 memoryRoot,bytes32 dataRoot,string encryptedMetadataURI,uint64 createdAt))",
  "function encryptedMetadataURIOf(uint256 tokenId) view returns (string)",
  "function authorizedUsersOf(uint256 tokenId) view returns (address[])",
  "function ownerOf(uint256 tokenId) view returns (address)",
  "function iTransfer(address to,uint256 tokenId,((bytes32 oldDataHash,bytes32 newDataHash,bytes nonce,bytes encryptedPubKey,bytes proof) accessProof,(uint8 oracleType,bytes32 oldDataHash,bytes32 newDataHash,bytes sealedKey,bytes encryptedPubKey,bytes nonce,bytes proof) ownershipProof)[] proofs)",
  "function iClone(address to,uint256 tokenId,((bytes32 oldDataHash,bytes32 newDataHash,bytes nonce,bytes encryptedPubKey,bytes proof) accessProof,(uint8 oracleType,bytes32 oldDataHash,bytes32 newDataHash,bytes sealedKey,bytes encryptedPubKey,bytes nonce,bytes proof) ownershipProof)[] proofs) returns (uint256 newTokenId)",
  "event GateAgentMinted(uint256 indexed tokenId,address indexed owner,bytes32 indexed eventId,bytes32 policyHash,bytes32 memoryRoot,bytes32 dataRoot,string encryptedMetadataURI)",
  "event Transferred(uint256 tokenId,address indexed from,address indexed to)",
  "event Cloned(uint256 indexed tokenId,uint256 indexed newTokenId,address from,address to)",
];

export function buildGateAgentMetadata({
  policy,
  memory,
  passExecution,
  ens,
  authorizedExecutors = [],
  agentVersion = GATE_AGENT_VERSION,
  now = new Date(),
} = {}) {
  if (!policy) {
    throw new TypeError("policy is required");
  }
  const policyHash = policy.metadata?.policyHash ?? hashPolicy(policy);
  const memoryPointer = memory?.manifestPointer?.rootHash
    ? `0G://${memory.manifestPointer.rootHash}`
    : memory?.auditRecord?.storage?.pointer;
  const memoryRoot = rootFromPointer(memoryPointer) ?? sha256Hex(canonicalize(memory ?? {}));
  return {
    schema: "verigate.gate-agent.metadata.v1",
    agentVersion,
    event: {
      policyId: policy.policyId,
      eventName: policy.eventName,
      organizer: policy.organizer,
      policyHash,
    },
    intelligence: {
      policyTemplate: {
        requiredClaims: policy.requiredClaims,
        privacy: policy.privacy,
        antiSybil: policy.antiSybil,
      },
      verifierVersion: policy.metadata?.verifierVersion,
      executionPolicy: policy.execution,
    },
    memory: {
      namespace: memory?.namespace,
      pointer: memoryPointer,
      rootHash: memoryRoot,
    },
    execution: {
      authorizedExecutors,
      keeperHub: passExecution?.keeperHub
        ? {
            network: passExecution.keeperHub.network,
            executionId: passExecution.keeperHub.executionId,
            transactionHash: passExecution.keeperHub.transactionHash,
          }
        : null,
    },
    discovery: {
      ensName: ens?.payload?.eventName,
      appUrl: ens?.payload?.textRecords?.["event.appUrl"],
    },
    createdAt: now.toISOString(),
  };
}

export function encryptGateAgentMetadata(metadata, { key = randomBytes(32), iv = randomBytes(12) } = {}) {
  const plaintext = Buffer.from(canonicalize(metadata));
  const cipher = createCipheriv("aes-256-gcm", Buffer.from(key), Buffer.from(iv));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  const envelope = {
    schema: "verigate.encrypted-gate-agent.v1",
    algorithm: "AES-256-GCM",
    ciphertext: `0x${ciphertext.toString("hex")}`,
    iv: `0x${Buffer.from(iv).toString("hex")}`,
    tag: `0x${tag.toString("hex")}`,
    plaintextHash: sha256Hex(plaintext),
    createdAt: metadata.createdAt,
  };
  return {
    envelope,
    key: `0x${Buffer.from(key).toString("hex")}`,
    envelopeHash: sha256Hex(canonicalize(envelope)),
  };
}

export function buildGateAgentIntelligentData({ policy, memory, executionPolicy, agentProfile } = {}) {
  if (!policy) {
    throw new TypeError("policy is required");
  }
  const policyObject = {
    policyId: policy.policyId,
    policyHash: policy.metadata?.policyHash ?? hashPolicy(policy),
    requiredClaims: policy.requiredClaims,
    privacy: policy.privacy,
    antiSybil: policy.antiSybil,
  };
  const memoryObject = {
    namespace: memory?.namespace,
    manifestPointer: memory?.manifestPointer,
    auditPointer: memory?.auditRecord?.storage?.pointer,
  };
  const executionObject = executionPolicy ?? policy.execution;
  const profileObject = agentProfile ?? {
    name: "VeriGate Agent",
    version: GATE_AGENT_VERSION,
    role: "privacy-preserving ETH holder gate verifier",
  };
  return [
    { dataDescription: "gate.policy", dataHash: sha256Hex(canonicalize(policyObject)) },
    { dataDescription: "gate.memory", dataHash: sha256Hex(canonicalize(memoryObject)) },
    { dataDescription: "gate.executionPolicy", dataHash: sha256Hex(canonicalize(executionObject)) },
    { dataDescription: "gate.agentProfile", dataHash: sha256Hex(canonicalize(profileObject)) },
  ];
}

export function computeGateAgentDataRoot(data, metadataURI) {
  const itemHashes = data.map((item) => ethers.keccak256(coder.encode(
    ["bytes32", "bytes32"],
    [ethers.keccak256(ethers.toUtf8Bytes(item.dataDescription)), item.dataHash],
  )));
  return ethers.keccak256(coder.encode(
    ["bytes32", "bytes32[]"],
    [ethers.keccak256(ethers.toUtf8Bytes(metadataURI)), itemHashes],
  ));
}

export function hashGateAgentTransferReceipt(receipt) {
  return ethers.keccak256(coder.encode(
    [
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "address",
      "address",
      "uint256",
      "uint256",
      "bytes32",
      "bytes32",
    ],
    [
      TRANSFER_RECEIPT_TYPEHASH,
      receipt.oldDataHash,
      receipt.newDataHash,
      ethers.keccak256(ethers.toUtf8Bytes(receipt.oldMetadataURI)),
      ethers.keccak256(ethers.toUtf8Bytes(receipt.newMetadataURI)),
      receipt.from,
      receipt.to,
      receipt.tokenId,
      receipt.expiresAt,
      receipt.nonce,
      ethers.keccak256(ethers.toUtf8Bytes(receipt.attestationURI)),
    ],
  ));
}

export async function buildGateAgentTransferProof({
  signer,
  oldDataHash,
  oldMetadataURI,
  newMetadataURI,
  data,
  from,
  to,
  tokenId,
  expiresAt,
  nonce = ethers.hexlify(randomBytes(32)),
  attestationURI,
} = {}) {
  const dataDescriptions = data.map((item) => item.dataDescription);
  const dataHashes = data.map((item) => item.dataHash);
  const newDataHash = computeGateAgentDataRoot(data, newMetadataURI);
  const unsignedReceipt = {
    oldDataHash,
    newDataHash,
    oldMetadataURI,
    newMetadataURI,
    dataDescriptions,
    dataHashes,
    from: ethers.getAddress(from),
    to: ethers.getAddress(to),
    tokenId,
    expiresAt,
    nonce,
    attestationURI,
    signature: "0x",
  };
  const signature = await signer.signMessage(ethers.getBytes(hashGateAgentTransferReceipt(unsignedReceipt)));
  const receipt = { ...unsignedReceipt, signature };
  const encodedReceipt = coder.encode([RECEIPT_TUPLE], [receipt]);
  return {
    accessProof: {
      oldDataHash,
      newDataHash,
      nonce: ethers.hexlify(randomBytes(32)),
      encryptedPubKey: "0x",
      proof: "0x",
    },
    ownershipProof: {
      oracleType: 0,
      oldDataHash,
      newDataHash,
      sealedKey: "0x",
      encryptedPubKey: "0x",
      nonce: ethers.hexlify(randomBytes(32)),
      proof: encodedReceipt,
    },
    receipt,
  };
}

export function rootFromPointer(pointer) {
  if (typeof pointer !== "string") {
    return null;
  }
  const match = pointer.match(/^0G:\/\/(0x[0-9a-fA-F]{64})$/);
  return match?.[1] ?? null;
}
