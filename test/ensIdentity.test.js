import assert from "node:assert/strict";
import test from "node:test";

import {
  buildEnsIdentityPayload,
  buildEnsTextRecords,
  buildEventEnsLabel,
  buildEventEnsName,
  validateEnsRecordAlignment,
} from "../src/ensIdentity.js";

test("event ENS label is deterministic and DNS-safe", () => {
  assert.equal(buildEventEnsLabel(makePolicy()), "ai-agent-builder-gate");
  assert.equal(buildEventEnsLabel({ policyId: "ETH Holder Night #1" }), "eth-holder-night-1");
});

test("event ENS name is derived from the agent parent name", () => {
  assert.equal(
    buildEventEnsName({ policy: makePolicy(), agentName: "verigate-agent.eth" }),
    "ai-agent-builder-gate.verigate-agent.eth",
  );
});

test("ENS identity payload carries event policy and audit discovery records", () => {
  const payload = buildEnsIdentityPayload({
    policy: makePolicy(),
    verificationResult: {
      proofHash: "0xproof",
      eventNullifier: "0xnullifier",
    },
    auditPointer: "0G://0xaudit",
    appUrl: "http://localhost:4173",
    passContract: "0x1111111111111111111111111111111111111111",
  });

  assert.equal(payload.network, "sepolia");
  assert.equal(payload.agentName, "verigate-agent.eth");
  assert.equal(payload.eventName, "ai-agent-builder-gate.verigate-agent.eth");
  assert.match(payload.node, /^0x[0-9a-f]{64}$/);
  assert.equal(payload.textRecords["event.policyHash"], makePolicy().metadata.policyHash);
  assert.equal(payload.textRecords["event.auditPointer"], "0G://0xaudit");
  assert.equal(payload.textRecords["event.proofHash"], "0xproof");
});

test("ENS text records can be checked against resolved records", () => {
  const policy = makePolicy();
  const payload = buildEnsIdentityPayload({
    policy,
    auditPointer: "0G://0xaudit",
    appUrl: "http://localhost:4173",
  });
  const checks = validateEnsRecordAlignment({
    payload,
    resolvedTextRecords: {
      "event.policyHash": policy.metadata.policyHash,
      "event.auditPointer": "0G://0xaudit",
      "event.verifier": policy.organizer,
      "event.appUrl": "http://localhost:4173",
    },
  });

  assert.equal(checks.every((check) => check.matches), true);
});

test("ENS text records include only public discovery metadata", () => {
  const records = buildEnsTextRecords({
    policy: makePolicy(),
    auditPointer: "0G://0xaudit",
  });

  assert.deepEqual(Object.keys(records).filter((key) => /wallet|balance|secret/i.test(key)), []);
});

function makePolicy() {
  return {
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
      agentVersion: "p7-ens-identity",
      createdAt: "2026-04-29T00:00:00.000Z",
      policyHash: "0x53edcc87b9990e70177a2fe47a432860598d1cdb63d835cde6777246bb377ea9",
    },
  };
}
