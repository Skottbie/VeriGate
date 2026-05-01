import { readFile } from "node:fs/promises";

import dotenv from "dotenv";
import { ethers } from "ethers";

import {
  GATE_AGENT_INFT_ABI,
  GATE_AGENT_VERSION,
  buildGateAgentIntelligentData,
  buildGateAgentMetadata,
  buildGateAgentTransferProof,
  encryptGateAgentMetadata,
  hashPolicy,
  rootFromPointer,
} from "../src/index.js";
import { create0GStorageAdapter, createEventMemoryNamespace } from "../src/ogStorage.js";

dotenv.config({ quiet: true });

if (!process.env.OG_RPC_URL || !process.env.OG_PRIVATE_KEY) {
  throw new Error("OG_RPC_URL and OG_PRIVATE_KEY are required for live GateAgent test");
}

const deployment = JSON.parse(await readFile("deployments/0g-galileo/addresses.json", "utf8"));
if (!deployment.contracts?.GateAgentINFT || !deployment.contracts?.GateAgentDataVerifier) {
  throw new Error("GateAgent contracts are not deployed; run npm run deploy:gate-agent first");
}

const provider = new ethers.JsonRpcProvider(process.env.OG_RPC_URL);
const wallet = new ethers.Wallet(process.env.OG_PRIVATE_KEY, provider);
const gateAgent = new ethers.Contract(deployment.contracts.GateAgentINFT, GATE_AGENT_INFT_ABI, wallet);
const storage = create0GStorageAdapter();
const now = new Date();
const runId = now.toISOString().replace(/[:.]/g, "-");
const eventId = `gate-agent-p9-live-${runId}`;
const storagePointers = await readStoragePointers();
const memoryPointer = storagePointers?.pointers?.manifest?.rootHash
  ? `0G://${storagePointers.pointers.manifest.rootHash}`
  : "0G://0xa17c32d28dc574c41a8c6f68a1179c9769d56af299c9945f09b5f695dda657c4";

const policy = {
  policyId: eventId,
  eventName: "P9 GateAgent iNFT Live Test",
  organizer: wallet.address,
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
    agentVersion: GATE_AGENT_VERSION,
    createdAt: now.toISOString(),
  },
};
policy.metadata.policyHash = hashPolicy(policy);

const memory = {
  namespace: createEventMemoryNamespace(policy.policyId),
  manifestPointer: {
    rootHash: rootFromPointer(memoryPointer),
  },
};

const minted = await mintGateAgent({ policy, memory });
const cloned = await mutateGateAgent({ policy, memory, source: minted, operation: "clone" });
const transferred = await mutateGateAgent({ policy, memory, source: minted, operation: "transfer" });

console.log(JSON.stringify({
  ok: true,
  network: deployment.network,
  chainId: deployment.chainId,
  contracts: {
    GateAgentINFT: deployment.contracts.GateAgentINFT,
    GateAgentDataVerifier: deployment.contracts.GateAgentDataVerifier,
  },
  minted,
  cloned,
  transferred,
}, null, 2));

async function mintGateAgent({ policy, memory }) {
  const { metadataPointer, encryptedMetadataURI, intelligentData, memoryRoot } = await uploadMetadata({
    policy,
    memory,
    lifecycle: "mint",
  });
  const chainEventId = ethers.keccak256(ethers.toUtf8Bytes(
    `verigate:gate-agent:event:v1:${policy.policyId}:${policy.metadata.policyHash}`,
  ));
  const tx = await gateAgent.mintGateAgent(
    wallet.address,
    chainEventId,
    policy.metadata.policyHash,
    memoryRoot,
    encryptedMetadataURI,
    intelligentData,
    [wallet.address],
  );
  const receipt = await tx.wait();
  const tokenId = findEvent(receipt, "GateAgentMinted")?.args?.tokenId?.toString();
  const record = await gateAgent.gateAgentRecord(tokenId);
  return {
    tokenId,
    owner: await gateAgent.ownerOf(tokenId),
    txHash: tx.hash,
    explorerUrl: explorer(tx.hash),
    encryptedMetadataURI,
    metadataPointer,
    dataRoot: record.dataRoot,
    authorizedExecutors: await gateAgent.authorizedUsersOf(tokenId),
  };
}

async function mutateGateAgent({ policy, memory, source, operation }) {
  const recipient = ethers.Wallet.createRandom().address;
  const record = await gateAgent.gateAgentRecord(source.tokenId);
  const { metadataPointer, encryptedMetadataURI, intelligentData } = await uploadMetadata({
    policy,
    memory,
    lifecycle: operation,
    sourceTokenId: source.tokenId,
  });
  const proof = await buildGateAgentTransferProof({
    signer: wallet,
    oldDataHash: record.dataRoot,
    oldMetadataURI: source.encryptedMetadataURI,
    newMetadataURI: encryptedMetadataURI,
    data: intelligentData,
    from: wallet.address,
    to: recipient,
    tokenId: source.tokenId,
    expiresAt: Math.floor(Date.now() / 1000) + 3600,
    nonce: ethers.keccak256(ethers.toUtf8Bytes(`${operation}:${source.tokenId}:${encryptedMetadataURI}`)),
    attestationURI: `0G://${metadataPointer.rootHash}`,
  });
  const solidityProof = {
    accessProof: proof.accessProof,
    ownershipProof: proof.ownershipProof,
  };
  const tx = operation === "clone"
    ? await gateAgent.iClone(recipient, source.tokenId, [solidityProof])
    : await gateAgent.iTransfer(recipient, source.tokenId, [solidityProof]);
  const receipt = await tx.wait();
  const parsed = findEvent(receipt, operation === "clone" ? "Cloned" : "Transferred");
  return {
    operation,
    tokenId: source.tokenId,
    newTokenId: parsed?.args?.newTokenId?.toString?.(),
    recipient,
    txHash: tx.hash,
    explorerUrl: explorer(tx.hash),
    oldDataHash: record.dataRoot,
    newDataHash: proof.receipt.newDataHash,
    encryptedMetadataURI,
    metadataPointer,
  };
}

async function uploadMetadata({ policy, memory, lifecycle, sourceTokenId }) {
  const metadata = {
    ...buildGateAgentMetadata({
      policy,
      memory,
      authorizedExecutors: [wallet.address],
      agentVersion: GATE_AGENT_VERSION,
      now,
    }),
    lifecycle: {
      operation: lifecycle,
      sourceTokenId,
    },
  };
  const encrypted = encryptGateAgentMetadata(metadata);
  const pointer = await storage.uploadJson({
    eventId: policy.policyId,
    namespace: createEventMemoryNamespace(policy.policyId),
    kind: `gate-agent-${lifecycle}-metadata`,
    object: encrypted.envelope,
  });
  return {
    metadataPointer: pointer,
    encryptedMetadataURI: `0G://${pointer.rootHash}`,
    intelligentData: buildGateAgentIntelligentData({ policy, memory }),
    memoryRoot: rootFromPointer(memoryPointer) ?? encrypted.envelopeHash,
  };
}

function findEvent(receipt, name) {
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = gateAgent.interface.parseLog(log);
      if (parsed?.name === name) {
        return parsed;
      }
    } catch {
      // Ignore logs from other contracts.
    }
  }
  return null;
}

async function readStoragePointers() {
  try {
    return JSON.parse(await readFile("deployments/0g-galileo/storage-pointers.json", "utf8"));
  } catch {
    return null;
  }
}

function explorer(txHash) {
  return `https://chainscan-galileo.0g.ai/tx/${txHash}`;
}
