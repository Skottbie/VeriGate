const state = {
  policy: null,
  computeReceipt: null,
  applicantProof: null,
  publicProofMeta: null,
  verification: null,
  memory: null,
  passExecution: null,
  ens: null,
  gateAgent: null,
  walletAddress: null,
  passWalletAddress: null,
  passWalletPrivateKey: null,
  walletMessage: null,
  walletSignature: null,
  expiresAt: null,
};

const els = {
  envStatus: document.querySelector("#envStatus"),
  organizerIntent: document.querySelector("#organizerIntent"),
  policyMode: document.querySelector("#policyMode"),
  proofMode: document.querySelector("#proofMode"),
  memoryMode: document.querySelector("#memoryMode"),
  executionMode: document.querySelector("#executionMode"),
  agentEnsName: document.querySelector("#agentEnsName"),
  compilePolicy: document.querySelector("#compilePolicy"),
  connectWallet: document.querySelector("#connectWallet"),
  signMessage: document.querySelector("#signMessage"),
  generateProof: document.querySelector("#generateProof"),
  verifyFlow: document.querySelector("#verifyFlow"),
  generatePassWallet: document.querySelector("#generatePassWallet"),
  executePass: document.querySelector("#executePass"),
  publishEns: document.querySelector("#publishEns"),
  resolveEns: document.querySelector("#resolveEns"),
  mintGateAgent: document.querySelector("#mintGateAgent"),
  cloneGateAgent: document.querySelector("#cloneGateAgent"),
  transferGateAgent: document.querySelector("#transferGateAgent"),
  walletState: document.querySelector("#walletState"),
  passWalletState: document.querySelector("#passWalletState"),
  clearLogs: document.querySelector("#clearLogs"),
  logList: document.querySelector("#logList"),
  policyJson: document.querySelector("#policyJson"),
  proofJson: document.querySelector("#proofJson"),
  resultJson: document.querySelector("#resultJson"),
  ensJson: document.querySelector("#ensJson"),
  gateAgentJson: document.querySelector("#gateAgentJson"),
  policyMetric: document.querySelector("#policyMetric"),
  proofMetric: document.querySelector("#proofMetric"),
  verifierMetric: document.querySelector("#verifierMetric"),
  executionMetric: document.querySelector("#executionMetric"),
  ensMetric: document.querySelector("#ensMetric"),
  passMetric: document.querySelector("#passMetric"),
  gateAgentMetric: document.querySelector("#gateAgentMetric"),
};

boot();

function boot() {
  els.compilePolicy.addEventListener("click", compilePolicy);
  els.connectWallet.addEventListener("click", connectWallet);
  els.signMessage.addEventListener("click", signControlMessage);
  els.generateProof.addEventListener("click", generateProof);
  els.verifyFlow.addEventListener("click", verifyFlow);
  els.generatePassWallet.addEventListener("click", generatePassWallet);
  els.executePass.addEventListener("click", executePassMint);
  els.publishEns.addEventListener("click", publishEnsIdentity);
  els.resolveEns.addEventListener("click", resolveEnsIdentity);
  els.mintGateAgent.addEventListener("click", mintGateAgent);
  els.cloneGateAgent.addEventListener("click", cloneGateAgent);
  els.transferGateAgent.addEventListener("click", transferGateAgent);
  els.clearLogs.addEventListener("click", () => {
    els.logList.innerHTML = "";
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".json-panel").forEach((panel) => panel.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`#${tab.dataset.panel}`).classList.add("active");
    });
  });

  refreshStatus();
  writeLog("ready", "Test console loaded. Compile a policy first.");
}

async function refreshStatus() {
  try {
    const status = await apiGet("/api/status");
    const env = status.env;
    const ready = [
      env.ogRpcUrl,
      env.ogPrivateKey,
      env.ogComputeProviderAddress,
      env.reclaimAppId,
      env.reclaimAppSecret,
      env.ensPublishKey,
      env.keeperHubApiKey,
      env.gateAgentDeployment,
    ].filter(Boolean).length;
    els.envStatus.innerHTML = `<span class="${ready === 8 ? "ok" : "warn"}">${ready}/8 live env vars present</span><br>${escapeHtml(status.version ?? "unknown")}`;
  } catch (error) {
    els.envStatus.innerHTML = `<span class="bad">${escapeHtml(error.message)}</span>`;
  }
}

async function compilePolicy() {
  await withBusy(els.compilePolicy, async () => {
    if (!state.walletAddress) {
      await connectWallet();
    }
    if (!state.walletAddress) {
      writeLog("organizer_wallet", "Organizer wallet is required before policy compilation.");
      return;
    }
    const result = await apiPost("/api/policy", {
      organizerIntent: els.organizerIntent.value,
      policyMode: els.policyMode.value,
      organizerAddress: state.walletAddress,
    });
    state.policy = result.review.policy;
    state.computeReceipt = result.compute.computeReceipt;
    state.applicantProof = null;
    state.publicProofMeta = null;
    state.verification = null;
    state.memory = null;
    state.passExecution = null;
    state.ens = null;
    state.gateAgent = null;
    state.passWalletAddress = null;
    state.passWalletPrivateKey = null;
    state.walletMessage = null;
    state.walletSignature = null;
    state.expiresAt = null;
    writeLogs(result.logs);
    writeLog("organizer_wallet", "Organizer address was injected from the connected wallet.");
    setJson(els.policyJson, {
      rawOutput: result.compute.rawOutput,
      policy: result.review.policy,
      policyHash: result.review.policyHash,
      computeReceipt: result.compute.computeReceipt,
      computeMetadata: result.compute.metadata,
      privacyPlan: result.privacyPlan,
    });
    setJson(els.proofJson, {});
    setJson(els.resultJson, {});
    setJson(els.ensJson, {});
    setJson(els.gateAgentJson, {});
    els.policyMetric.textContent = shortHash(result.review.policyHash);
    els.proofMetric.textContent = "Pending";
    els.verifierMetric.textContent = "Pending";
    els.executionMetric.textContent = "Pending";
    els.ensMetric.textContent = "Pending";
    els.passMetric.textContent = "Pending";
    els.gateAgentMetric.textContent = "Pending";
    els.passWalletState.textContent = "No pass wallet generated";
  });
}

async function connectWallet() {
  if (!window.ethereum) {
    writeLog("wallet", "No browser wallet provider found.");
    return;
  }
  await withBusy(els.connectWallet, async () => {
    const accounts = await window.ethereum.request({ method: "eth_requestAccounts" });
    state.walletAddress = accounts?.[0] ?? null;
    state.walletMessage = null;
    state.walletSignature = null;
    els.walletState.textContent = state.walletAddress
      ? `Connected ${maskAddress(state.walletAddress)}`
      : "No wallet connected";
    writeLog("wallet_connect", state.walletAddress ? "Source wallet connected locally." : "Wallet connection returned no account.");
  });
}

async function signControlMessage() {
  if (!state.policy) {
    writeLog("wallet_sign", "Compile a policy before signing.");
    return;
  }
  if (!state.walletAddress) {
    await connectWallet();
  }
  if (!state.walletAddress) {
    return;
  }

  await withBusy(els.signMessage, async () => {
    const payload = await apiPost("/api/signing-message", {
      policy: state.policy,
    });
    state.walletMessage = payload.message;
    state.expiresAt = payload.expiresAt;
    state.walletSignature = await window.ethereum.request({
      method: "personal_sign",
      params: [payload.message, state.walletAddress],
    });
    writeLogs(payload.logs);
    writeLog("wallet_sign", "Wallet-control signature captured in browser session.");
    els.walletState.textContent = `Signed ${maskAddress(state.walletAddress)}`;
  });
}

async function generateProof() {
  if (!state.policy) {
    writeLog("proof", "Compile a policy first.");
    return;
  }
  if (!state.walletSignature) {
    await signControlMessage();
  }
  if (!state.walletSignature) {
    return;
  }

  await withBusy(els.generateProof, async () => {
    const result = await apiPost("/api/proof", {
      policy: state.policy,
      proofMode: els.proofMode.value,
      walletAddress: state.walletAddress,
      walletMessage: state.walletMessage,
      walletSignature: state.walletSignature,
      expiresAt: state.expiresAt,
    });
    state.applicantProof = result.applicantProof;
    state.publicProofMeta = result.publicProofMeta;
    writeLogs(result.logs);
    setJson(els.proofJson, {
      proofMode: result.proofMode,
      applicantProof: result.applicantProof,
      publicProofMeta: result.publicProofMeta,
      withheld: [
        "source wallet plaintext",
        "wallet signature",
        "wallet-control message",
        "raw Reclaim proof",
        "exact ETH balance",
        "request headers/body",
      ],
    });
    els.proofMetric.textContent = result.applicantProof.claims.aggregatedExposureTier;
  });
}

async function verifyFlow() {
  if (!state.policy || !state.applicantProof) {
    writeLog("verify", "Generate a proof before verification.");
    return;
  }

  await withBusy(els.verifyFlow, async () => {
    const result = await apiPost("/api/verify", {
      policy: state.policy,
      computeReceipt: state.computeReceipt,
      applicantProof: state.applicantProof,
      publicProofMeta: state.publicProofMeta,
      memoryMode: els.memoryMode.value,
    });
    writeLogs(result.logs);
    setJson(els.resultJson, result);
    state.verification = result.verification.result;
    state.memory = result.memory;
    els.verifierMetric.textContent = result.verification.result.reasonCode;
    els.verifierMetric.className = result.verification.result.approved ? "ok" : "bad";
    els.executionMetric.textContent = result.execution.executionReceipt.status;
  });
}

async function generatePassWallet() {
  await withBusy(els.generatePassWallet, async () => {
    if (!window.ethers?.Wallet) {
      writeLog("fresh_pass_wallet", "Ethers browser bundle is not loaded.");
      return;
    }
    const wallet = window.ethers.Wallet.createRandom();
    state.passWalletAddress = wallet.address;
    state.passWalletPrivateKey = wallet.privateKey;
    els.passWalletState.textContent = `Fresh recipient ${maskAddress(wallet.address)}`;
    writeLog("fresh_pass_wallet", "Fresh pass wallet generated locally; private key was not sent to the server.");
  });
}

async function executePassMint() {
  if (!state.policy || !state.applicantProof || !state.verification || !state.memory) {
    writeLog("pass_execution", "Verify and write memory before minting a pass.");
    return;
  }
  if (!state.verification.approved) {
    writeLog("pass_execution", "Rejected proofs cannot trigger pass minting.");
    return;
  }
  if (!state.passWalletAddress) {
    await generatePassWallet();
  }
  if (!state.passWalletAddress) {
    return;
  }
  if (state.walletAddress && state.passWalletAddress.toLowerCase() === state.walletAddress.toLowerCase()) {
    writeLog("pass_execution", "Fresh pass wallet must differ from the source ETH holder wallet.");
    return;
  }

  await withBusy(els.executePass, async () => {
    const result = await apiPost("/api/pass/execute", {
      policy: state.policy,
      applicantProof: state.applicantProof,
      verificationResult: state.verification,
      memory: state.memory,
      recipientAddress: state.passWalletAddress,
      sourceWalletAddress: state.walletAddress,
      executionMode: els.executionMode.value,
    });
    state.passExecution = result.execution;
    writeLogs(result.logs);
    setJson(els.resultJson, {
      verification: state.verification,
      memory: state.memory,
      passExecution: result.execution,
      passExecutionMemory: result.memoryUpdate,
    });
    els.executionMetric.textContent = result.execution.executionReceipt.status;
    els.executionMetric.className = result.execution.executionReceipt.status === "MINTED" ? "ok" : "warn";
    els.passMetric.textContent = result.execution.executionReceipt.status;
    els.passMetric.className = result.execution.executionReceipt.status === "MINTED" ? "ok" : "warn";
  });
}

async function resolveEnsIdentity() {
  if (!state.policy) {
    writeLog("ens", "Compile a policy before resolving ENS identity.");
    return;
  }

  await withBusy(els.resolveEns, async () => {
    const result = await apiPost("/api/ens/identity", {
      policy: state.policy,
      verificationResult: state.verification,
      memory: state.memory,
      agentName: els.agentEnsName.value.trim(),
      appUrl: window.location.origin,
    });
    state.ens = result;
    writeLogs(result.logs);
    setJson(els.ensJson, result);
    updateEnsMetric(result);
  });
}

async function publishEnsIdentity() {
  if (!state.policy || !state.verification || !state.memory) {
    writeLog("ens", "Verify and write memory before publishing ENS records.");
    return;
  }

  await withBusy(els.publishEns, async () => {
    const result = await apiPost("/api/ens/publish", {
      policy: state.policy,
      verificationResult: state.verification,
      memory: state.memory,
      agentName: els.agentEnsName.value.trim(),
      appUrl: window.location.origin,
    });
    state.ens = result;
    writeLogs(result.logs);
    setJson(els.ensJson, result);
    updateEnsMetric(result);
  });
}

async function mintGateAgent() {
  if (!state.policy || !state.memory) {
    writeLog("gate_agent", "Verify and write live memory before minting a GateAgent iNFT.");
    return;
  }

  await withBusy(els.mintGateAgent, async () => {
    const result = await apiPost("/api/gate-agent/mint", {
      policy: state.policy,
      memory: state.memory,
      passExecution: state.passExecution,
      ens: state.ens,
      executorAddress: state.walletAddress,
    });
    state.gateAgent = result.result;
    writeLogs(result.logs);
    setJson(els.gateAgentJson, state.gateAgent);
    els.gateAgentMetric.textContent = `Token ${state.gateAgent.tokenId}`;
    els.gateAgentMetric.className = "ok";
  });
}

async function cloneGateAgent() {
  await mutateGateAgent("clone");
}

async function transferGateAgent() {
  await mutateGateAgent("transfer");
}

async function mutateGateAgent(operation) {
  if (!state.gateAgent) {
    writeLog("gate_agent", "Mint a GateAgent iNFT first.");
    return;
  }
  if (!state.passWalletAddress) {
    await generatePassWallet();
  }
  await withBusy(operation === "clone" ? els.cloneGateAgent : els.transferGateAgent, async () => {
    const result = await apiPost(`/api/gate-agent/${operation}`, {
      policy: state.policy,
      memory: state.memory,
      passExecution: state.passExecution,
      ens: state.ens,
      gateAgent: state.gateAgent,
      recipientAddress: state.passWalletAddress,
    });
    writeLogs(result.logs);
    state.gateAgent = {
      ...state.gateAgent,
      lastMutation: result.result,
    };
    if (operation === "transfer") {
      state.gateAgent.owner = result.result.recipient;
    }
    setJson(els.gateAgentJson, state.gateAgent);
    els.gateAgentMetric.textContent = operation === "clone"
      ? `Cloned ${result.result.newTokenId}`
      : "Transferred";
    els.gateAgentMetric.className = "ok";
  });
}

async function apiGet(path) {
  const response = await fetch(path, { cache: "no-store" });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    throw new Error(payload.error ?? `GET ${path} failed`);
  }
  return payload;
}

async function apiPost(path, body) {
  const response = await fetch(path, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const payload = await response.json();
  if (!response.ok || !payload.ok) {
    writeLog("error", payload.error ?? `POST ${path} failed`);
    throw new Error(payload.error ?? `POST ${path} failed`);
  }
  return payload;
}

async function withBusy(button, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Running...";
  try {
    await task();
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function writeLogs(logs = []) {
  logs.forEach((entry) => writeLog(entry.step, entry.message, entry.at));
}

function writeLog(step, message, at = new Date().toISOString()) {
  const item = document.createElement("li");
  item.innerHTML = `
    <div class="log-step"><strong>${escapeHtml(step)}</strong><span>${new Date(at).toLocaleTimeString()}</span></div>
    <p>${escapeHtml(message)}</p>
  `;
  els.logList.prepend(item);
}

function setJson(element, value) {
  element.textContent = JSON.stringify(value, null, 2);
}

function updateEnsMetric(result) {
  const aligned = Array.isArray(result.alignment)
    && result.alignment.length > 0
    && result.alignment.every((check) => check.matches);
  if (aligned) {
    els.ensMetric.textContent = "Aligned";
    els.ensMetric.className = "ok";
  } else if (result.resolved?.event?.exists) {
    els.ensMetric.textContent = "Mismatch";
    els.ensMetric.className = "warn";
  } else {
    els.ensMetric.textContent = "Unconfigured";
    els.ensMetric.className = "warn";
  }
}

function maskAddress(address) {
  if (!address || address.length < 12) {
    return "unknown";
  }
  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

function shortHash(hash) {
  if (!hash || hash.length < 14) {
    return "Ready";
  }
  return `${hash.slice(0, 8)}...${hash.slice(-6)}`;
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
