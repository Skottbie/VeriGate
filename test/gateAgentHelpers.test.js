import assert from "node:assert/strict";
import test from "node:test";

import { ethers } from "ethers";

import {
  buildGateAgentIntelligentData,
  buildGateAgentMetadata,
  buildGateAgentTransferProof,
  computeGateAgentDataRoot,
  encryptGateAgentMetadata,
  hashGateAgentTransferReceipt,
} from "../src/gateAgent.js";

const policy = {
  policyId: "AI_AGENT_BUILDER_GATE",
  eventName: "AI Agent Builder Gathering",
  organizer: "0xBC4CaCC01E81C7b9258DF424260342D3De72B3d8",
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
    agentVersion: "p8-keeperhub-recipient-privacy",
    createdAt: "2026-04-29T00:00:00.000Z",
    policyHash: "0x53edcc87b9990e70177a2fe47a432860598d1cdb63d835cde6777246bb377ea9",
  },
};

test("GateAgent metadata binds policy, memory, and executors without raw secrets", () => {
  const metadata = buildGateAgentMetadata({
    policy,
    memory: {
      namespace: "verigate/events/AI_AGENT_BUILDER_GATE",
      manifestPointer: {
        rootHash: "0x7655076669df2af955ab835a481dbdef75a43f0c468b27dfc6767cfefd7f811d",
      },
    },
    authorizedExecutors: ["0x000000000000000000000000000000000000dEaD"],
    now: new Date("2026-04-29T00:00:00.000Z"),
  });

  assert.equal(metadata.event.policyHash, policy.metadata.policyHash);
  assert.equal(metadata.memory.pointer, "0G://0x7655076669df2af955ab835a481dbdef75a43f0c468b27dfc6767cfefd7f811d");
  assert.deepEqual(Object.keys(metadata).filter((key) => /privateKey|secret|rawProof/i.test(key)), []);
});

test("GateAgent encrypted metadata envelope hides plaintext and exposes stable hashes", () => {
  const metadata = buildGateAgentMetadata({
    policy,
    now: new Date("2026-04-29T00:00:00.000Z"),
  });
  const encrypted = encryptGateAgentMetadata(metadata, {
    key: Buffer.alloc(32, 1),
    iv: Buffer.alloc(12, 2),
  });

  assert.equal(encrypted.envelope.algorithm, "AES-256-GCM");
  assert.match(encrypted.envelope.ciphertext, /^0x[0-9a-f]+$/);
  assert.notEqual(encrypted.envelope.ciphertext.includes("AI_AGENT_BUILDER_GATE"), true);
  assert.match(encrypted.envelopeHash, /^0x[0-9a-f]{64}$/);
});

test("GateAgent transfer proof hash is signed by the selected attestor", async () => {
  const wallet = ethers.Wallet.createRandom();
  const data = buildGateAgentIntelligentData({ policy });
  const oldMetadataURI = "0G://0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
  const newMetadataURI = "0G://0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb";
  const oldDataHash = computeGateAgentDataRoot(data, oldMetadataURI);
  const proof = await buildGateAgentTransferProof({
    signer: wallet,
    oldDataHash,
    oldMetadataURI,
    newMetadataURI,
    data,
    from: wallet.address,
    to: "0x000000000000000000000000000000000000dEaD",
    tokenId: 1,
    expiresAt: 1_800_000_000,
    nonce: "0x1111111111111111111111111111111111111111111111111111111111111111",
    attestationURI: "0G://0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
  });

  const recovered = ethers.verifyMessage(
    ethers.getBytes(hashGateAgentTransferReceipt(proof.receipt)),
    proof.receipt.signature,
  );
  assert.equal(recovered, wallet.address);
  assert.equal(proof.accessProof.newDataHash, proof.receipt.newDataHash);
});
