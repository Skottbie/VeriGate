import assert from "node:assert/strict";
import test from "node:test";
import { ethers } from "ethers";

import { hashPolicy, verifyProof } from "../src/index.js";
import {
  assertPublicProofSafe,
  buildApplicantProofFromReclaim,
  buildWalletControlMessage,
  createReclaimEthBalanceRequest,
  extractBalanceHex,
  requestReclaimEthHolderProof,
  verifyWalletControlSignature,
} from "../src/reclaimProof.js";

const NOW = new Date("2026-04-28T12:00:00.000Z");

test("wallet control signature is verified locally and never becomes public proof data", async () => {
  const wallet = ethers.Wallet.createRandom();
  const policy = makePolicy();
  const message = buildWalletControlMessage({
    eventId: policy.policyId,
    policyHash: hashPolicy(policy),
    nonce: "nonce-1",
    expiresAt: "2026-05-06T23:59:59.000Z",
  });
  const signature = await wallet.signMessage(message);

  assert.equal(verifyWalletControlSignature({
    walletAddress: wallet.address,
    message,
    signature,
  }), true);

  const result = await requestReclaimEthHolderProof({
    policy,
    walletAddress: wallet.address,
    walletSignature: signature,
    walletMessage: message,
    applicantSecret: "test-secret",
    expiresAt: "2026-05-06T23:59:59.000Z",
    now: NOW,
    reclaimClient: fakeReclaimClient("0x1"),
  });

  assert.equal(result.applicantProof.claims.aggregatedExposureTier, "qualified");
  assert.equal(result.applicantProof.privacy.walletAddressesHidden, true);
  assert.doesNotThrow(() => assertPublicProofSafe(result.applicantProof, {
    forbiddenValues: [wallet.address, signature, message],
  }));
  assert.doesNotThrow(() => assertPublicProofSafe(result.publicProofMeta, {
    forbiddenValues: [wallet.address, signature, message],
  }));
});

test("Reclaim ETH balance request templates source wallet as a private parameter", () => {
  const request = createReclaimEthBalanceRequest({
    walletAddress: "0x1111111111111111111111111111111111111111",
    ethRpcUrl: "https://rpc.example",
  });

  assert.equal(request.url, "https://rpc.example");
  assert.match(request.publicOptions.body, /\{\{wallet\}\}/);
  assert.doesNotMatch(request.publicOptions.body, /1111111111111111111111111111111111111111/);
  assert.equal(request.privateOptions.paramValues.wallet, "0x1111111111111111111111111111111111111111");
  assert.ok(request.privateOptions.responseRedactions.length > 0);
});

test("not-qualified Reclaim proof is rejected by deterministic verifier", async () => {
  const wallet = ethers.Wallet.createRandom();
  const policy = makePolicy();
  const message = buildWalletControlMessage({
    eventId: policy.policyId,
    policyHash: hashPolicy(policy),
    nonce: "nonce-2",
    expiresAt: "2026-05-06T23:59:59.000Z",
  });
  const signature = await wallet.signMessage(message);
  const result = await requestReclaimEthHolderProof({
    policy,
    walletAddress: wallet.address,
    walletSignature: signature,
    walletMessage: message,
    applicantSecret: "test-secret-2",
    expiresAt: "2026-05-06T23:59:59.000Z",
    now: NOW,
    reclaimClient: fakeReclaimClient("0x0"),
  });

  const verification = verifyProof(policy, result.applicantProof, { now: NOW });
  assert.equal(verification.approved, false);
  assert.equal(verification.reasonCode, "INSUFFICIENT_PROOF");
});

test("expired Reclaim applicant proof is rejected by deterministic verifier", () => {
  const wallet = ethers.Wallet.createRandom();
  const policy = makePolicy();
  const result = buildApplicantProofFromReclaim({
    policy,
    walletAddress: wallet.address,
    applicantSecret: "test-secret-3",
    expiresAt: "2026-04-28T11:00:00.000Z",
    qualified: true,
    reclaimProof: fakeReclaimProof("0x1"),
  });

  const verification = verifyProof(policy, result.applicantProof, { now: NOW });
  assert.equal(verification.approved, false);
  assert.equal(verification.reasonCode, "EXPIRED_PROOF");
});

test("privacy guard rejects public source wallet, signature, request, body, and exact balance fields", () => {
  assert.throws(() => assertPublicProofSafe({ walletAddress: "0xabc" }), /forbidden key/);
  assert.throws(() => assertPublicProofSafe({ signature: "0xsig" }), /forbidden key/);
  assert.throws(() => assertPublicProofSafe({ request: { body: "{}" } }), /forbidden key/);
  assert.throws(() => assertPublicProofSafe({ exactBalance: "1.0" }), /forbidden key/);
});

test("public event id is allowed even when it also appears in a wallet-control message", () => {
  const message = [
    "VeriGate ETH Holder Proof",
    "eventId: private_eth_holder_gate",
    "policyHash: 0xabc",
  ].join("\n");

  assert.doesNotThrow(() => assertPublicProofSafe(
    { eventId: "private_eth_holder_gate" },
    { forbiddenValues: ["0x1111111111111111111111111111111111111111"] },
  ));
  assert.doesNotThrow(() => assertPublicProofSafe(
    { eventId: "private_eth_holder_gate" },
    { forbiddenValues: ["private_eth_holder_gate"] },
  ));
  assert.ok(message.includes("private_eth_holder_gate"));
});

test("privacy guard still rejects forbidden wallet values in non-public fields", () => {
  assert.throws(() => assertPublicProofSafe(
    { nested: { leak: "0x1111111111111111111111111111111111111111" } },
    { forbiddenValues: ["0x1111111111111111111111111111111111111111"] },
  ), /forbidden value/);
});

test("extractBalanceHex accepts named Reclaim captures", () => {
  assert.equal(extractBalanceHex({
    extractedParameterValues: {
      balanceHex: "0xde0b6b3a7640000",
    },
  }), "0xde0b6b3a7640000");
});

function fakeReclaimClient(balanceHex) {
  return {
    async zkFetch() {
      return fakeReclaimProof(balanceHex);
    },
  };
}

function fakeReclaimProof(balanceHex) {
  return {
    identifier: "reclaim-proof-fixture",
    claimData: {
      provider: "reclaim",
    },
    signatures: ["0xsignature"],
    witnesses: [{ id: "witness-1" }],
    extractedParameterValues: {
      balanceHex,
    },
  };
}

function makePolicy() {
  return {
    policyId: "policy-eth-holder-reclaim-v1",
    eventName: "Private ETH Holder Meetup",
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
      agentVersion: "p6-reclaim-proof",
      createdAt: "2026-04-28T12:00:00.000Z",
    },
  };
}
