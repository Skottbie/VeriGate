import dotenv from "dotenv";

import { create0GComputeAdapter } from "../src/ogCompute.js";
import { create0GStorageAdapter, createEventMemoryNamespace } from "../src/ogStorage.js";

dotenv.config();

const eventId = "open-agents-demo-gate";
const namespace = createEventMemoryNamespace(eventId);
const intent = [
  "Create an ETH holder gate for Open Agents.",
  "Applicants should prove ETH holder eligibility without revealing source wallets or exact balances.",
  "Approved applicants should be eligible for a soulbound RSVP pass.",
].join(" ");

if (!process.env.OG_COMPUTE_PROVIDER_ADDRESS) {
  throw new Error("Set OG_COMPUTE_PROVIDER_ADDRESS before running live P4 0G Compute validation.");
}

const compute = create0GComputeAdapter();
const storage = create0GStorageAdapter();

console.log("Running live 0G Compute policy compiler");
const result = await compute.compilePolicyWith0GCompute(intent);
console.log(`policyHash=${result.policyDraft.metadata.policyHash}`);
console.log(`outputHash=${result.computeReceipt.outputHash}`);
console.log(`responseVerified=${result.metadata.responseVerified}`);

const pointer = await storage.uploadJson({
  eventId,
  namespace,
  kind: "compute-receipts",
  object: result.computeReceipt,
  uploadOptions: {
    onProgress: (message) => console.log(`storage: ${message}`),
  },
});

console.log("0G Compute receipt stored on 0G Storage");
console.log(JSON.stringify({ pointer, metadata: result.metadata }, null, 2));
