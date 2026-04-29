import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";

import {
  createPolicyFromIntent,
  executePassIssuance,
  generatePrivacyPlan,
  validatePolicy,
  verifyApplicantProof,
  write0GMemory,
} from "./agent/tools.js";
import {
  assertPublicProofSafe,
  buildWalletControlMessage,
  buildEnsIdentityPayload,
  createEnsResolverAdapter,
  hashPolicy,
  publishEnsTextRecords,
  requestReclaimEthHolderProof,
  validateEnsRecordAlignment,
} from "../src/index.js";

dotenv.config({ quiet: true });

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_ROOT = join(ROOT, "public");
const PORT = Number(process.env.VERIGATE_WEB_PORT ?? 4173);
const MAX_BODY_BYTES = 1024 * 1024;
const APP_VERSION = "p7-storage-timeout-partial-results";

const CONTENT_TYPES = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
};

const server = createServer(async (request, response) => {
  try {
    if (request.url?.startsWith("/api/")) {
      await handleApi(request, response);
      return;
    }
    await serveStatic(request, response);
  } catch (error) {
    sendJson(response, 500, {
      ok: false,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});

server.listen(PORT, () => {
  console.log(`VeriGate test UI: http://localhost:${PORT}`);
});

async function handleApi(request, response) {
  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);

  if (request.method === "GET" && url.pathname === "/api/status") {
    sendJson(response, 200, {
      ok: true,
      version: APP_VERSION,
      env: {
        ogRpcUrl: Boolean(process.env.OG_RPC_URL),
        ogPrivateKey: Boolean(process.env.OG_PRIVATE_KEY),
        ogComputeProviderAddress: Boolean(process.env.OG_COMPUTE_PROVIDER_ADDRESS),
        reclaimAppId: Boolean(process.env.RECLAIM_APP_ID),
        reclaimAppSecret: Boolean(process.env.RECLAIM_APP_SECRET),
        ensPublishKey: Boolean(process.env.SEPOLIA_PRIVATE_KEY ?? process.env.OG_PRIVATE_KEY),
      },
      modes: {
        policy: ["dry-run", "0g-compute-live"],
        proof: ["fixture-qualified", "fixture-rejected", "reclaim-live"],
        memory: ["dry-run", "0g-storage-live"],
      },
      ens: {
        agentName: process.env.ENS_AGENT_NAME ?? "verigate-agent.eth",
        network: "sepolia",
      },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/policy") {
    const body = await readJson(request);
    const mode = body.policyMode === "dry-run" ? "dry-run" : "0g-compute-live";
    if (typeof body.organizerAddress !== "string" || body.organizerAddress.length === 0) {
      throw new Error("organizerAddress is required; connect an organizer wallet before compiling policy");
    }
    const compute = await createPolicyFromIntent({
      organizerIntent: body.organizerIntent,
      organizerAddress: body.organizerAddress,
      mode,
    });
    const review = validatePolicy(compute.policyDraft);
    const privacyPlan = generatePrivacyPlan(compute.policyDraft);

    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("0g_compute_policy_compile", `Policy compiled with ${mode}.`),
        logEntry("organizer_policy_review", "Policy schema and hash validated."),
        logEntry("privacy_plan", "Public and hidden proof fields generated."),
      ],
      compute,
      review,
      privacyPlan,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/signing-message") {
    const body = await readJson(request);
    const policy = body.policy;
    const expiresAt = body.expiresAt ?? new Date(Date.now() + 60 * 60 * 1000).toISOString();
    const nonce = body.nonce ?? crypto.randomUUID();
    const policyHash = hashPolicy(policy);
    const message = buildWalletControlMessage({
      eventId: policy.policyId,
      policyHash,
      nonce,
      expiresAt,
    });

    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("wallet_control_message", "Wallet-control message created for browser signature."),
      ],
      eventId: policy.policyId,
      policyHash,
      nonce,
      expiresAt,
      message,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/proof") {
    const body = await readJson(request);
    const proofMode = body.proofMode ?? "fixture-qualified";
    const applicantSecret = body.applicantSecret ?? crypto.randomUUID();

    let result;
    if (proofMode === "reclaim-live") {
      result = await requestReclaimEthHolderProof({
        policy: body.policy,
        walletAddress: body.walletAddress,
        walletSignature: body.walletSignature,
        walletMessage: body.walletMessage,
        applicantSecret,
        expiresAt: body.expiresAt,
      });
    } else {
      const balanceHex = proofMode === "fixture-rejected" ? "0x0" : "0x1";
      result = await requestReclaimEthHolderProof({
        policy: body.policy,
        walletAddress: body.walletAddress,
        walletSignature: body.walletSignature,
        walletMessage: body.walletMessage,
        applicantSecret,
        expiresAt: body.expiresAt,
        reclaimClient: fakeReclaimClient(balanceHex),
      });
    }

    assertPublicProofSafe(result.applicantProof, {
      forbiddenValues: [body.walletAddress, body.walletSignature],
    });
    assertPublicProofSafe(result.publicProofMeta, {
      forbiddenValues: [body.walletAddress, body.walletSignature],
    });

    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("server_version", APP_VERSION),
        logEntry("wallet_signature_check", "Source wallet control signature verified transiently."),
        logEntry(
          proofMode === "reclaim-live" ? "reclaim_zktls_proof" : "fixture_zktls_proof",
          proofMode === "reclaim-live"
            ? "Reclaim zkFetch proof generated and redacted."
            : "Fixture zkTLS-shaped proof generated for local testing.",
        ),
        logEntry("privacy_guard", "Public proof output passed no-wallet/no-balance leak checks."),
      ],
      proofMode,
      applicantProof: result.applicantProof,
      publicProofMeta: result.publicProofMeta,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/verify") {
    const body = await readJson(request);
    const now = body.now ?? new Date().toISOString();
    const verification = verifyApplicantProof({
      policyDraft: body.policy,
      applicantProof: body.applicantProof,
      now,
    });
    const memoryMode = body.memoryMode === "0g-storage-live" ? "0g-compute-live" : "dry-run";
    const execution = executePassIssuance({
      policyDraft: body.policy,
      verificationResult: verification.result,
      mode: memoryMode,
      now,
    });
    let memory;
    let memoryUploadError = null;
    try {
      memory = await write0GMemory({
        policyDraft: body.policy,
        computeReceipt: body.computeReceipt,
        applicantProof: body.applicantProof,
        publicProofMeta: body.publicProofMeta,
        verificationResult: verification.result,
        executionReceipt: execution.executionReceipt,
        mode: memoryMode,
        now,
      });
    } catch (error) {
      if (body.memoryMode !== "0g-storage-live") {
        throw error;
      }

      memoryUploadError = formatStorageError(error);
      memory = {
        tool: "write0GMemory",
        mode: "0g-storage-live",
        status: "FAILED",
        retryable: true,
        error: memoryUploadError,
        auditRecord: {
          eventId: body.policy?.policyId,
          policyHash: body.applicantProof?.policyHash,
          proofHash: body.applicantProof?.proof?.proofHash,
          eventNullifier: body.applicantProof?.antiSybil?.eventNullifier,
          verifier: {
            verifierVersion: verification.verifier,
            result: verification.result.result,
            reasonCode: verification.result.reasonCode,
          },
          storage: {
            provider: "0G",
            pointer: null,
          },
          createdAt: now,
        },
      };
    }

    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("deterministic_verifier", `Verifier returned ${verification.result.reasonCode}.`),
        logEntry("execution", `KeeperHub execution status: ${execution.executionReceipt.status}.`),
        memoryUploadError
          ? logEntry("0g_storage_memory_failed", memoryUploadError)
          : logEntry(
            body.memoryMode === "0g-storage-live" ? "0g_storage_memory" : "local_audit_memory",
            body.memoryMode === "0g-storage-live"
              ? "Audit memory uploaded to 0G Storage."
              : "Audit memory prepared locally without network upload.",
          ),
      ],
      verification,
      execution,
      memory,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/ens/identity") {
    const body = await readJson(request);
    const payload = buildEnsPayloadForRequest(body, request);
    const resolver = createEnsResolverAdapter();
    const [agent, event] = await Promise.all([
      resolver.resolveIdentity({ name: payload.agentName }),
      resolver.resolveIdentity({ name: payload.eventName }),
    ]);
    const alignment = event.exists
      ? validateEnsRecordAlignment({ payload, resolvedTextRecords: event.textRecords })
      : [];

    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("ens_identity_plan", `Event ENS identity prepared: ${payload.eventName}.`),
        logEntry(
          event.exists ? "ens_event_resolved" : "ens_event_unresolved",
          event.exists ? "Event ENS resolver records loaded." : "Event ENS resolver is not configured yet.",
        ),
      ],
      payload,
      resolved: {
        agent,
        event,
      },
      alignment,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/ens/publish") {
    const body = await readJson(request);
    const payload = buildEnsPayloadForRequest(body, request);
    const published = await publishEnsTextRecords({
      name: payload.eventName,
      records: payload.textRecords,
    });
    const resolver = createEnsResolverAdapter();
    const [agent, event] = await Promise.all([
      resolver.resolveIdentity({ name: payload.agentName }),
      resolver.resolveIdentity({ name: payload.eventName }),
    ]);
    const alignment = event.exists
      ? validateEnsRecordAlignment({ payload, resolvedTextRecords: event.textRecords })
      : [];
    const aligned = alignment.length > 0 && alignment.every((check) => check.matches);

    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("ens_identity_plan", `Event ENS identity prepared: ${payload.eventName}.`),
        logEntry(
          "ens_event_published",
          `Published ${published.txs.length} ENS text records${published.multicall ? " in one multicall" : ""}.`,
        ),
        logEntry("ens_event_resolved", "Event ENS resolver records loaded after publish."),
        logEntry(
          aligned ? "ens_alignment_ok" : "ens_alignment_mismatch",
          aligned
            ? "ENS records match the current workflow result."
            : "ENS records still differ from the current workflow result.",
        ),
      ],
      payload,
      published,
      resolved: {
        agent,
        event,
      },
      alignment,
    });
    return;
  }

  sendJson(response, 404, { ok: false, error: "API route not found" });
}

async function serveStatic(request, response) {
  if (request.method !== "GET" && request.method !== "HEAD") {
    sendText(response, 405, "Method Not Allowed");
    return;
  }

  const url = new URL(request.url, `http://${request.headers.host ?? "localhost"}`);
  const pathname = url.pathname === "/" ? "/index.html" : url.pathname;
  const target = normalize(join(PUBLIC_ROOT, pathname));
  if (!target.startsWith(PUBLIC_ROOT)) {
    sendText(response, 403, "Forbidden");
    return;
  }

  try {
    const data = await readFile(target);
    response.writeHead(200, {
      "Content-Type": CONTENT_TYPES[extname(target)] ?? "application/octet-stream",
      "Cache-Control": "no-store",
    });
    if (request.method !== "HEAD") {
      response.end(data);
    } else {
      response.end();
    }
  } catch {
    sendText(response, 404, "Not Found");
  }
}

async function readJson(request) {
  let raw = "";
  for await (const chunk of request) {
    raw += chunk;
    if (raw.length > MAX_BODY_BYTES) {
      throw new Error("request body too large");
    }
  }
  if (raw.length === 0) {
    return {};
  }
  return JSON.parse(raw);
}

function sendJson(response, statusCode, payload) {
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(payload, null, 2));
}

function sendText(response, statusCode, text) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(text);
}

function logEntry(step, message) {
  return {
    at: new Date().toISOString(),
    step,
    message,
  };
}

function formatStorageError(error) {
  const message = error instanceof Error ? error.message : String(error);
  if (/timed out/i.test(message) || /Waiting for storage node to sync/i.test(message)) {
    return `${message}. Verifier and execution planning completed; retry the 0G Storage write when the indexer catches up, or switch memory mode to dry-run for local UI testing.`;
  }
  if (/socket disconnected|TLS connection|ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(message)) {
    return `${message}. Verifier and execution planning completed; this is a 0G Storage network/indexer connection failure, not a policy verification failure.`;
  }
  return message;
}

function buildEnsPayloadForRequest(body, request) {
  const agentName = body.agentName ?? process.env.ENS_AGENT_NAME ?? "verigate-agent.eth";
  const appUrl = body.appUrl ?? `http://${request.headers.host ?? `localhost:${PORT}`}`;
  const manifestRoot = body.memory?.manifestPointer?.rootHash;
  const auditPointer = body.auditPointer
    ?? (manifestRoot ? `0G://${manifestRoot}` : undefined)
    ?? body.memory?.auditRecord?.storage?.pointer;

  return buildEnsIdentityPayload({
    policy: body.policy,
    verificationResult: body.verificationResult,
    agentName,
    auditPointer,
    appUrl,
    passContract: body.passContract,
    verifierAddress: body.verifierAddress ?? body.policy?.organizer,
  });
}

function fakeReclaimClient(balanceHex) {
  return {
    async zkFetch() {
      return {
        identifier: "reclaim-proof-fixture",
        claimData: {
          provider: "reclaim",
        },
        signatures: ["fixture-signature-redacted"],
        witnesses: [{ id: "fixture-witness" }],
        extractedParameterValues: {
          balanceHex,
        },
      };
    },
  };
}
