import test from "node:test";
import assert from "node:assert/strict";
import {
  canonicalize,
  generateEventNullifier,
  hashComputeReceipt,
  hashPolicy,
  hashProof,
  verifyProof
} from "../src/index.js";

const NOW = new Date("2026-04-28T08:30:00.000Z");

test("canonicalize returns stable sorted JSON", () => {
  assert.equal(
    canonicalize({ b: 2, a: { d: 4, c: 3 } }),
    '{"a":{"c":3,"d":4},"b":2}'
  );
});

test("hash functions are deterministic", () => {
  const policy = makePolicy();
  const proof = makeProof(policy);
  const receipt = makeComputeReceipt(policy);

  assert.equal(hashPolicy(policy), hashPolicy(structuredClone(policy)));
  assert.equal(hashProof(proof), hashProof(structuredClone(proof)));
  assert.equal(hashComputeReceipt(receipt), hashComputeReceipt(structuredClone(receipt)));
});

test("policy hash ignores metadata.policyHash to avoid circular hashing", () => {
  const policy = makePolicy();
  const hash = hashPolicy(policy);
  const withMetadataHash = structuredClone(policy);
  withMetadataHash.metadata.policyHash = hash;

  assert.equal(hashPolicy(withMetadataHash), hash);
});

test("approved proof satisfies the ETH holder policy", () => {
  const policy = makePolicy();
  const proof = makeProof(policy);

  const result = verifyProof(policy, proof, { now: NOW });

  assert.equal(result.approved, true);
  assert.equal(result.result, "approved");
  assert.equal(result.reasonCode, "POLICY_SATISFIED");
  assert.equal(result.policyHash, hashPolicy(policy));
  assert.equal(result.proofHash, hashProof(proof));
});

test("wrong policy hash is rejected", () => {
  const policy = makePolicy();
  const proof = makeProof(policy);
  proof.policyHash = "0xdeadbeef";
  proof.proof.proofHash = hashProof(proof);

  const result = verifyProof(policy, proof, { now: NOW });

  assert.equal(result.approved, false);
  assert.equal(result.reasonCode, "WRONG_POLICY_HASH");
});

test("invalid proof hash is rejected", () => {
  const policy = makePolicy();
  const proof = makeProof(policy);
  proof.proof.proofHash = "0xdeadbeef";

  const result = verifyProof(policy, proof, { now: NOW });

  assert.equal(result.approved, false);
  assert.equal(result.reasonCode, "INVALID_PROOF_HASH");
});

test("duplicate nullifier is rejected", () => {
  const policy = makePolicy();
  const proof = makeProof(policy);

  const result = verifyProof(policy, proof, {
    now: NOW,
    usedNullifiers: new Set([proof.antiSybil.eventNullifier])
  });

  assert.equal(result.approved, false);
  assert.equal(result.reasonCode, "DUPLICATE_NULLIFIER");
});

test("expired proof is rejected", () => {
  const policy = makePolicy();
  const proof = makeProof(policy, {
    expiresAt: "2026-04-28T08:00:00.000Z"
  });

  const result = verifyProof(policy, proof, { now: NOW });

  assert.equal(result.approved, false);
  assert.equal(result.reasonCode, "EXPIRED_PROOF");
});

test("not-qualified ETH exposure is rejected", () => {
  const policy = makePolicy();
  const proof = makeProof(policy, {
    aggregatedExposureTier: "not_qualified"
  });

  const result = verifyProof(policy, proof, { now: NOW });

  assert.equal(result.approved, false);
  assert.equal(result.reasonCode, "INSUFFICIENT_PROOF");
});

test("unsupported claim is rejected by the deterministic verifier", () => {
  const policy = makePolicy({
    requiredClaims: ["ETH_HOLDER", "X_ACCOUNT_BOUND"]
  });
  const proof = makeProof(policy);

  const result = verifyProof(policy, proof, { now: NOW });

  assert.equal(result.approved, false);
  assert.equal(result.reasonCode, "UNSUPPORTED_CLAIM");
});

test("event nullifier is deterministic", () => {
  const a = generateEventNullifier("event-1", "commitment-1");
  const b = generateEventNullifier("event-1", "commitment-1");
  const c = generateEventNullifier("event-2", "commitment-1");

  assert.equal(a, b);
  assert.notEqual(a, c);
});

function makePolicy(overrides = {}) {
  return {
    policyId: "policy-eth-holder-1",
    eventName: "Private ETH Holder Meetup",
    organizer: "0xBC4CaCC01E81C7b9258DF424260342D3De72B3d8",
    requiredClaims: ["ETH_HOLDER", "MULTI_WALLET_AGGREGATION"],
    privacy: {
      revealWalletAddress: false,
      revealExactBalance: false,
      revealWalletBreakdown: false,
      disclosureMode: "eligible_only"
    },
    antiSybil: {
      enabled: true,
      nullifierScope: "event"
    },
    execution: {
      onPass: "mint_rsvp_pass",
      executor: "keeperhub"
    },
    metadata: {
      verifierVersion: "verifier-v0.1.0",
      agentVersion: "agent-v0.1.0",
      createdAt: "2026-04-28T08:00:00.000Z"
    },
    ...overrides
  };
}

function makeProof(policy, overrides = {}) {
  const applicantCommitment = overrides.applicantCommitment ?? "0xapplicant";
  const eventNullifier = overrides.eventNullifier
    ?? generateEventNullifier(policy.policyId, applicantCommitment);

  const proof = {
    eventId: policy.policyId,
    policyHash: hashPolicy(policy),
    applicantCommitment,
    walletCommitments: overrides.walletCommitments ?? ["0xwalletA", "0xwalletB"],
    claims: {
      asset: "ETH",
      aggregatedExposureTier: overrides.aggregatedExposureTier ?? "qualified",
      holdingDurationTier: overrides.holdingDurationTier ?? "unknown"
    },
    privacy: {
      walletAddressesHidden: true,
      exactBalancesHidden: true,
      walletBreakdownHidden: true
    },
    antiSybil: {
      eventNullifier
    },
    proof: {
      proofHash: "0xpending",
      proofType: "zkTLS",
      expiresAt: overrides.expiresAt ?? "2026-04-28T09:00:00.000Z"
    }
  };

  proof.proof.proofHash = hashProof(proof);
  return proof;
}

function makeComputeReceipt(policy) {
  return {
    promptHash: "0xprompt",
    outputHash: "0xoutput",
    policyDraftHash: hashPolicy(policy),
    provider: "0G Compute",
    model: "test-model",
    signature: "0xsignature",
    createdAt: "2026-04-28T08:00:00.000Z",
    storagePointer: "0g://test/compute-receipt"
  };
}
