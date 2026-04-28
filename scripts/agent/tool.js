import {
  createPolicyFromIntent,
  executePassIssuance,
  generatePrivacyPlan,
  requestApplicantProof,
  runVeriGateLiveWorkflow,
  runVeriGateDryRun,
  validatePolicy,
  verifyApplicantProof,
  write0GMemory,
} from "./tools.js";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

const command = process.argv[2] ?? "dry-run";
const organizerIntent = process.argv.slice(3).join(" ").trim() || undefined;
const isLiveCommand = command === "live" || command === "0g-compute-live" || command.endsWith(":live");

function workflowForCommand() {
  return isLiveCommand ? runVeriGateLiveWorkflow({ organizerIntent }) : runVeriGateDryRun({ organizerIntent });
}

const handlers = {
  async createPolicyFromIntent() {
    return createPolicyFromIntent({ organizerIntent, mode: "dry-run" });
  },
  async "createPolicyFromIntent:live"() {
    return createPolicyFromIntent({ organizerIntent, mode: "0g-compute-live" });
  },
  async validatePolicy() {
    const run = await workflowForCommand();
    return validatePolicy(run.compute.policyDraft);
  },
  async generatePrivacyPlan() {
    const run = await workflowForCommand();
    return generatePrivacyPlan(run.compute.policyDraft);
  },
  async requestApplicantProof() {
    const run = await workflowForCommand();
    return requestApplicantProof({ policyDraft: run.compute.policyDraft });
  },
  async verifyProof() {
    const run = await workflowForCommand();
    return verifyApplicantProof({
      policyDraft: run.compute.policyDraft,
      applicantProof: run.proofRequest.proof,
    });
  },
  async write0GMemory() {
    const run = await workflowForCommand();
    return write0GMemory({
      policyDraft: run.compute.policyDraft,
      applicantProof: run.proofRequest.proof,
      verificationResult: run.verification.result,
      mode: run.mode,
    });
  },
  async executePassIssuance() {
    const run = await workflowForCommand();
    return executePassIssuance({
      policyDraft: run.compute.policyDraft,
      verificationResult: run.verification.result,
      mode: run.mode,
    });
  },
  async "dry-run"() {
    return runVeriGateDryRun({ organizerIntent });
  },
  async live() {
    return runVeriGateLiveWorkflow({ organizerIntent });
  },
  async "0g-compute-live"() {
    return runVeriGateLiveWorkflow({ organizerIntent });
  },
};

if (!handlers[command]) {
  console.error(`Unknown verigate agent tool: ${command}`);
  console.error(`Available tools: ${Object.keys(handlers).join(", ")}`);
  process.exit(1);
}

const result = await handlers[command]();
console.log(JSON.stringify(result, null, 2));
