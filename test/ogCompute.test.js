import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildPolicyCompilerPrompt,
  createComputeReceipt,
  create0GComputeAdapter,
  extractJsonObject,
  finalizePolicyDraft,
} from "../src/ogCompute.js";
import { validateEligibilityPolicy } from "../src/schemas.js";

const fixedNow = () => new Date("2026-04-28T12:00:00.000Z");

function samplePolicy() {
  return {
    policyId: "policy-open-agents-eth-holder-v1",
    eventName: "Open Agents ETH Holder Gate",
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
      agentVersion: "p4-0g-compute",
      createdAt: "2026-04-28T12:00:00.000Z",
    },
  };
}

test("buildPolicyCompilerPrompt keeps ETH holder gate constraints explicit", () => {
  const prompt = buildPolicyCompilerPrompt("Create an ETH holder gate");
  assert.match(prompt, /ETH only/);
  assert.match(prompt, /deterministic verifier/);
  assert.match(prompt, /source wallet addresses/);
});

test("extractJsonObject parses raw and fenced JSON", () => {
  assert.deepEqual(extractJsonObject('{"ok":true}'), { ok: true });
  assert.deepEqual(extractJsonObject('```json\n{"ok":true}\n```'), { ok: true });
});

test("finalizePolicyDraft creates schema-valid policy with policy hash", () => {
  const policy = finalizePolicyDraft(samplePolicy(), { now: fixedNow() });
  validateEligibilityPolicy(policy);
  assert.equal(policy.metadata.createdAt, "2026-04-28T12:00:00.000Z");
  assert.equal(policy.metadata.agentVersion, "p4-0g-compute");
  assert.match(policy.metadata.policyHash, /^0x[0-9a-f]{64}$/);
});

test("finalizePolicyDraft overrides model-supplied metadata timestamps", () => {
  const draft = samplePolicy();
  draft.metadata.createdAt = "2023-10-05T14:48:00Z";
  draft.metadata.agentVersion = "model-supplied-agent";

  const policy = finalizePolicyDraft(draft, {
    now: fixedNow(),
    agentVersion: "p5-openclaw-agent",
  });

  assert.equal(policy.metadata.createdAt, "2026-04-28T12:00:00.000Z");
  assert.equal(policy.metadata.agentVersion, "p5-openclaw-agent");
});

test("finalizePolicyDraft overrides model-supplied organizer with system organizer", () => {
  const draft = samplePolicy();
  draft.organizer = "0xABCDEF1234567890BCDEF1234567890ABCDEF12";

  const policy = finalizePolicyDraft(draft, {
    now: fixedNow(),
    organizerAddress: "0x1111111111111111111111111111111111111111",
  });

  assert.equal(policy.organizer, "0x1111111111111111111111111111111111111111");
});

test("finalizePolicyDraft rejects invalid organizer addresses", () => {
  const draft = samplePolicy();
  draft.organizer = "0xABCDEF1234567890BCDEF1234567890ABCDEF12";

  assert.throws(() => finalizePolicyDraft(draft, { now: fixedNow() }), /20-byte address/);
});

test("buildPolicyCompilerPrompt tells the model organizer is system-provided", () => {
  const prompt = buildPolicyCompilerPrompt("Create an ETH holder gate", {
    organizerAddress: "0x1111111111111111111111111111111111111111",
  });
  assert.match(prompt, /system-provided/);
  assert.match(prompt, /0x1111111111111111111111111111111111111111/);
});

test("createComputeReceipt binds prompt, output, policy, provider, and model", () => {
  const policyDraft = finalizePolicyDraft(samplePolicy(), { now: fixedNow() });
  const receipt = createComputeReceipt({
    prompt: "prompt",
    output: JSON.stringify(policyDraft),
    policyDraft,
    provider: "0x1111111111111111111111111111111111111111",
    model: "qwen-2.5-7b-instruct",
    responseVerified: true,
    chatId: "chat-1",
    now: fixedNow(),
  });

  assert.match(receipt.promptHash, /^0x[0-9a-f]{64}$/);
  assert.match(receipt.outputHash, /^0x[0-9a-f]{64}$/);
  assert.equal(receipt.policyDraftHash, policyDraft.metadata.policyHash);
  assert.equal(receipt.signature, "responseVerified:true");
  assert.equal(receipt.proof, "chatId:chat-1");
});

test("compilePolicyWith0GCompute works with an injected fake broker", async () => {
  const fakePolicy = finalizePolicyDraft(samplePolicy(), { now: fixedNow() });
  const fakeBroker = {
    inference: {
      getServiceMetadata: async () => ({
        endpoint: "https://compute.example/v1/proxy",
        model: "qwen-2.5-7b-instruct",
      }),
      getRequestHeaders: async () => ({
        Authorization: "Bearer test",
      }),
      processResponse: async () => true,
    },
  };
  const adapter = create0GComputeAdapter({
    rpcUrl: "http://localhost:8545",
    privateKey: "0x59c6995e998f97a5a0044966f0945382dd70559dac4d7c0c3a7d6b6b7f8a5b5c",
    providerAddress: "0x1111111111111111111111111111111111111111",
    brokerFactory: async () => fakeBroker,
    now: fixedNow,
    fetchImpl: async () => ({
      ok: true,
      headers: {
        get: (name) => (name === "ZG-Res-Key" ? "chat-test" : null),
      },
      json: async () => ({
        id: "completion-test",
        choices: [{ message: { content: JSON.stringify(fakePolicy) } }],
        usage: { prompt_tokens: 10, completion_tokens: 20 },
      }),
    }),
  });

  const result = await adapter.compilePolicyWith0GCompute("Create an ETH holder gate");
  assert.equal(result.policyDraft.requiredClaims[0], "ETH_HOLDER");
  assert.equal(result.computeReceipt.model, "qwen-2.5-7b-instruct");
  assert.equal(result.computeReceipt.signature, "responseVerified:true");
  assert.equal(result.metadata.chatId, "chat-test");
});
