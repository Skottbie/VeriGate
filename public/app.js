const state = {
  role: "organizer",
  introStep: 0,
  organizerStep: 0,
  attendeeStep: 0,
  eventDraft: {
    eventName: "",
    audience: "",
    requirement: "",
    intent: "",
  },
  policy: null,
  computeReceipt: null,
  applicantProof: null,
  publicProofMeta: null,
  verification: null,
  attestation: null,
  memory: null,
  passExecution: null,
  passExecutionMemory: null,
  ens: null,
  gateAgent: null,
  applications: [],
  walletAddress: null,
  passWalletAddress: null,
  passWalletPrivateKey: null,
  walletMessage: null,
  walletSignature: null,
  expiresAt: null,
};

const els = {
  introDeck: document.querySelector("#introDeck"),
  introSlides: document.querySelectorAll(".intro-slide"),
  introNext: document.querySelector("#introNext"),
  introSkip: document.querySelector("#introSkip"),
  introDots: document.querySelector("#introDots"),
  envStatus: document.querySelector("#envStatus"),
  heroTitle: document.querySelector("#heroTitle"),
  heroCopy: document.querySelector("#heroCopy"),
  stepKicker: document.querySelector("#stepKicker"),
  stepTitle: document.querySelector("#stepTitle"),
  progressFill: document.querySelector("#progressFill"),
  flowStatus: document.querySelector("#flowStatus"),
  eventNameInput: document.querySelector("#eventNameInput"),
  audienceInput: document.querySelector("#audienceInput"),
  requirementInput: document.querySelector("#requirementInput"),
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
  openGateAgentStep: document.querySelector("#openGateAgentStep"),
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
  policyLinks: document.querySelector("#policyLinks"),
  proofLinks: document.querySelector("#proofLinks"),
  resultLinks: document.querySelector("#resultLinks"),
  ensLinks: document.querySelector("#ensLinks"),
  gateAgentLinks: document.querySelector("#gateAgentLinks"),
  policyMetric: document.querySelector("#policyMetric"),
  proofMetric: document.querySelector("#proofMetric"),
  verifierMetric: document.querySelector("#verifierMetric"),
  executionMetric: document.querySelector("#executionMetric"),
  ensMetric: document.querySelector("#ensMetric"),
  passMetric: document.querySelector("#passMetric"),
  gateAgentMetric: document.querySelector("#gateAgentMetric"),
  roleTabs: document.querySelectorAll(".role-tab"),
  roleViews: document.querySelectorAll("[data-role-view]"),
  flowSteps: document.querySelectorAll(".flow-step"),
  evidenceToggle: document.querySelector("#evidenceToggle"),
  evidenceFloat: document.querySelector("#evidenceFloat"),
  evidenceClose: document.querySelector("#evidenceClose"),
  evidenceBackdrop: document.querySelector("#evidenceBackdrop"),
  policySummary: document.querySelector("#policySummary"),
  proofSummary: document.querySelector("#proofSummary"),
  passSummary: document.querySelector("#passSummary"),
  resultTitle: document.querySelector("#resultTitle"),
  inviteTitle: document.querySelector("#inviteTitle"),
  inviteCopy: document.querySelector("#inviteCopy"),
  inviteRequirement: document.querySelector("#inviteRequirement"),
  applicationsList: document.querySelector("#applicationsList"),
  applicationEmpty: document.querySelector("#applicationEmpty"),
  railCompute: document.querySelector("#railCompute"),
  railProof: document.querySelector("#railProof"),
  railStorage: document.querySelector("#railStorage"),
  railKeeper: document.querySelector("#railKeeper"),
  attestationProofMetric: document.querySelector("#attestationProofMetric"),
  attestationProviderMetric: document.querySelector("#attestationProviderMetric"),
  attestationServerMetric: document.querySelector("#attestationServerMetric"),
  bindingStatusMetric: document.querySelector("#bindingStatusMetric"),
  bindingAuditMetric: document.querySelector("#bindingAuditMetric"),
  bindingExecutionMetric: document.querySelector("#bindingExecutionMetric"),
  bindingFieldsMetric: document.querySelector("#bindingFieldsMetric"),
};

boot();

function boot() {
  initIntroDeck();
  syncRoleShell();
  els.compilePolicy.addEventListener("click", compilePolicy);
  els.connectWallet.addEventListener("click", connectWallet);
  els.signMessage.addEventListener("click", signControlMessage);
  els.generateProof.addEventListener("click", generateProof);
  els.verifyFlow.addEventListener("click", verifyFlow);
  els.generatePassWallet.addEventListener("click", generatePassWallet);
  els.executePass.addEventListener("click", executePassMint);
  els.publishEns.addEventListener("click", publishEnsIdentity);
  els.resolveEns.addEventListener("click", resolveEnsIdentity);
  els.openGateAgentStep?.addEventListener("click", () => setStep("organizer", 3));
  els.mintGateAgent.addEventListener("click", mintGateAgent);
  els.cloneGateAgent.addEventListener("click", cloneGateAgent);
  els.transferGateAgent.addEventListener("click", transferGateAgent);
  els.evidenceToggle?.addEventListener("click", openEvidenceRail);
  els.evidenceFloat.addEventListener("click", openEvidenceRail);
  els.evidenceClose.addEventListener("click", closeEvidenceRail);
  els.evidenceBackdrop.addEventListener("click", closeEvidenceRail);
  els.clearLogs.addEventListener("click", () => {
    els.logList.innerHTML = "";
  });

  els.roleTabs.forEach((tab) => {
    tab.addEventListener("click", () => switchRole(tab.dataset.role));
  });

  [els.eventNameInput, els.audienceInput, els.requirementInput, els.organizerIntent].forEach((input) => {
    input.addEventListener("input", () => {
      syncDraftFromInputs();
      updateInviteFromPolicy();
      updateHero();
    });
  });

  document.querySelectorAll(".step-next").forEach((button) => {
    button.addEventListener("click", () => moveStep(button.dataset.role, 1));
  });

  document.querySelectorAll(".step-back").forEach((button) => {
    button.addEventListener("click", () => moveStep(button.dataset.role, -1));
  });

  document.querySelectorAll(".tab").forEach((tab) => {
    tab.addEventListener("click", () => {
      document.querySelectorAll(".tab").forEach((item) => item.classList.remove("active"));
      document.querySelectorAll(".json-panel").forEach((panel) => panel.classList.remove("active"));
      document.querySelectorAll(".record-links").forEach((panel) => panel.classList.remove("active"));
      tab.classList.add("active");
      document.querySelector(`#${tab.dataset.panel}`).classList.add("active");
      document.querySelector(`#${tab.dataset.panel.replace("Json", "Links")}`)?.classList.add("active");
    });
  });

  refreshStatus();
  writeLog("ready", "VeriGate RSVP Studio loaded. Create a gate to begin.");
  renderApplications();
  syncDraftFromInputs();
  updateExternalVerificationLinks();
  updateFlow();
}

function initIntroDeck() {
  if (!els.introDeck) {
    document.body.classList.add("intro-complete");
    return;
  }
  renderIntroDots();
  setIntroStep(0);
  els.introNext?.addEventListener("click", advanceIntro);
  els.introSkip?.addEventListener("click", finishIntro);
  els.introDeck.addEventListener("click", (event) => {
    if (event.target.closest("button, a")) {
      return;
    }
    advanceIntro();
  });
  window.addEventListener("keydown", (event) => {
    if (document.body.classList.contains("intro-complete")) {
      return;
    }
    if (event.key === "Escape") {
      finishIntro();
    } else if (event.key === "ArrowRight" || event.key === " " || event.key === "Enter") {
      event.preventDefault();
      advanceIntro();
    } else if (event.key === "ArrowLeft") {
      event.preventDefault();
      setIntroStep(state.introStep - 1);
    }
  });
}

function renderIntroDots() {
  if (!els.introDots) {
    return;
  }
  els.introDots.innerHTML = Array.from(els.introSlides)
    .map((_, index) => `<button type="button" aria-label="Intro slide ${index + 1}" data-intro-dot="${index}"></button>`)
    .join("");
  els.introDots.querySelectorAll("button").forEach((button) => {
    button.addEventListener("click", () => setIntroStep(Number(button.dataset.introDot)));
  });
}

function setIntroStep(nextStep) {
  const max = Math.max(0, els.introSlides.length - 1);
  state.introStep = Math.max(0, Math.min(max, Number(nextStep) || 0));
  els.introSlides.forEach((slide, index) => {
    slide.classList.toggle("active", index === state.introStep);
  });
  els.introDots?.querySelectorAll("button").forEach((dot, index) => {
    dot.classList.toggle("active", index === state.introStep);
  });
  if (els.introNext) {
    els.introNext.textContent = state.introStep === max ? "Start Demo" : "Continue";
  }
}

function advanceIntro() {
  if (state.introStep >= els.introSlides.length - 1) {
    finishIntro();
    return;
  }
  setIntroStep(state.introStep + 1);
}

function finishIntro() {
  document.body.classList.add("intro-complete");
}

async function refreshStatus() {
  if (!els.envStatus) {
    return;
  }
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
    syncDraftFromInputs();
    if (!state.walletAddress) {
      await connectWallet();
    }
    if (!state.walletAddress) {
      writeLog("organizer_wallet", "Organizer wallet is required before policy compilation.");
      return;
    }
    const result = await apiPost("/api/policy", {
      organizerIntent: buildOrganizerIntent(),
      policyMode: els.policyMode.value,
      organizerAddress: state.walletAddress,
    });
    state.policy = result.review.policy;
    state.computeReceipt = result.compute.computeReceipt;
    state.applicantProof = null;
    state.publicProofMeta = null;
    state.verification = null;
    state.attestation = null;
    state.memory = null;
    state.passExecution = null;
    state.passExecutionMemory = null;
    state.ens = null;
    state.gateAgent = null;
    state.applications = [];
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
    updateAttestationPanel(null);
    updateBindingPanel(null);
    els.passWalletState.textContent = "No pass wallet generated";
    resetMetricClasses();
    setRail(els.railProof, "Pending");
    setRail(els.railStorage, "Pending");
    setRail(els.railKeeper, "Pending");
    setRail(els.railCompute, "Verified", "ok");
    updatePolicySummary(result.review.policy, result.review.policyHash);
    updateInviteFromPolicy();
    updateProofSummary("Waiting for attendee proof.");
    updatePassSummary("Approved attendees can claim a pass after verification.");
    renderApplications();
    updateExternalVerificationLinks();
    setStep("organizer", 1);
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
  if (!state.walletSignature || !isFutureTimestamp(state.expiresAt, 15_000)) {
    if (state.walletSignature) {
      writeLog("wallet_control_message", "Wallet-control signature expired; requesting a fresh signature.");
      state.walletMessage = null;
      state.walletSignature = null;
      state.expiresAt = null;
    }
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
    state.verification = null;
    state.attestation = null;
    state.memory = null;
    state.passExecution = null;
    state.passExecutionMemory = null;
    state.ens = null;
    state.gateAgent = null;
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
    setJson(els.resultJson, {});
    setJson(els.ensJson, {});
    setJson(els.gateAgentJson, {});
    els.proofMetric.textContent = result.applicantProof.claims.aggregatedExposureTier;
    els.verifierMetric.textContent = "Pending";
    els.executionMetric.textContent = "Pending";
    els.ensMetric.textContent = "Pending";
    els.passMetric.textContent = "Pending";
    els.gateAgentMetric.textContent = "Pending";
    updateAttestationPanel({
      serverVerified: false,
      mode: result.proofMode === "reclaim-live" ? "pending" : "fixture",
      proofType: result.publicProofMeta?.proofType,
      provider: "Reclaim",
      witnessCount: result.publicProofMeta?.witnesses?.length ?? 0,
      signatureCount: result.publicProofMeta?.signatures?.length ?? 0,
    });
    setRail(els.railProof, "Generated", "ok");
    setRail(els.railStorage, "Pending");
    setRail(els.railKeeper, "Pending");
    updateBindingPanel(null);
    updateProofSummary(`Proof generated: ${result.applicantProof.claims.aggregatedExposureTier}. Source wallet and exact balance are withheld.`);
    updatePassSummary("Approved attendees can claim a pass after verification.");
    upsertApplication({ stage: "proof" });
    updateExternalVerificationLinks();
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
    state.attestation = result.verification.attestation;
    state.memory = result.memory;
    updateAttestationPanel(result.verification.attestation);
    els.verifierMetric.textContent = result.verification.result.reasonCode;
    els.verifierMetric.className = result.verification.result.approved ? "ok" : "bad";
    els.executionMetric.textContent = result.execution.executionReceipt.status;
    setRail(els.railStorage, result.memory?.status === "FAILED" ? "Retryable" : "Stored", result.memory?.status === "FAILED" ? "warn" : "ok");
    updateProofSummary(`${result.verification.result.reasonCode}: ${result.verification.result.approved ? "approved" : "rejected"}.`);
    upsertApplication({ stage: "verified" });
    updateExternalVerificationLinks();
    if (result.verification.result.approved) {
      setStep("attendee", 3);
    }
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
    state.passExecutionMemory = result.memoryUpdate;
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
    setRail(els.railKeeper, result.execution.executionReceipt.status === "MINTED" ? "Minted" : result.execution.executionReceipt.status, result.execution.executionReceipt.status === "MINTED" ? "ok" : "warn");
    if (els.resultTitle && result.execution.executionReceipt.status === "MINTED") {
      els.resultTitle.textContent = "You are approved";
    }
    updatePassSummary(buildPassSummary(result.execution.executionReceipt));
    updateBindingPanel(result.execution.executionReceipt.receiptBinding);
    upsertApplication({ stage: "pass" });
    updateExternalVerificationLinks();
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
    updateExternalVerificationLinks();
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
    updateExternalVerificationLinks();
    if (result.published?.txs?.length || result.resolved?.event?.exists) {
      setStep("organizer", 3);
    }
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
    updateExternalVerificationLinks();
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
    updateExternalVerificationLinks();
  });
}

function switchRole(role) {
  state.role = role;
  clearFlowError();
  syncRoleShell();
  syncDraftFromInputs();
  updateInviteFromPolicy();
  els.roleTabs.forEach((tab) => {
    tab.classList.toggle("active", tab.dataset.role === role);
  });
  els.roleViews.forEach((view) => {
    view.classList.toggle("active", view.dataset.roleView === role);
  });
  updateFlow();
}

function moveStep(role, delta) {
  clearFlowError();
  if (role === "organizer" && delta > 0 && !state.policy) {
    showFlowError("Create the private gate before moving to review or applications.");
    writeLog("organizer_flow", "Create the private gate before moving to review or applications.");
    return;
  }
  if (role === "attendee" && delta > 0 && !state.policy) {
    showFlowError("Organizer must create a private gate before attendees can apply.");
    writeLog("attendee_flow", "Organizer must create a private gate before attendees can apply.");
    return;
  }
  if (role === "attendee" && delta > 0 && state.attendeeStep === 1 && (!state.walletAddress || !state.walletSignature)) {
    showFlowError("Connect the source wallet and sign the control message before generating a private proof.");
    writeLog("attendee_flow", "Wallet connection and control signature are required before proof generation.");
    return;
  }
  const key = role === "attendee" ? "attendeeStep" : "organizerStep";
  setStep(role, state[key] + delta);
}

function setStep(role, step) {
  const key = role === "attendee" ? "attendeeStep" : "organizerStep";
  const max = role === "attendee" ? 3 : 3;
  state[key] = Math.max(0, Math.min(max, step));
  if (state.role !== role) {
    switchRole(role);
    return;
  }
  updateFlow();
}

function updateFlow() {
  syncDraftFromInputs();
  updateInviteFromPolicy();
  const role = state.role;
  syncRoleShell();
  const step = role === "attendee" ? state.attendeeStep : state.organizerStep;
  els.flowSteps.forEach((panel) => {
    panel.classList.toggle("active", panel.dataset.role === role && Number(panel.dataset.step) === step);
  });
  const titles = {
    organizer: ["Create event", "Review policy", "Applications", "GateAgent"],
    attendee: ["Event invite", "Private check-in", "Private proof", "RSVP pass"],
  };
  els.stepKicker.textContent = `${capitalize(role)} · Step ${step + 1} of 4`;
  els.stepTitle.textContent = titles[role][step];
  els.progressFill.style.width = `${((step + 1) / 4) * 100}%`;
  updateHero();
}

function syncRoleShell() {
  document.body.classList.toggle("role-organizer", state.role === "organizer");
  document.body.classList.toggle("role-attendee", state.role === "attendee");
}

function updateHero() {
  const name = getEventName();
  const requirement = getRequirementLabel();
  if (state.role === "organizer") {
    els.heroTitle.textContent = state.policy ? `${name} is ready for private applications.` : "Create a private event gate.";
    els.heroCopy.textContent = state.policy
      ? `${requirement} access is compiled into a privacy-preserving RSVP policy.`
      : "Set who can join, let guests prove privately, and keep every receipt inspectable without exposing source wallets.";
  } else {
    els.heroTitle.textContent = state.policy ? `RSVP privately for ${name}.` : "No active private gate yet.";
    els.heroCopy.textContent = state.policy
      ? `Prove ${requirement.toLowerCase()} eligibility without publishing your source wallet or exact balance.`
      : "Ask the organizer to create a gate first. The attendee flow will unlock after the policy is compiled.";
  }
}

function openEvidenceRail() {
  document.body.classList.add("evidence-open");
}

function closeEvidenceRail() {
  document.body.classList.remove("evidence-open");
}

function updatePolicySummary(policy, policyHash) {
  if (!els.policySummary || !policy) {
    return;
  }
  const claim = policy.requiredClaims?.join(", ") || "ETH_HOLDER";
  const disclosure = policy.privacy?.disclosureMode || "tier_only";
  els.policySummary.innerHTML = `
    <div>
      <span class="metric-label">Gate</span>
      <strong>${escapeHtml(policy.eventName || policy.policyId || "Private RSVP")}</strong>
    </div>
    <div>
      <span class="metric-label">Requirement</span>
      <strong>${escapeHtml(claim)}</strong>
    </div>
    <div>
      <span class="metric-label">Policy hash</span>
      <strong>${escapeHtml(shortHash(policyHash))}</strong>
    </div>
    <div>
      <span class="metric-label">Disclosure</span>
      <strong>${escapeHtml(disclosure)}</strong>
    </div>
    <div>
      <span class="metric-label">Anti-sybil</span>
      <strong>${policy.antiSybil?.enabled ? "Event nullifier" : "Off"}</strong>
    </div>
    <div>
      <span class="metric-label">Action</span>
      <strong>${escapeHtml(policy.execution?.onPass || "mint_rsvp_pass")}</strong>
    </div>
  `;
}

function updateInviteFromPolicy() {
  const eventName = getEventName();
  const requirement = getRequirementLabel();
  els.inviteTitle.textContent = eventName;
  els.inviteRequirement.textContent = state.policy ? requirement : "Gate draft";
  els.inviteCopy.textContent = state.policy
    ? `This gate accepts attendees who satisfy ${requirement.toLowerCase()}. Your source wallet, exact balance, and raw proof body stay out of the public receipt.`
    : `The organizer is preparing a ${requirement.toLowerCase()} gate. Once the policy is compiled, attendees can prove eligibility privately.`;
  updateHero();
}

function syncDraftFromInputs() {
  state.eventDraft = {
    eventName: els.eventNameInput.value.trim(),
    audience: els.audienceInput.value.trim(),
    requirement: els.requirementInput.value.trim(),
    intent: els.organizerIntent.value.trim(),
  };
}

function buildOrganizerIntent() {
  const eventName = state.eventDraft.eventName || "Private RSVP Gate";
  const audience = state.eventDraft.audience || "qualified attendees";
  const requirement = state.eventDraft.requirement || "qualified ETH holder";
  const intent = state.eventDraft.intent || "Users should prove eligibility privately and receive an RSVP pass if qualified.";
  return [
    `Event name: ${eventName}.`,
    `Audience: ${audience}.`,
    `Requirement: ${requirement}.`,
    intent,
    "Users must not reveal source wallet addresses, exact balances, or wallet breakdowns.",
    "One applicant can only RSVP once, and qualified applicants should receive an RSVP pass.",
  ].join(" ");
}

function getEventName() {
  return state.eventDraft.eventName || state.policy?.eventName || "Private RSVP Gate";
}

function getRequirementLabel() {
  return state.eventDraft.requirement || state.policy?.requiredClaims?.join(", ") || "Qualified ETH holder";
}

function updateProofSummary(message) {
  if (els.proofSummary) {
    els.proofSummary.textContent = message;
  }
}

function updatePassSummary(message) {
  if (els.passSummary) {
    els.passSummary.textContent = message;
  }
}

function buildPassSummary(receipt) {
  if (!receipt) {
    return "Approved attendees can claim a pass after verification.";
  }
  if (receipt.status !== "MINTED") {
    return `Pass execution status: ${receipt.status}.`;
  }
  return `RSVP pass minted to ${maskAddress(receipt.recipient)} with tx ${shortHash(receipt.txHash)} and receipt binding ${shortHash(receipt.receiptBinding?.bindingHash)}.`;
}

function upsertApplication({ stage }) {
  if (!state.applicantProof) {
    return;
  }
  const proof = state.applicantProof;
  const existingIndex = state.applications.findIndex((item) => item.eventNullifier === proof.antiSybil?.eventNullifier);
  const existing = existingIndex >= 0 ? state.applications[existingIndex] : {};
  const receipt = state.passExecution?.executionReceipt;
  const item = {
    id: existing.id || `Guest #${state.applications.length + 1}`,
    stage,
    eventId: proof.eventId,
    proofHash: proof.proof?.proofHash,
    eventNullifier: proof.antiSybil?.eventNullifier,
    applicantCommitment: proof.applicantCommitment,
    exposureTier: proof.claims?.aggregatedExposureTier,
    verifierResult: state.verification?.result || existing.verifierResult || "pending",
    reasonCode: state.verification?.reasonCode || existing.reasonCode || "PENDING",
    passStatus: receipt?.status || existing.passStatus || "PENDING",
    recipient: receipt?.recipient || existing.recipient || null,
    txHash: receipt?.txHash || existing.txHash || null,
    auditPointer: state.memory?.manifestPointer?.rootHash
      ? `0G://${state.memory.manifestPointer.rootHash}`
      : state.memory?.auditRecord?.storage?.pointer || existing.auditPointer || null,
  };
  if (existingIndex >= 0) {
    state.applications[existingIndex] = item;
  } else {
    state.applications.unshift(item);
  }
  renderApplications();
}

function renderApplications() {
  if (!els.applicationsList || !els.applicationEmpty) {
    return;
  }
  els.applicationEmpty.style.display = state.applications.length ? "none" : "block";
  els.applicationsList.innerHTML = state.applications.map((application) => {
    const approved = application.verifierResult === "approved";
    const status = application.passStatus === "MINTED"
      ? "Pass minted"
      : approved
        ? "Approved"
        : application.verifierResult === "rejected"
          ? "Rejected"
          : "Proof received";
    const statusClass = application.verifierResult === "rejected" ? "bad" : approved ? "ok" : "warn";
    return `
      <article class="application-card">
        <div class="application-card-header">
          <div>
            <h3>${escapeHtml(application.id)}</h3>
            <p class="muted">${escapeHtml(application.eventId || "Private RSVP gate")}</p>
          </div>
          <span class="application-status ${statusClass}">${escapeHtml(status)}</span>
        </div>
        <div class="application-meta">
          <span>Tier: ${escapeHtml(application.exposureTier || "pending")}</span>
          <span>Reason: ${escapeHtml(application.reasonCode)}</span>
          <span>Recipient: ${escapeHtml(application.recipient ? maskAddress(application.recipient) : "hidden until pass")}</span>
        </div>
        <code>proof ${escapeHtml(shortHash(application.proofHash))}</code>
        <code>nullifier ${escapeHtml(shortHash(application.eventNullifier))}</code>
        <code>receipt ${escapeHtml(application.auditPointer ? shortHash(application.auditPointer) : "pending")}</code>
        ${application.txHash ? `<code>pass tx ${escapeHtml(shortHash(application.txHash))}</code>` : ""}
      </article>
    `;
  }).join("");
}

function resetMetricClasses() {
  [
    els.proofMetric,
    els.verifierMetric,
    els.executionMetric,
    els.ensMetric,
    els.passMetric,
    els.gateAgentMetric,
  ].forEach((metric) => {
    metric.className = "";
  });
}

function setRail(element, text, className = "") {
  if (!element) {
    return;
  }
  element.textContent = text;
  element.className = className;
}

function capitalize(value) {
  return `${value.slice(0, 1).toUpperCase()}${value.slice(1)}`;
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
    const error = new Error(payload.error ?? `POST ${path} failed`);
    error.logged = true;
    throw error;
  }
  return payload;
}

function updateAttestationPanel(attestation) {
  if (!els.attestationProofMetric) {
    return;
  }
  if (!attestation) {
    els.attestationProofMetric.textContent = "Pending";
    els.attestationProviderMetric.textContent = "Reclaim";
    els.attestationServerMetric.textContent = "Pending";
    els.attestationServerMetric.className = "";
    return;
  }
  const signatures = attestation.signatureCount ?? 0;
  const witnesses = attestation.witnessCount ?? 0;
  els.attestationProofMetric.textContent = attestation.proofType
    ? `${witnesses} witness${witnesses === 1 ? "" : "es"} · ${signatures} signature${signatures === 1 ? "" : "s"}`
    : "Generated";
  els.attestationProviderMetric.textContent = attestation.proofType === "reclaim_zkfetch"
    ? `${attestation.provider ?? "Reclaim"} zkTLS`
    : attestation.provider ?? "Reclaim";
  if (attestation.serverVerified) {
    els.attestationServerMetric.textContent = "Verified server-side";
    els.attestationServerMetric.className = "ok";
  } else if (attestation.mode === "fixture") {
    els.attestationServerMetric.textContent = "Fixture mode";
    els.attestationServerMetric.className = "warn";
  } else {
    els.attestationServerMetric.textContent = "Pending";
    els.attestationServerMetric.className = "";
  }
}

function updateBindingPanel(binding) {
  if (!els.bindingStatusMetric) {
    return;
  }
  if (!binding) {
    els.bindingStatusMetric.textContent = "Pending";
    els.bindingStatusMetric.className = "";
    els.bindingAuditMetric.textContent = "Pending";
    els.bindingExecutionMetric.textContent = "Pending";
    els.bindingFieldsMetric.textContent = "Pending";
    els.bindingFieldsMetric.className = "";
    return;
  }
  els.bindingStatusMetric.textContent = binding.status ?? "Pending";
  els.bindingStatusMetric.className = binding.status === "VERIFIED" ? "ok" : "warn";
  els.bindingAuditMetric.textContent = binding.auditLayer ?? "0G Galileo";
  els.bindingExecutionMetric.textContent = binding.executionNetwork
    ? `${binding.executionLayer ?? "KeeperHub"} · ${binding.executionNetwork}`
    : binding.executionLayer ?? "KeeperHub";
  const checks = binding.checks ?? {};
  const matched = Object.values(checks).filter(Boolean).length;
  const total = Object.keys(checks).length || 0;
  els.bindingFieldsMetric.textContent = total ? `${matched}/${total} linked` : "Linked";
  els.bindingFieldsMetric.className = matched === total ? "ok" : "warn";
}

async function withBusy(button, task) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = "Running...";
  clearFlowError();
  try {
    await task();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!error?.logged) {
      writeLog("error", message);
    }
    showFlowError(message);
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

function showFlowError(message) {
  if (!els.flowStatus) {
    return;
  }
  els.flowStatus.textContent = message;
  els.flowStatus.hidden = false;
}

function clearFlowError() {
  if (!els.flowStatus) {
    return;
  }
  els.flowStatus.textContent = "";
  els.flowStatus.hidden = true;
}

function writeLogs(logs = []) {
  logs.forEach((entry) => writeLog(entry.step, entry.message, entry.at));
  if (
    state.role === "organizer"
    && state.organizerStep === 2
    && logs.some((entry) => entry.step === "ens_event_published" || entry.step === "ens_alignment_ok")
  ) {
    setStep("organizer", 3);
  }
}

function writeLog(step, message, at = new Date().toISOString()) {
  const item = document.createElement("li");
  item.innerHTML = `
    <div class="log-step"><strong>${escapeHtml(step)}</strong><span>${new Date(at).toLocaleTimeString()}</span></div>
    <p>${escapeHtml(message)}</p>
  `;
  els.logList.prepend(item);
}

function updateExternalVerificationLinks() {
  renderExternalLinks(els.policyLinks, buildPolicyVerificationLinks());
  renderExternalLinks(els.proofLinks, buildProofVerificationLinks());
  renderExternalLinks(els.resultLinks, buildResultVerificationLinks());
  renderExternalLinks(els.ensLinks, buildEnsVerificationLinks());
  renderExternalLinks(els.gateAgentLinks, buildGateAgentVerificationLinks());
}

function renderExternalLinks(element, { title, items = [] } = {}) {
  if (!element) {
    return;
  }
  const visibleItems = items.filter(Boolean);
  element.innerHTML = `
    <div class="record-links-head">
      <span>External Verification</span>
      <strong>${escapeHtml(title ?? "Evidence")}</strong>
    </div>
    <div class="record-link-list">
      ${visibleItems.map(renderExternalLinkItem).join("")}
    </div>
  `;
}

function renderExternalLinkItem(item) {
  const status = item.status ?? (item.href ? "verifiable" : "note");
  const statusClass = externalStatusClass(status, Boolean(item.href));
  const note = item.note ? `<p>${escapeHtml(item.note)}</p>` : "";
  if (!item.href) {
    return `
      <article class="record-link-note">
        <div>
          <span class="${statusClass}">${escapeHtml(status)}</span>
          <strong>${escapeHtml(item.label)}</strong>
        </div>
        ${note}
      </article>
    `;
  }
  return `
    <a class="record-link-button" href="${escapeHtml(item.href)}" target="_blank" rel="noreferrer">
      <div>
        <span class="${statusClass}">${escapeHtml(status)}</span>
        <strong>${escapeHtml(item.label)}</strong>
      </div>
      ${note}
    </a>
  `;
}

function buildPolicyVerificationLinks() {
  const policyPointer = state.memory?.pointers?.policy;
  const manifestPointer = state.memory?.manifestPointer;
  const items = [];
  if (!state.policy) {
    items.push({
      label: "No policy compiled yet",
      status: "pending",
      note: "Create a private gate first. The compiled policy will appear here before it is published.",
    });
  } else if (policyPointer) {
    items.push(...storagePointerLinks(policyPointer, "0G Policy"));
    if (manifestPointer) {
      items.push(...storagePointerLinks(manifestPointer, "0G Manifest"));
    }
  } else {
    items.push({
      label: "Policy compiled locally",
      status: "pending",
      note: "Run Verify Eligibility with 0G Storage live to publish the policy object and manifest.",
    });
  }
  const computePointer = state.memory?.pointers?.["compute-receipts"];
  if (computePointer) {
    items.push(...storagePointerLinks(computePointer, "0G Compute Receipt"));
  }
  return { title: "Policy publication", items };
}

function buildProofVerificationLinks() {
  const proofPointer = state.memory?.pointers?.["proof-metadata"];
  const attestation = state.attestation;
  const items = [];
  if (!state.publicProofMeta) {
    items.push({
      label: "No proof generated yet",
      status: "pending",
      note: "Generate a Reclaim proof first. Raw proof material is never published in this panel.",
    });
    return { title: "Proof attestation", items };
  }
  if (attestation?.serverVerified) {
    items.push({
      label: "Reclaim proof verified server-side",
      status: "verified",
      note: "Witness proof verification happened on the backend. The raw proof is withheld by design.",
    });
  } else if (attestation?.mode === "fixture") {
    items.push({
      label: "Fixture proof mode",
      status: "local",
      note: "Fixture proofs are local test data and are not externally verifiable.",
    });
  } else {
    items.push({
      label: "Reclaim proof generated",
      status: "pending",
      note: "Server-side proof verification runs during Verify Eligibility.",
    });
  }
  if (proofPointer) {
    items.push(...storagePointerLinks(proofPointer, "0G Proof Metadata"));
  } else {
    items.push({
      label: "Proof metadata not published yet",
      status: "pending",
      note: "Use 0G Storage live verification to publish redacted proof metadata.",
    });
  }
  return { title: "Proof attestation", items };
}

function buildResultVerificationLinks() {
  const receipt = state.passExecution?.executionReceipt;
  const binding = receipt?.receiptBinding;
  const items = [];
  if (receipt?.transactionLink) {
    items.push({
      label: "View Pass Transaction",
      href: receipt.transactionLink,
      note: "Third-party explorer record for the RSVP pass execution.",
    });
  } else if (isTxHash(receipt?.txHash)) {
    items.push({
      label: "View Pass Transaction",
      href: txUrl(resolveExecutionNetwork(receipt), receipt.txHash),
      note: "Explorer record for the RSVP pass execution.",
    });
  } else if (receipt) {
    items.push({
      label: "Pass execution not externally linked",
      status: "local",
      note: "Dry-run and pending execution receipts do not have a chain transaction.",
    });
  } else {
    items.push({
      label: "No pass execution yet",
      status: "pending",
      note: "Claim the RSVP pass to generate the execution receipt.",
    });
  }

  items.push(...storagePointerLinks(state.memory?.pointers?.audit, "0G Audit"));
  items.push(...storagePointerLinks(state.memory?.pointers?.execution, "0G Execution Plan"));
  items.push(...storagePointerLinks(state.memory?.manifestPointer, "0G Manifest"));
  items.push(...storagePointerLinks(state.passExecutionMemory?.pointer, "0G Pass Execution Memory"));

  if (binding?.status) {
    items.push({
      label: `Receipt Binding ${binding.status}`,
      status: binding.status === "VERIFIED" ? "verified" : "pending",
      note: binding.bindingHash
        ? `Binding hash ${shortHash(binding.bindingHash)} connects policy, proof, nullifier, audit pointer, and pass tx.`
        : "Binding fields are included in the execution receipt.",
    });
  }
  return { title: "Execution receipt", items };
}

function buildEnsVerificationLinks() {
  const items = [];
  const publishedTxs = uniqueBy((state.ens?.published?.txs ?? [])
    .filter((item) => isTxHash(item.txHash)), (item) => item.txHash);
  if (publishedTxs.length > 0) {
    for (const [index, tx] of publishedTxs.entries()) {
      items.push({
        label: index === 0 ? "View ENS Publish Tx" : `View ENS Publish Tx ${index + 1}`,
        href: sepoliaTxUrl(tx.txHash),
        note: tx.key ? `Published ENS record: ${tx.key}` : "Published ENS text records.",
      });
    }
  } else if (state.ens?.resolved?.event?.exists) {
    items.push({
      label: "ENS records resolved",
      status: "verified",
      note: "This run resolved public ENS records, but did not publish a new transaction.",
    });
  } else {
    items.push({
      label: "No ENS publish transaction yet",
      status: "pending",
      note: "Publish Event Receipt to create a public ENS transaction.",
    });
  }
  const name = state.ens?.payload?.eventName ?? state.ens?.resolved?.event?.name;
  if (name) {
    items.push({
      label: "Open ENS Name",
      href: `https://app.ens.domains/${encodeURI(name)}`,
      note: "Third-party ENS app view for the event identity.",
    });
  }
  return { title: "ENS identity", items };
}

function buildGateAgentVerificationLinks() {
  const gateAgent = state.gateAgent;
  const items = [];
  if (!gateAgent) {
    items.push({
      label: "No GateAgent minted yet",
      status: "pending",
      note: "Activate the GateAgent to create 0G Galileo iNFT explorer records.",
    });
    return { title: "GateAgent iNFT", items };
  }
  if (gateAgent.explorerUrl) {
    items.push({
      label: "View GateAgent Mint Tx",
      href: gateAgent.explorerUrl,
      note: `Token ${gateAgent.tokenId ?? "mint"} on 0G Galileo.`,
    });
  } else if (isTxHash(gateAgent.txHash)) {
    items.push({
      label: "View GateAgent Mint Tx",
      href: ogTxUrl(gateAgent.txHash),
      note: "0G Galileo transaction for GateAgent mint.",
    });
  }
  items.push(...storagePointerLinks(gateAgent.metadataPointer, "0G GateAgent Metadata"));
  if (gateAgent.contract) {
    items.push({
      label: "View GateAgent Contract",
      href: ogAddressUrl(gateAgent.contract),
      note: "0G Galileo ERC-7857 GateAgent contract.",
    });
  }
  if (gateAgent.verifier) {
    items.push({
      label: "View Data Verifier Contract",
      href: ogAddressUrl(gateAgent.verifier),
      note: "0G Galileo verifier contract for iClone and iTransfer receipts.",
    });
  }
  const mutation = gateAgent.lastMutation;
  if (mutation?.explorerUrl) {
    items.push({
      label: mutation.tool === "cloneGateAgentINFT" ? "View iClone Tx" : "View iTransfer Tx",
      href: mutation.explorerUrl,
      note: "0G Galileo transaction for the latest GateAgent mutation.",
    });
  } else if (isTxHash(mutation?.txHash)) {
    items.push({
      label: mutation?.tool === "cloneGateAgentINFT" ? "View iClone Tx" : "View iTransfer Tx",
      href: ogTxUrl(mutation.txHash),
      note: "0G Galileo transaction for the latest GateAgent mutation.",
    });
  }
  items.push(...storagePointerLinks(mutation?.metadataPointer, "0G Updated Metadata"));
  return { title: "GateAgent iNFT", items };
}

function storagePointerLinks(pointer, label) {
  if (!pointer) {
    return [];
  }
  const items = [];
  if (isTxHash(pointer.txHash)) {
    items.push({
      label: `View ${label} Tx`,
      href: ogTxUrl(pointer.txHash),
      note: `0G Storage upload transaction for ${pointer.kind ?? label}.`,
    });
  }
  if (pointer.txSeq !== undefined && pointer.txSeq !== null) {
    items.push({
      label: `View ${label} Submission`,
      href: storageSubmissionUrl(pointer.txSeq),
      note: pointer.rootHash ? `Storage root ${shortHash(pointer.rootHash)}.` : "0G Storage submission record.",
    });
  } else if (pointer.rootHash) {
    items.push({
      label: `${label} root recorded`,
      status: "verified",
      note: `0G root ${shortHash(pointer.rootHash)} is present in the workflow receipt.`,
    });
  }
  return items;
}

function resolveExecutionNetwork(receipt) {
  const bindingNetwork = receipt?.receiptBinding?.executionNetwork;
  if (bindingNetwork) {
    return bindingNetwork;
  }
  if (receipt?.mode === "direct-live") {
    return "0G Galileo";
  }
  return "sepolia";
}

function txUrl(network, txHash) {
  return is0GNetwork(network) ? ogTxUrl(txHash) : sepoliaTxUrl(txHash);
}

function ogTxUrl(txHash) {
  return `https://chainscan-galileo.0g.ai/tx/${txHash}`;
}

function sepoliaTxUrl(txHash) {
  return `https://sepolia.etherscan.io/tx/${txHash}`;
}

function ogAddressUrl(address) {
  return `https://chainscan-galileo.0g.ai/address/${address}`;
}

function storageSubmissionUrl(txSeq) {
  return `https://storagescan-galileo.0g.ai/submission/${encodeURIComponent(String(txSeq))}?network=turbo`;
}

function is0GNetwork(network) {
  return String(network ?? "").toLowerCase().includes("0g")
    || String(network ?? "") === "16602";
}

function isTxHash(value) {
  return typeof value === "string" && /^0x[0-9a-fA-F]{64}$/.test(value);
}

function uniqueBy(items, keyFn) {
  const seen = new Set();
  const result = [];
  for (const item of items) {
    const key = keyFn(item);
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }
  return result;
}

function externalStatusClass(status, hasHref) {
  if (hasHref || status === "verified" || status === "verifiable") {
    return "ok";
  }
  if (status === "pending" || status === "local") {
    return "warn";
  }
  return "";
}

function setJson(element, value) {
  element.textContent = JSON.stringify(value, null, 2);
}

function isFutureTimestamp(value, skewMs = 0) {
  const time = Date.parse(value);
  return Number.isFinite(time) && time > Date.now() + skewMs;
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
