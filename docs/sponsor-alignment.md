# Sponsor Alignment

## 0G

Status: implemented and verified.

VeriGate uses 0G as the canonical compute, storage, and GateAgent layer.

### 0G Compute

Organizer intent is sent to 0G Compute and compiled into a structured eligibility policy. The workflow records prompt hash, output hash, policy hash, provider address, model, chat id, and response verification status. The deterministic verifier remains normal code; 0G Compute compiles and explains policy, but does not decide eligibility.

### 0G Storage

0G Storage stores workflow bundles and GateAgent metadata:

- policy
- compute receipt
- redacted proof metadata
- audit record
- execution plan
- manifest
- pass execution memory
- encrypted GateAgent metadata

Storage proof artifacts are tracked in `deployments/0g-galileo/storage-pointers.json`.

### 0G Galileo Contracts

Deployment metadata: `deployments/0g-galileo/addresses.json`

- `EventRegistry`: `0x1773fC52D7C64e3AF5C7dad31a28dF999d646f69`
- `NullifierRegistry`: `0x9D1D4d7c17E87679a27778B2Ba9c3034B94b0788`
- `VerifierReceiptRegistry`: `0xBC5d68c48014d9C8809a9dF34B03839c8a2A6De7`
- `EventPassSBT`: `0xC6E45721b7CD58e1FE301870DeE9614DFC1Dc120`
- `GateAgentDataVerifier`: `0xEAD5F31be0595C79CE56C25cCb7F39f1c4dF1Bf2`
- `GateAgentINFT`: `0xcD6c201A59F97291dabD45DA1456798D142F9f5e`

## 0G iNFT / ERC-7857

Status: implemented and verified on 0G Galileo.

The GateAgent layer mints a real event-specific ERC-7857-style iNFT on 0G. Encrypted policy intelligence and event memory are uploaded to 0G Storage, while the onchain token stores the encrypted metadata pointer, intelligent data root, policy hash, memory root, owner, and authorized executors.

Implemented ERC-7857-style surface:

- `intelligentDataOf`
- `verifier`
- `authorizedUsersOf`
- `authorizeUsage`
- `revokeAuthorization`
- `delegateAccess`
- `iClone`
- `iTransfer`

Transfer and clone operations are checked by `GateAgentDataVerifier` using signed transfer receipts with old/new data hashes, old/new 0G metadata pointers, recipient, nonce, expiry, and attestation URI.

Live artifact: `deployments/0g-galileo/gate-agent-live-result.json`

- Mint tx: https://chainscan-galileo.0g.ai/tx/0x4e9b60f357a5fb3655e3ec1d4c7259848095fd6c5cc7ade4a7741d37c60fa30f
- iClone tx: https://chainscan-galileo.0g.ai/tx/0xf80aebe2492af84c4e19dc5805770951edbb2995c1723f8fe2ab3875de8e2690
- iTransfer tx: https://chainscan-galileo.0g.ai/tx/0x0d2957c2deb310d40467d3b2c4b59a027c147e0ba889bd7b48622769d585f6a0
- Minted encrypted metadata root: `0x2432176e14f3182645ff9fcc4e6502a7c6ec05d3e58ae559abdec9932f29bac4`
- Minted data root: `0xfc48322d7306463bb5269b92c41c6286602c2546d9383fa4887c0927d8f7c47c`

## ENS

Status: implemented and verified on Sepolia.

VeriGate uses ENS as the event identity and discovery layer, not as a cosmetic display. The agent ENS name is `verigate-agent.eth` (Sepolia). Event subnames are derived from the active gate identifier and published with text records that point to the verified workflow.

ENS name: https://app.ens.domains/verigate-agent.eth

Published record fields:

- `agent.name`
- `agent.version`
- `event.id`
- `event.name`
- `event.policyHash`
- `event.verifier`
- `event.passContract`
- `event.auditPointer`
- `event.appUrl`
- `event.proofHash`
- `event.nullifier`

The UI publishes records, resolves them back, and checks alignment against the active workflow state. This demonstrates a functional identity/discovery layer for an event agent.

## KeeperHub

Status: implemented and verified with Direct Execution on Sepolia.

KeeperHub is used as the reliable execution layer for approved RSVP pass minting. The source ETH holder wallet is not used as the pass recipient; the browser generates a fresh recipient wallet locally and sends only the recipient address to the server.

Execution path:

1. VeriGate verifies the redacted applicant proof.
2. VeriGate prepares the pass issuance plan and verifier receipt.
3. KeeperHub calls `mintWithVerifiedReceipt(recipient, receiptId, tokenURI)`.
4. The pass contract checks the verifier receipt and consumes the nullifier before minting.
5. KeeperHub execution id, transaction hash, transaction link, and receipt binding are written back to 0G Storage.

Sepolia execution target: `deployments/sepolia/addresses.json`

- `EventRegistry`: `0xc233c7cDCD2B9D5827beb5FafEf6B67752B2c34f`
- `NullifierRegistry`: `0x02741144c59870aD1CFa51b5D0b6dd97D27aabac`
- `VerifierReceiptRegistry`: `0x9aB41705c802C426dBdcFE377F5A96e76F4c51cb`
- `EventPassSBT`: `0xb283e3D15538529cf7D250663a4436695e8C928e`

KeeperHub currently executes the supported Sepolia pass target. 0G remains the primary compute, storage, audit, and GateAgent layer.

Builder feedback bounty material is tracked in `docs/keeperhub-builder-feedback.md`.
