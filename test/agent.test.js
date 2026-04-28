import test from "node:test";
import assert from "node:assert/strict";

import {
  createPolicyFromIntentWith0GCompute,
  runVeriGateDryRun,
  summarizeDryRun,
} from "../scripts/agent/tools.js";

test("verigate agent dry-run follows the required P5 tool sequence", async () => {
  const result = await runVeriGateDryRun();
  const summary = summarizeDryRun(result);

  assert.equal(summary.mode, "dry-run");
  assert.deepEqual(summary.sequence, [
    "0g_compute_policy_compile",
    "organizer_policy_review",
    "deterministic_verifier",
    "0g_storage_memory",
    "execution",
  ]);
  assert.equal(summary.workspace, "/mnt/d/VeriAgent Mesh");
  assert.equal(summary.approved, true);
  assert.equal(summary.reasonCode, "POLICY_SATISFIED");
  assert.equal(summary.executionStatus, "READY_FOR_MINT");
  assert.match(summary.memoryPointer, /^0G:\/\//);
});

test("verigate agent dry-run accepts a natural-language organizer intent", async () => {
  const intent = [
    "Create a private ETH holder gate for an onchain AI workshop.",
    "Applicants should only reveal whether they are qualified, not their wallet address or exact ETH balance.",
  ].join(" ");

  const result = await runVeriGateDryRun({ organizerIntent: intent });

  assert.equal(result.compute.organizerIntent, intent);
  assert.equal(result.compute.mode, "dry-run");
  assert.equal(result.compute.computeReceipt.provider, "local-dry-run");
  assert.equal(result.compute.computeReceipt.model, "template-policy-compiler");
  assert.equal(result.compute.computeReceipt.signature, undefined);
  assert.equal(result.compute.computeReceipt.proof, undefined);
  assert.match(result.compute.rawOutput, /ETH_HOLDER/);
  assert.equal(result.compute.policyDraft.privacy.revealWalletAddress, false);
  assert.equal(result.compute.policyDraft.privacy.revealExactBalance, false);
  assert.equal(result.verification.result.reasonCode, "POLICY_SATISFIED");
});

test("live workflow memory writer uploads policy, compute, audit, execution, and manifest", async () => {
  const uploads = [];
  const result = await runVeriGateDryRun();
  const liveMemory = await import("../scripts/agent/tools.js").then(({ write0GMemory }) => write0GMemory({
    policyDraft: result.compute.policyDraft,
    computeReceipt: result.compute.computeReceipt,
    applicantProof: result.proofRequest.proof,
    verificationResult: result.verification.result,
    executionReceipt: result.execution.executionReceipt,
    mode: "0g-compute-live",
    storageAdapter: {
      async uploadJson({ eventId, namespace, kind, object }) {
        uploads.push({ eventId, namespace, kind, object });
        return {
          provider: "0G",
          rootHash: `0x${kind.replace(/[^a-z]/g, "").padEnd(64, "0").slice(0, 64)}`,
          txHash: `0x${kind.replace(/[^a-z]/g, "").padEnd(64, "1").slice(0, 64)}`,
        };
      },
    },
  }));

  assert.deepEqual(uploads.map((upload) => upload.kind), [
    "policy",
    "compute-receipts",
    "audit",
    "execution",
    "manifest",
  ]);
  assert.equal(liveMemory.mode, "0g-storage-live");
  assert.match(liveMemory.manifestPointer.rootHash, /^0x/);
});

test("0G Compute policy compiler path calls the live adapter without fallback", async () => {
  let called = false;
  const result = await createPolicyFromIntentWith0GCompute({
    organizerIntent: "Create an ETH holder gate.",
    adapter: {
      async compilePolicyWith0GCompute(organizerIntent) {
        called = true;
        return {
          policyDraft: {
            policyId: "policy-live-adapter-test",
            eventName: "Live Adapter Test",
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
              agentVersion: "p5-openclaw-agent",
              createdAt: "2026-04-28T12:00:00.000Z",
              policyHash: "0xadapter",
            },
          },
          computeReceipt: {
            provider: "0xprovider",
            model: "0g-live-test-model",
          },
          rawOutput: "{}",
          metadata: {
            providerAddress: "0xprovider",
          },
        };
      },
    },
  });

  assert.equal(called, true);
  assert.equal(result.mode, "0g-compute-live");
  assert.equal(result.computeReceipt.provider, "0xprovider");
});
