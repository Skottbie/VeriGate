import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, isAbsolute, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

import dotenv from "dotenv";
import { ethers } from "ethers";

import {
  createPolicyFromIntent,
  executePassIssuance,
  generatePrivacyPlan,
  validatePolicy,
  verifyApplicantProof,
  write0GMemory,
  writePassExecutionMemory,
} from "./agent/tools.js";
import {
  assertPublicProofSafe,
  buildWalletControlMessage,
  buildEnsIdentityPayload,
  buildGateAgentIntelligentData,
  buildGateAgentMetadata,
  buildGateAgentTransferProof,
  createEnsResolverAdapter,
  encryptGateAgentMetadata,
  executePassIssuanceOnchain,
  GATE_AGENT_INFT_ABI,
  GATE_AGENT_VERSION,
  hashPolicy,
  publishEnsTextRecords,
  rootFromPointer,
  requestReclaimEthHolderProof,
  validateEnsRecordAlignment,
} from "../src/index.js";
import { create0GStorageAdapter, createEventMemoryNamespace } from "../src/ogStorage.js";

dotenv.config({ quiet: true });

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PUBLIC_ROOT = join(ROOT, "public");
const VENDOR_ROOT = join(ROOT, "node_modules");
const PORT = Number(process.env.VERIGATE_WEB_PORT ?? 4173);
const MAX_BODY_BYTES = 1024 * 1024;
const APP_VERSION = "p9-real-erc7857-gate-agent";

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
        keeperHubApiKey: Boolean(process.env.KH_API_KEY),
        gateAgentDeployment: await hasGateAgentDeployment(),
      },
      modes: {
        policy: ["dry-run", "0g-compute-live"],
        proof: ["fixture-qualified", "fixture-rejected", "reclaim-live"],
        memory: ["dry-run", "0g-storage-live"],
        passExecution: ["dry-run", "direct-live", "keeperhub-live"],
        gateAgent: ["0g-live"],
      },
      ens: {
        agentName: process.env.ENS_AGENT_NAME ?? "verigate-agent.eth",
        network: "sepolia",
      },
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/pass/execute") {
    const body = await readJson(request);
    const mode = body.executionMode ?? "direct-live";
    const result = await executePassIssuanceOnchain({
      policy: body.policy,
      applicantProof: body.applicantProof,
      verificationResult: body.verificationResult,
      recipientAddress: body.recipientAddress,
      sourceWalletAddress: body.sourceWalletAddress,
      memory: body.memory,
      mode,
    });
    let memoryUpdate = null;
    let memoryUpdateError = null;
    if (body.memory?.mode === "0g-storage-live") {
      try {
        memoryUpdate = await writePassExecutionMemory({
          policyDraft: body.policy,
          executionReceipt: result.executionReceipt,
          mode: "0g-compute-live",
        });
      } catch (error) {
        memoryUpdateError = formatStorageError(error);
        memoryUpdate = {
          tool: "writePassExecutionMemory",
          mode: "0g-storage-live",
          status: "FAILED",
          retryable: true,
          error: memoryUpdateError,
        };
      }
    }

    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("fresh_pass_wallet", "Fresh pass recipient accepted; private key stayed in the browser."),
        logEntry("chain_receipt", `Verifier receipt prepared for ${result.plan.receiptId}.`),
        logEntry(
          mode === "keeperhub-live" ? "keeperhub_execution" : "direct_execution",
          result.executionReceipt.status === "MINTED"
            ? `Pass minted to fresh recipient: ${result.executionReceipt.txHash}.`
            : `Pass execution status: ${result.executionReceipt.status}.${formatExecutionError(result.executionReceipt.error)}`,
        ),
        memoryUpdate
          ? logEntry(
            memoryUpdateError ? "pass_execution_memory_failed" : "pass_execution_memory",
            memoryUpdateError ?? "Pass execution receipt written to 0G Storage.",
          )
          : logEntry("pass_execution_memory", "Pass execution receipt kept local because audit memory is not live."),
      ],
      execution: result,
      memoryUpdate,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/gate-agent/mint") {
    const body = await readJson(request);
    const result = await mintGateAgentINFT(body);
    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("gate_agent_metadata", "Encrypted GateAgent intelligence uploaded to 0G Storage."),
        logEntry("gate_agent_mint", `GateAgent iNFT minted on 0G Galileo: token ${result.tokenId}.`),
        logEntry("gate_agent_authorization", "Initial executor authorization is bound to the GateAgent token."),
      ],
      result,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/gate-agent/transfer") {
    const body = await readJson(request);
    const result = await transferGateAgentINFT(body);
    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("gate_agent_transfer_metadata", "New encrypted GateAgent transfer metadata uploaded to 0G Storage."),
        logEntry("gate_agent_itransfer", `iTransfer completed: ${result.txHash}.`),
      ],
      result,
    });
    return;
  }

  if (request.method === "POST" && url.pathname === "/api/gate-agent/clone") {
    const body = await readJson(request);
    const result = await cloneGateAgentINFT(body);
    sendJson(response, 200, {
      ok: true,
      logs: [
        logEntry("gate_agent_clone_metadata", "Cloned encrypted GateAgent metadata uploaded to 0G Storage."),
        logEntry("gate_agent_iclone", `iClone completed: token ${result.newTokenId}.`),
      ],
      result,
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
    const payload = await buildEnsPayloadForRequest(body, request);
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
    const payload = await buildEnsPayloadForRequest(body, request);
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
  if (url.pathname === "/vendor/ethers.umd.min.js") {
    const data = await readFile(join(VENDOR_ROOT, "ethers", "dist", "ethers.umd.min.js"));
    response.writeHead(200, {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "no-store",
    });
    if (request.method !== "HEAD") {
      response.end(data);
    } else {
      response.end();
    }
    return;
  }

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

function formatExecutionError(error) {
  if (!error) {
    return "";
  }
  const compact = String(error).replace(/\s+/g, " ").trim();
  const summary = compact.length > 240 ? `${compact.slice(0, 237)}...` : compact;
  return ` Error: ${summary}`;
}

async function buildEnsPayloadForRequest(body, request) {
  const agentName = body.agentName ?? process.env.ENS_AGENT_NAME ?? "verigate-agent.eth";
  const appUrl = body.appUrl ?? `http://${request.headers.host ?? `localhost:${PORT}`}`;
  const manifestRoot = body.memory?.manifestPointer?.rootHash;
  const auditPointer = body.auditPointer
    ?? (manifestRoot ? `0G://${manifestRoot}` : undefined)
    ?? body.memory?.auditRecord?.storage?.pointer;
  const passContract = body.passContract ?? await resolvePassContractForEns();

  return buildEnsIdentityPayload({
    policy: body.policy,
    verificationResult: body.verificationResult,
    agentName,
    auditPointer,
    appUrl,
    passContract,
    verifierAddress: body.verifierAddress ?? body.policy?.organizer,
    agentVersion: APP_VERSION,
  });
}

async function resolvePassContractForEns() {
  if (process.env.KH_PASS_CONTRACT) {
    return process.env.KH_PASS_CONTRACT;
  }
  const deploymentPath = process.env.KH_DEPLOYMENT_PATH ?? "deployments/sepolia/addresses.json";
  const target = isAbsolute(deploymentPath) ? deploymentPath : join(ROOT, deploymentPath);
  try {
    const deployment = JSON.parse(await readFile(target, "utf8"));
    return deployment?.contracts?.EventPassSBT ?? "pending:phase-8-pass-contract";
  } catch {
    return "pending:phase-8-pass-contract";
  }
}

async function mintGateAgentINFT(body) {
  if (!body.policy || !body.memory) {
    throw new Error("policy and live memory are required before minting a GateAgent iNFT");
  }
  const { wallet, contract, deployment } = await createGateAgentContext();
  const policyHash = hashPolicy(body.policy);
  const metadata = buildGateAgentMetadata({
    policy: body.policy,
    memory: body.memory,
    passExecution: body.passExecution,
    ens: body.ens,
    authorizedExecutors: resolveInitialGateAgentExecutors(body, wallet.address),
    agentVersion: GATE_AGENT_VERSION,
  });
  const encrypted = encryptGateAgentMetadata(metadata);
  const metadataPointer = await uploadGateAgentObject({
    policy: body.policy,
    kind: "gate-agent-metadata",
    object: encrypted.envelope,
  });
  const encryptedMetadataURI = `0G://${metadataPointer.rootHash}`;
  const intelligentData = buildGateAgentIntelligentData({
    policy: body.policy,
    memory: body.memory,
    executionPolicy: body.policy.execution,
  });
  const memoryRoot = rootFromPointer(metadata.memory.pointer) ?? encrypted.envelopeHash;
  const eventId = ethers.keccak256(ethers.toUtf8Bytes(
    `verigate:gate-agent:event:v1:${body.policy.policyId}:${policyHash}`,
  ));
  const owner = body.ownerAddress && ethers.isAddress(body.ownerAddress)
    ? ethers.getAddress(body.ownerAddress)
    : wallet.address;
  const executors = resolveInitialGateAgentExecutors(body, wallet.address);
  const tx = await contract.mintGateAgent(
    owner,
    eventId,
    policyHash,
    memoryRoot,
    encryptedMetadataURI,
    intelligentData,
    executors,
  );
  const receipt = await tx.wait();
  const minted = parseGateAgentMinted(contract, receipt);
  const tokenId = minted?.tokenId?.toString?.() ?? "1";
  const record = await contract.gateAgentRecord(tokenId);

  return {
    tool: "mintGateAgentINFT",
    network: deployment.network,
    chainId: deployment.chainId,
    contract: deployment.contracts.GateAgentINFT,
    verifier: deployment.contracts.GateAgentDataVerifier,
    txHash: tx.hash,
    explorerUrl: build0GExplorerTxUrl(tx.hash),
    tokenId,
    owner,
    eventId,
    policyHash,
    memoryRoot,
    encryptedMetadataURI,
    metadataPointer,
    dataRoot: record.dataRoot,
    intelligentData,
    authorizedExecutors: executors,
    withheld: ["gate agent metadata encryption key", "raw policy intelligence plaintext"],
  };
}

async function transferGateAgentINFT(body) {
  return mutateGateAgentINFT({ ...body, operation: "transfer" });
}

async function cloneGateAgentINFT(body) {
  return mutateGateAgentINFT({ ...body, operation: "clone" });
}

async function mutateGateAgentINFT(body) {
  if (!body.policy || !body.memory || !body.gateAgent?.tokenId) {
    throw new Error("policy, memory, and gateAgent token are required");
  }
  const { wallet, contract, deployment } = await createGateAgentContext();
  const tokenId = BigInt(body.gateAgent.tokenId);
  const owner = await contract.ownerOf(tokenId);
  if (owner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`GateAgent token ${tokenId} is owned by ${owner}; connect or fund that owner before ${body.operation}`);
  }
  const record = await contract.gateAgentRecord(tokenId);
  const currentMetadataURI = await contract.encryptedMetadataURIOf(tokenId);
  const recipient = body.recipientAddress && ethers.isAddress(body.recipientAddress)
    ? ethers.getAddress(body.recipientAddress)
    : wallet.address;
  const metadata = {
    ...buildGateAgentMetadata({
      policy: body.policy,
      memory: body.memory,
      passExecution: body.passExecution,
      ens: body.ens,
      authorizedExecutors: body.gateAgent.authorizedExecutors ?? [wallet.address],
      agentVersion: GATE_AGENT_VERSION,
    }),
    lifecycle: {
      operation: body.operation,
      sourceTokenId: tokenId.toString(),
      previousMetadataURI: currentMetadataURI,
    },
  };
  const encrypted = encryptGateAgentMetadata(metadata);
  const metadataPointer = await uploadGateAgentObject({
    policy: body.policy,
    kind: `gate-agent-${body.operation}-metadata`,
    object: encrypted.envelope,
  });
  const newMetadataURI = `0G://${metadataPointer.rootHash}`;
  const intelligentData = buildGateAgentIntelligentData({
    policy: body.policy,
    memory: body.memory,
    executionPolicy: body.policy.execution,
    agentProfile: {
      name: "VeriGate Agent",
      version: GATE_AGENT_VERSION,
      lifecycle: body.operation,
      sourceTokenId: tokenId.toString(),
    },
  });
  const expiresAt = Math.floor(Date.now() / 1000) + 3600;
  const proof = await buildGateAgentTransferProof({
    signer: wallet,
    oldDataHash: record.dataRoot,
    oldMetadataURI: currentMetadataURI,
    newMetadataURI,
    data: intelligentData,
    from: owner,
    to: recipient,
    tokenId,
    expiresAt,
    nonce: ethers.keccak256(ethers.toUtf8Bytes(
      `verigate:gate-agent:${body.operation}:${tokenId}:${newMetadataURI}:${Date.now()}`,
    )),
    attestationURI: `0G://${metadataPointer.rootHash}`,
  });
  const solidityProof = {
    accessProof: proof.accessProof,
    ownershipProof: proof.ownershipProof,
  };
  const tx = body.operation === "clone"
    ? await contract.iClone(recipient, tokenId, [solidityProof])
    : await contract.iTransfer(recipient, tokenId, [solidityProof]);
  const receipt = await tx.wait();
  const cloned = body.operation === "clone" ? parseGateAgentCloned(contract, receipt) : null;

  return {
    tool: body.operation === "clone" ? "cloneGateAgentINFT" : "transferGateAgentINFT",
    network: deployment.network,
    chainId: deployment.chainId,
    contract: deployment.contracts.GateAgentINFT,
    tokenId: tokenId.toString(),
    newTokenId: cloned?.newTokenId?.toString?.(),
    recipient,
    txHash: tx.hash,
    explorerUrl: build0GExplorerTxUrl(tx.hash),
    oldDataHash: record.dataRoot,
    newDataHash: proof.receipt.newDataHash,
    oldMetadataURI: currentMetadataURI,
    newMetadataURI,
    metadataPointer,
    transferReceipt: {
      oldDataHash: proof.receipt.oldDataHash,
      newDataHash: proof.receipt.newDataHash,
      expiresAt: proof.receipt.expiresAt,
      nonce: proof.receipt.nonce,
      attestationURI: proof.receipt.attestationURI,
    },
    withheld: ["gate agent metadata encryption key", "attestor private key"],
  };
}

async function createGateAgentContext() {
  const deployment = await readDeploymentJson("deployments/0g-galileo/addresses.json");
  if (!deployment?.contracts?.GateAgentINFT || !deployment?.contracts?.GateAgentDataVerifier) {
    throw new Error("GateAgent contracts are not deployed yet; run npm run deploy:gate-agent first");
  }
  if (!process.env.OG_RPC_URL || !process.env.OG_PRIVATE_KEY) {
    throw new Error("OG_RPC_URL and OG_PRIVATE_KEY are required for GateAgent iNFT execution");
  }
  const provider = new ethers.JsonRpcProvider(process.env.OG_RPC_URL);
  const wallet = new ethers.Wallet(process.env.OG_PRIVATE_KEY, provider);
  const contract = new ethers.Contract(deployment.contracts.GateAgentINFT, GATE_AGENT_INFT_ABI, wallet);
  return { deployment, provider, wallet, contract };
}

async function uploadGateAgentObject({ policy, kind, object }) {
  const adapter = create0GStorageAdapter();
  const eventId = policy.policyId;
  return adapter.uploadJson({
    eventId,
    namespace: createEventMemoryNamespace(eventId),
    kind,
    object,
  });
}

async function readDeploymentJson(relativePath) {
  const target = join(ROOT, relativePath);
  return JSON.parse(await readFile(target, "utf8"));
}

async function hasGateAgentDeployment() {
  try {
    const deployment = await readDeploymentJson("deployments/0g-galileo/addresses.json");
    return Boolean(deployment?.contracts?.GateAgentINFT && deployment?.contracts?.GateAgentDataVerifier);
  } catch {
    return false;
  }
}

function resolveInitialGateAgentExecutors(body, fallback) {
  const candidates = [
    body.executorAddress,
    body.policy?.organizer,
    fallback,
  ].filter((address) => typeof address === "string" && ethers.isAddress(address));
  return [...new Set(candidates.map((address) => ethers.getAddress(address)))];
}

function parseGateAgentMinted(contract, receipt) {
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "GateAgentMinted") {
        return {
          tokenId: parsed.args.tokenId,
          owner: parsed.args.owner,
          eventId: parsed.args.eventId,
        };
      }
    } catch {
      // Ignore logs from other contracts.
    }
  }
  return null;
}

function parseGateAgentCloned(contract, receipt) {
  for (const log of receipt.logs ?? []) {
    try {
      const parsed = contract.interface.parseLog(log);
      if (parsed?.name === "Cloned") {
        return {
          tokenId: parsed.args.tokenId,
          newTokenId: parsed.args.newTokenId,
        };
      }
    } catch {
      // Ignore logs from other contracts.
    }
  }
  return null;
}

function build0GExplorerTxUrl(txHash) {
  return `https://chainscan-galileo.0g.ai/tx/${txHash}`;
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
