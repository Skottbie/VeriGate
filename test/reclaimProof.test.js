import assert from "node:assert/strict";
import test from "node:test";
import { ethers } from "ethers";

import { hashPolicy, verifyProof } from "../src/index.js";
import {
  assertPublicProofSafe,
  buildApplicantProofFromReclaim,
  buildPublicReclaimProofMeta,
  buildWalletControlMessage,
  createReclaimEthBalanceRequest,
  extractBalanceHex,
  requestReclaimEthHolderProof,
  verifyReclaimProofBinding,
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

test("server-side Reclaim verification accepts a live-shaped proof and derives the tier from raw proof data", async () => {
  const wallet = ethers.Wallet.createRandom();
  const policy = makePolicy();
  const proof = fakeReclaimProof("0x1");
  const calls = [];
  const result = buildApplicantProofFromReclaim({
    policy,
    walletAddress: wallet.address,
    applicantSecret: "test-secret-4",
    expiresAt: "2026-05-06T23:59:59.000Z",
    qualified: true,
    reclaimProof: proof,
  });

  const verification = await verifyReclaimProofBinding({
    applicantProof: result.applicantProof,
    publicProofMeta: result.publicProofMeta,
    rawReclaimProof: proof,
    moduleLoader: async () => ({
      getHttpProviderClaimParamsFromProof: (candidate) => JSON.parse(candidate.claimData.parameters),
      hashProofClaimParams: () => "0xexpectedhash",
      verifyProof: async (candidate, config) => {
        calls.push({ candidate, config });
        return { isVerified: candidate === proof };
      },
    }),
  });

  assert.equal(verification.provider, "Reclaim");
  assert.equal(verification.serverVerified, true);
  assert.equal(verification.claimSource, "server_verified_zktls");
  assert.equal(verification.derivedExposureTier, "qualified");
  assert.equal(verification.verificationConfig, "hash_bound");
  assert.equal(verification.witnessCount, 1);
  assert.equal(verification.signatureCount, 1);
  assert.equal(verification.rawProof, "withheld");
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].config, { hashes: ["0xexpectedhash"] });
});

test("server-side Reclaim verification rejects when the raw proof session is missing", async () => {
  const wallet = ethers.Wallet.createRandom();
  const policy = makePolicy();
  const proof = fakeReclaimProof("0x1");
  const result = buildApplicantProofFromReclaim({
    policy,
    walletAddress: wallet.address,
    applicantSecret: "test-secret-5",
    expiresAt: "2026-05-06T23:59:59.000Z",
    qualified: true,
    reclaimProof: proof,
  });

  await assert.rejects(() => verifyReclaimProofBinding({
    applicantProof: result.applicantProof,
    publicProofMeta: result.publicProofMeta,
    rawReclaimProof: null,
    moduleLoader: async () => ({
      verifyProof: async () => ({ isVerified: true }),
    }),
  }), /RECLAIM_PROOF_NOT_FOUND/);
});

test("server-side Reclaim verification rejects when witness proof verification fails", async () => {
  const wallet = ethers.Wallet.createRandom();
  const policy = makePolicy();
  const proof = fakeReclaimProof("0x1");
  const result = buildApplicantProofFromReclaim({
    policy,
    walletAddress: wallet.address,
    applicantSecret: "test-secret-6",
    expiresAt: "2026-05-06T23:59:59.000Z",
    qualified: true,
    reclaimProof: proof,
  });

  await assert.rejects(() => verifyReclaimProofBinding({
    applicantProof: result.applicantProof,
    publicProofMeta: result.publicProofMeta,
    rawReclaimProof: proof,
    moduleLoader: async () => ({
      getHttpProviderClaimParamsFromProof: (candidate) => JSON.parse(candidate.claimData.parameters),
      hashProofClaimParams: () => "0xexpectedhash",
      verifyProof: async () => ({ isVerified: false }),
    }),
  }), /INVALID_RECLAIM_PROOF/);
});

test("server-side Reclaim verification rejects tier mismatch between applicant proof and raw proof balance", async () => {
  const wallet = ethers.Wallet.createRandom();
  const policy = makePolicy();
  const proof = fakeReclaimProof("0x0");
  const result = buildApplicantProofFromReclaim({
    policy,
    walletAddress: wallet.address,
    applicantSecret: "test-secret-7",
    expiresAt: "2026-05-06T23:59:59.000Z",
    qualified: true,
    reclaimProof: proof,
  });

  await assert.rejects(() => verifyReclaimProofBinding({
    applicantProof: result.applicantProof,
    publicProofMeta: result.publicProofMeta,
    rawReclaimProof: proof,
    moduleLoader: async () => ({
      getHttpProviderClaimParamsFromProof: (candidate) => JSON.parse(candidate.claimData.parameters),
      hashProofClaimParams: () => "0xexpectedhash",
      verifyProof: async () => ({ isVerified: true }),
    }),
  }), /RECLAIM_TIER_MISMATCH/);
});

test("server-side Reclaim verification rejects when public proof metadata does not bind to the raw proof", async () => {
  const wallet = ethers.Wallet.createRandom();
  const policy = makePolicy();
  const proof = fakeReclaimProof("0x1");
  const result = buildApplicantProofFromReclaim({
    policy,
    walletAddress: wallet.address,
    applicantSecret: "test-secret-8",
    expiresAt: "2026-05-06T23:59:59.000Z",
    qualified: true,
    reclaimProof: proof,
  });
  const tamperedMeta = {
    ...buildPublicReclaimProofMeta({ ...proof, identifier: "tampered" }),
    proofSha256: "0x" + "ab".repeat(32),
  };

  await assert.rejects(() => verifyReclaimProofBinding({
    applicantProof: result.applicantProof,
    publicProofMeta: tamperedMeta,
    rawReclaimProof: proof,
    moduleLoader: async () => ({
      verifyProof: async () => ({ isVerified: true }),
    }),
  }), /INVALID_RECLAIM_PROOF/);
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
      parameters: JSON.stringify({
        url: "https://rpc.example",
        method: "POST",
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_getBalance",
          params: ["{{wallet}}", "latest"],
        }),
        responseMatches: [
          {
            type: "regex",
            value: '"result"\\s*:\\s*"(?<balanceHex>0x[0-9a-fA-F]+)"',
          },
        ],
        responseRedactions: [
          {
            regex: '"result"\\s*:\\s*"0x[0-9a-fA-F]+"',
          },
        ],
      }),
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
