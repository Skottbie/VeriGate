import assert from "node:assert/strict";
import { test } from "node:test";

import {
  assertKeeperHubNetworkSupportedForDeployment,
  buildPassIssuancePlan,
  buildKeeperHubContractCallBody,
  createKeeperHubClient,
  deriveChainEventId,
  executePassIssuanceOnchain,
  hashPolicy,
  hashProof,
  normalizeAbiForKeeperHub,
  resolveKeeperHubExecutionTarget,
} from "../src/index.js";

const SOURCE_WALLET = "0x1111111111111111111111111111111111111111";
const FRESH_WALLET = "0x2222222222222222222222222222222222222222";

function fixturePolicy() {
  const policy = {
    policyId: "AI_AGENT_BUILDER_GATE",
    eventName: "AI Agent Builder Gate",
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
      agentVersion: "p8-keeperhub",
      createdAt: "2026-04-29T12:00:00.000Z",
    },
  };
  policy.metadata.policyHash = hashPolicy(policy);
  return policy;
}

function fixtureProof(policy) {
  const proof = {
    eventId: policy.policyId,
    policyHash: hashPolicy(policy),
    applicantCommitment: "0xbe66b6abe6a44e5ff5c494fb4fa5ce2a568ba7df24ea2e071c6848f9f0a87bb4",
    walletCommitments: [
      "0xa4c77032c1620a5d10faa434a85a7ab1fba5906ccf03474e8dbac5af8f4dbf1d",
    ],
    claims: {
      asset: "ETH",
      aggregatedExposureTier: "qualified",
      holdingDurationTier: "unknown",
    },
    privacy: {
      walletAddressesHidden: true,
      exactBalancesHidden: true,
      walletBreakdownHidden: true,
    },
    antiSybil: {
      eventNullifier: "0xa3b3ddd4cb3ff0cd314a0b4f419f3796c1314e4ba62f1ae98810dd98704b8b7e",
    },
    proof: {
      proofHash: "0xpending",
      proofType: "zkTLS",
      expiresAt: "2026-05-06T00:00:00.000Z",
    },
  };
  proof.proof.proofHash = hashProof(proof);
  return proof;
}

function fixtureVerification(policy, proof, approved = true) {
  return {
    approved,
    result: approved ? "approved" : "rejected",
    reasonCode: approved ? "POLICY_SATISFIED" : "INSUFFICIENT_PROOF",
    policyHash: hashPolicy(policy),
    proofHash: proof.proof.proofHash,
    eventNullifier: proof.antiSybil.eventNullifier,
  };
}

test("pass issuance plan keeps source wallet separate from fresh recipient", () => {
  const policy = fixturePolicy();
  const proof = fixtureProof(policy);
  const plan = buildPassIssuancePlan({
    policy,
    applicantProof: proof,
    verificationResult: fixtureVerification(policy, proof),
    recipientAddress: FRESH_WALLET,
    sourceWalletAddress: SOURCE_WALLET,
    memory: {
      manifestPointer: {
        rootHash: "0xa78f7dd5bd786730e3f3e8427e5cc68ac3451acb87955e04ae8e6800d13bd772",
      },
    },
  });

  assert.equal(plan.recipientAddress, FRESH_WALLET);
  assert.equal(plan.recipientPrivacy.recipientType, "fresh_pass_wallet");
  assert.equal(plan.recipientPrivacy.sourceWalletHidden, true);
  assert.equal(plan.auditURI, "0G://0xa78f7dd5bd786730e3f3e8427e5cc68ac3451acb87955e04ae8e6800d13bd772");
  assert.match(plan.receiptId, /^0x[0-9a-f]{64}$/);
});

test("chain event id changes when policy hash changes under the same policy id", () => {
  const policy = fixturePolicy();
  const policyHash = hashPolicy(policy);
  const nextPolicyHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

  assert.notEqual(
    deriveChainEventId({ policyId: policy.policyId, policyHash }),
    deriveChainEventId({ policyId: policy.policyId, policyHash: nextPolicyHash }),
  );
});

test("pass issuance plan rejects recipient equal to source wallet", () => {
  const policy = fixturePolicy();
  const proof = fixtureProof(policy);
  assert.throws(() => buildPassIssuancePlan({
    policy,
    applicantProof: proof,
    verificationResult: fixtureVerification(policy, proof),
    recipientAddress: SOURCE_WALLET,
    sourceWalletAddress: SOURCE_WALLET,
  }), /must not equal/);
});

test("pass issuance plan rejects failed verifier results", () => {
  const policy = fixturePolicy();
  const proof = fixtureProof(policy);
  assert.throws(() => buildPassIssuancePlan({
    policy,
    applicantProof: proof,
    verificationResult: fixtureVerification(policy, proof, false),
    recipientAddress: FRESH_WALLET,
  }), /rejected proof/);
});

test("dry-run pass execution produces a KeeperHub-shaped execution receipt", async () => {
  const policy = fixturePolicy();
  const proof = fixtureProof(policy);
  const result = await executePassIssuanceOnchain({
    policy,
    applicantProof: proof,
    verificationResult: fixtureVerification(policy, proof),
    recipientAddress: FRESH_WALLET,
    sourceWalletAddress: SOURCE_WALLET,
    mode: "dry-run",
  });

  assert.equal(result.executionReceipt.executor, "KeeperHub");
  assert.equal(result.executionReceipt.status, "READY_FOR_MINT");
  assert.equal(result.executionReceipt.recipient, FRESH_WALLET);
});

test("KeeperHub client sends contract-call payload without exposing local secrets", async () => {
  const requests = [];
  const client = createKeeperHubClient({
    apiKey: "kh_test",
    baseUrl: "https://app.keeperhub.com",
    network: "sepolia",
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return {
        ok: true,
        async json() {
          return url.endsWith("/status")
            ? { executionId: "direct_1", status: "completed", transactionHash: "0xabc" }
            : { executionId: "direct_1", status: "completed" };
        },
      };
    },
  });

  await client.contractCall({
    contractAddress: FRESH_WALLET,
    functionName: "mintWithVerifiedReceipt",
    functionArgs: [FRESH_WALLET, "0x1234", "0G://manifest"],
    abi: ["function mintWithVerifiedReceipt(address,bytes32,string)"],
  });

  assert.equal(requests[0].url, "https://app.keeperhub.com/api/execute/contract-call");
  const body = JSON.parse(requests[0].options.body);
  assert.equal(body.network, "sepolia");
  assert.equal(body.functionName, "mintWithVerifiedReceipt");
  assert.equal(body.functionArgs, JSON.stringify([FRESH_WALLET, "0x1234", "0G://manifest"]));
  const abi = JSON.parse(body.abi);
  assert.equal(abi[0].type, "function");
  assert.equal(abi[0].name, "mintWithVerifiedReceipt");
  assert.equal(requests[0].options.headers.Authorization, "Bearer kh_test");
  assert.equal(requests[0].options.headers["X-API-Key"], "kh_test");
});

test("KeeperHub ABI normalizer converts ethers human-readable ABI to JSON ABI", () => {
  const abi = normalizeAbiForKeeperHub([
    "function mintWithVerifiedReceipt(address recipient,bytes32 receiptId,string calldata passTokenURI) external returns (uint256 tokenId)",
  ]);

  assert.equal(abi[0].type, "function");
  assert.equal(abi[0].name, "mintWithVerifiedReceipt");
  assert.deepEqual(abi[0].inputs.map((item) => item.type), ["address", "bytes32", "string"]);
});

test("KeeperHub contract-call body matches official documented field types", () => {
  const body = buildKeeperHubContractCallBody({
    contractAddress: FRESH_WALLET,
    network: "sepolia",
    functionName: "mintWithVerifiedReceipt",
    functionArgs: [FRESH_WALLET, "0x1234", "0G://manifest"],
    abi: ["function mintWithVerifiedReceipt(address,bytes32,string)"],
    value: "0",
    gasLimitMultiplier: "1.2",
  });

  assert.equal(typeof body.contractAddress, "string");
  assert.equal(typeof body.network, "string");
  assert.equal(typeof body.functionName, "string");
  assert.equal(typeof body.functionArgs, "string");
  assert.equal(typeof body.abi, "string");
  assert.equal(typeof body.value, "string");
  assert.equal(typeof body.gasLimitMultiplier, "string");
  assert.deepEqual(JSON.parse(body.functionArgs), [FRESH_WALLET, "0x1234", "0G://manifest"]);
  assert.equal(JSON.parse(body.abi)[0].name, "mintWithVerifiedReceipt");
});

test("KeeperHub execution rejects known unsupported 0G Galileo network before opaque FAILED status", () => {
  assert.throws(() => assertKeeperHubNetworkSupportedForDeployment({
    network: "0g-galileo",
    deployment: { chainId: 16602 },
  }), /does not currently support 0G Galileo/);

  assert.throws(() => assertKeeperHubNetworkSupportedForDeployment({
    network: "16602",
    deployment: { chainId: 16602 },
  }), /does not currently support 0G Galileo/);

  assert.doesNotThrow(() => assertKeeperHubNetworkSupportedForDeployment({
    network: "sepolia",
    deployment: { chainId: 11155111 },
  }));
});

test("KeeperHub execution target falls back from 0G Galileo env to Sepolia deployment", () => {
  const previous = {
    KH_NETWORK: process.env.KH_NETWORK,
    KH_DEPLOYMENT_PATH: process.env.KH_DEPLOYMENT_PATH,
    SEPOLIA_RPC_URL: process.env.SEPOLIA_RPC_URL,
    SEPOLIA_PRIVATE_KEY: process.env.SEPOLIA_PRIVATE_KEY,
    OG_PRIVATE_KEY: process.env.OG_PRIVATE_KEY,
  };
  try {
    process.env.KH_NETWORK = "0g-galileo";
    delete process.env.KH_DEPLOYMENT_PATH;
    process.env.SEPOLIA_RPC_URL = "https://sepolia.example";
    process.env.SEPOLIA_PRIVATE_KEY = "0x" + "11".repeat(32);
    const target = resolveKeeperHubExecutionTarget({
      deploymentPath: "deployments/0g-galileo/addresses.json",
      rpcUrl: "https://0g.example",
      privateKey: "0x" + "22".repeat(32),
    });

    assert.equal(target.network, "sepolia");
    assert.equal(target.deploymentPath, "deployments/sepolia/addresses.json");
    assert.equal(target.rpcUrl, "https://sepolia.example");
    assert.equal(target.privateKey, "0x" + "11".repeat(32));
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
});
