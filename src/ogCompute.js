import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";
import { ethers } from "ethers";

import { canonicalize } from "./canonical.js";
import { hashComputeReceipt, hashPolicy, sha256Hex } from "./hash.js";
import { validateComputeReceipt, validateEligibilityPolicy } from "./schemas.js";

const DEFAULT_POLICY_COMPILER_MODEL_HINT = "qwen-2.5-7b-instruct";

export function buildPolicyCompilerPrompt(organizerIntent, { organizerAddress } = {}) {
  if (typeof organizerIntent !== "string" || organizerIntent.trim().length === 0) {
    throw new TypeError("organizerIntent must be a non-empty string");
  }

  return [
    "You are VeriGate Policy Compiler.",
    "Return only one JSON object matching this shape:",
    "{",
    '  "policyId": "string",',
    '  "eventName": "string",',
    '  "organizer": "0x...",',
    '  "requiredClaims": ["ETH_HOLDER"],',
    '  "privacy": {',
    '    "revealWalletAddress": false,',
    '    "revealExactBalance": false,',
    '    "revealWalletBreakdown": false,',
    '    "disclosureMode": "tier_only"',
    "  },",
    '  "antiSybil": { "enabled": true, "nullifierScope": "event" },',
    '  "execution": { "onPass": "mint_rsvp_pass", "executor": "keeperhub" },',
    '  "metadata": {',
    '    "verifierVersion": "p1-deterministic-verifier",',
    '    "agentVersion": "p4-0g-compute",',
    '    "createdAt": "ISO-8601 string"',
    "  }",
    "}",
    "Rules:",
    "- Asset must be ETH only.",
    organizerAddress
      ? `- Organizer address is system-provided as ${organizerAddress}; do not invent another organizer.`
      : "- Organizer address is system-provided and will be enforced after generation.",
    "- Do not include source wallet addresses, exact balances, request headers, API secrets, or raw proofs.",
    "- LLM compiles policy only; deterministic verifier decides pass/fail later.",
    "",
    `Organizer intent: ${organizerIntent.trim()}`,
  ].join("\n");
}

export function extractJsonObject(text) {
  if (typeof text !== "string" || text.trim().length === 0) {
    throw new TypeError("LLM output must be a non-empty string");
  }

  const trimmed = text.trim();
  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    return JSON.parse(trimmed);
  }

  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    return JSON.parse(fenced[1].trim());
  }

  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("LLM output does not contain a JSON object");
  }

  return JSON.parse(trimmed.slice(start, end + 1));
}

export function finalizePolicyDraft(policyDraft, {
  now = new Date(),
  agentVersion = "p4-0g-compute",
  organizerAddress,
} = {}) {
  const finalized = structuredClone(policyDraft);
  if (organizerAddress) {
    finalized.organizer = organizerAddress;
  }
  finalized.requiredClaims ??= ["ETH_HOLDER"];
  finalized.privacy ??= {};
  finalized.privacy.revealWalletAddress ??= false;
  finalized.privacy.revealExactBalance ??= false;
  finalized.privacy.revealWalletBreakdown ??= false;
  finalized.privacy.disclosureMode ??= "tier_only";
  finalized.antiSybil ??= { enabled: true, nullifierScope: "event" };
  finalized.execution ??= { onPass: "mint_rsvp_pass", executor: "keeperhub" };
  finalized.metadata ??= {};
  finalized.metadata.verifierVersion = "p1-deterministic-verifier";
  finalized.metadata.agentVersion = agentVersion;
  finalized.metadata.createdAt = now.toISOString();
  finalized.metadata.policyHash = hashPolicy(finalized);

  return validateEligibilityPolicy(finalized);
}

export function createComputeReceipt({
  prompt,
  output,
  policyDraft,
  provider,
  model,
  responseVerified = null,
  chatId,
  storagePointer,
  now = new Date(),
}) {
  const receipt = {
    promptHash: sha256Hex(`verigate:0g-compute:prompt:v1:${prompt}`),
    outputHash: sha256Hex(`verigate:0g-compute:output:v1:${output}`),
    policyDraftHash: hashPolicy(policyDraft),
    provider,
    model,
    createdAt: now.toISOString(),
    storagePointer,
  };
  if (chatId) {
    receipt.proof = `chatId:${chatId}`;
  }
  if (responseVerified !== null) {
    receipt.signature = `responseVerified:${responseVerified}`;
  }

  receipt.receiptHash = hashComputeReceipt(receipt);
  return validateComputeReceipt(receipt);
}

export function create0GComputeAdapter({
  rpcUrl = process.env.OG_RPC_URL,
  privateKey = process.env.OG_PRIVATE_KEY,
  providerAddress = process.env.OG_COMPUTE_PROVIDER_ADDRESS,
  brokerFactory = createZGComputeNetworkBroker,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
} = {}) {
  if (!rpcUrl) {
    throw new Error("OG_RPC_URL is required");
  }
  if (!privateKey) {
    throw new Error("OG_PRIVATE_KEY is required for 0G Compute requests");
  }
  if (!providerAddress) {
    throw new Error("OG_COMPUTE_PROVIDER_ADDRESS is required for live 0G Compute requests");
  }
  if (typeof fetchImpl !== "function") {
    throw new Error("fetch implementation is required");
  }

  async function createBroker() {
    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const signer = new ethers.Wallet(privateKey, provider);
    return brokerFactory(signer);
  }

  async function callChatCompletion({ messages, contentForBilling }) {
    const broker = await createBroker();
    const { endpoint, model } = await broker.inference.getServiceMetadata(providerAddress);
    const headers = await broker.inference.getRequestHeaders(providerAddress, contentForBilling);
    const body = {
      model,
      messages,
      temperature: 0.1,
      response_format: { type: "json_object" },
    };
    const response = await fetchImpl(`${endpoint}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      throw new Error(`0G Compute request failed: HTTP ${response.status} ${await response.text()}`);
    }

    const payload = await response.json();
    const output = payload.choices?.[0]?.message?.content;
    if (typeof output !== "string" || output.length === 0) {
      throw new Error("0G Compute response did not include choices[0].message.content");
    }

    const chatId = response.headers?.get?.("ZG-Res-Key") ?? payload.id;
    const usage = payload.usage ? JSON.stringify(payload.usage) : undefined;
    const responseVerified = await broker.inference.processResponse(providerAddress, chatId, usage);

    return {
      model,
      endpoint,
      output,
      chatId,
      responseVerified,
    };
  }

  async function compilePolicyWith0GCompute(organizerIntent, { organizerAddress } = {}) {
    const prompt = buildPolicyCompilerPrompt(organizerIntent, { organizerAddress });
    const messages = [
      {
        role: "system",
        content: "Return strict JSON only. Do not decide applicant pass/fail.",
      },
      {
        role: "user",
        content: prompt,
      },
    ];
    const compute = await callChatCompletion({
      messages,
      contentForBilling: prompt,
    });
    const parsed = extractJsonObject(compute.output);
    const policyDraft = finalizePolicyDraft(parsed, { now: now(), organizerAddress });
    const receipt = createComputeReceipt({
      prompt,
      output: compute.output,
      policyDraft,
      provider: providerAddress,
      model: compute.model ?? DEFAULT_POLICY_COMPILER_MODEL_HINT,
      responseVerified: compute.responseVerified,
      chatId: compute.chatId,
      now: now(),
    });

    return {
      policyDraft,
      computeReceipt: receipt,
      rawOutput: compute.output,
      metadata: {
        providerAddress,
        endpoint: compute.endpoint,
        model: compute.model,
        chatId: compute.chatId,
        responseVerified: compute.responseVerified,
      },
    };
  }

  async function generateAuditNarrationWith0GCompute(auditRecord) {
    const prompt = [
      "Explain this VeriGate audit record in two concise sentences.",
      "Do not add claims beyond the JSON record.",
      canonicalize(auditRecord),
    ].join("\n");
    const compute = await callChatCompletion({
      messages: [{ role: "user", content: prompt }],
      contentForBilling: prompt,
    });

    return {
      narration: compute.output.trim(),
      computeReceipt: createComputeReceipt({
        prompt,
        output: compute.output,
        policyDraft: finalizePolicyDraft({
          policyId: "audit-narration-only",
          eventName: auditRecord.eventId,
          organizer: "0x0000000000000000000000000000000000000000",
          requiredClaims: ["ETH_HOLDER"],
        }, { now: now() }),
        provider: providerAddress,
        model: compute.model ?? DEFAULT_POLICY_COMPILER_MODEL_HINT,
        responseVerified: compute.responseVerified,
        chatId: compute.chatId,
        now: now(),
      }),
    };
  }

  return {
    compilePolicyWith0GCompute,
    generateAuditNarrationWith0GCompute,
  };
}
