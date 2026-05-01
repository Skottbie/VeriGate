# Sponsor Alignment

## 0G Chain

Status: implemented and deployed on 0G Galileo testnet.

The P2 gate settlement layer is deployed on 0G Chain with event policy anchoring, verifier receipt anchoring, nullifier replay protection, and soulbound event pass minting.

Deployment metadata: `deployments/0g-galileo/addresses.json`

## 0G Storage

Status: implemented and verified on 0G Galileo testnet.

The P3 gate memory layer writes event-scoped policy, compute receipt, audit record, execution receipt, and manifest objects to 0G Storage through the Turbo indexer. Each object is readable by root hash and recorded in a shared event namespace.

Storage metadata: `deployments/0g-galileo/storage-pointers.json`

## 0G Compute

Status: implemented and verified with live inference.

The P4 policy compiler sends organizer intent to 0G Compute and records a compute receipt with prompt hash, output hash, policy hash, provider address, model, chat id, and response verification status. The deterministic verifier remains normal code; 0G Compute compiles and explains policy only.

The P5 VeriGate workflow uses the 0G Compute policy compiler as the first step in the agent sequence before organizer review, deterministic verification, 0G Storage memory, and execution readiness.

## ENS

Status: implemented and verified on Sepolia.

The P7 event identity layer publishes event-scoped ENS text records under the VeriGate agent name. Records include policy hash, verifier address, pass contract, audit pointer, app URL, proof hash, and nullifier. The test console resolves the records after publish and checks alignment against the current workflow result.

## KeeperHub

Status: implemented and verified with Direct Execution on Sepolia.

The P8 execution layer uses KeeperHub to call the pass contract after deterministic verification succeeds. The source ETH holder wallet is not used as the pass recipient; the browser generates a fresh recipient wallet locally and sends only the recipient address to the server. The resulting KeeperHub execution id, transaction hash, transaction link, and mint receipt are written back to 0G Storage as pass execution memory.

KeeperHub currently executes the mirror pass contract on Sepolia because 0G Galileo is not available through KeeperHub Direct Execution at the time of integration. 0G remains the primary compute, storage, and audit layer for the workflow.

## 0G iNFT / ERC-7857

Status: implemented and verified on 0G Galileo.

The P9 GateAgent layer mints a real event-specific ERC-7857 GateAgent iNFT on 0G. Encrypted policy intelligence and agent memory are uploaded to 0G Storage, while the onchain token stores the encrypted metadata pointer, intelligent data root, policy hash, memory root, owner, and authorized executors.

The GateAgent implements the project-scoped ERC-7857 surface needed by VeriGate: `intelligentDataOf`, `verifier`, `authorizedUsersOf`, `authorizeUsage`, `revokeAuthorization`, `delegateAccess`, `iTransfer`, and `iClone`. Transfer and clone operations are checked by `GateAgentDataVerifier` using signed transfer receipts with old/new data hashes, old/new 0G metadata pointers, recipient, nonce, expiry, and attestation URI.

Live 0G Galileo contracts:

- `GateAgentINFT`: `0xcD6c201A59F97291dabD45DA1456798D142F9f5e`
- `GateAgentDataVerifier`: `0xEAD5F31be0595C79CE56C25cCb7F39f1c4dF1Bf2`

Live verification artifacts are tracked in `deployments/0g-galileo/gate-agent-live-result.json`.
