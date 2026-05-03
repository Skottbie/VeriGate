# VeriGate — MVP Design

> For deployment addresses, contract explorer links, and recorded demo transactions, see [README.md](../README.md).

---

## Product Thesis

Web3 event access control hasn't evolved with the ecosystem:

| Current method | Problem |
|---|---|
| Google Form | Unverifiable, screenshot-fakeable, manual review |
| Direct wallet connect | Full wallet history exposed to organizer |
| Token gating | Fixed rules, can't handle multi-wallet aggregation |
| Manual chain lookup | Doesn't scale, privacy risk for applicants |
| AI-only review | No audit trail, not reproducible — a new black box |

**VeriGate's answer:**

> Organizer describes access rules → Agent compiles proof policy → User submits privacy-preserving proof → Deterministic verifier evaluates → KeeperHub executes pass issuance → 0G records the audit log.

The core bet: crypto access control should be proof-based, privacy-preserving, and auditable — not a choice between "expose everything" and "trust a gatekeeper."

---

## Core Architecture

See the [Architecture diagram in README.md](../README.md#architecture) for the full flowchart.

Two parallel paths:

**Organizer path** — Natural language intent → 0G Compute (policy compiler inference) → organizer reviews and approves → `policyHash` locked → stored on 0G Storage + registered on-chain. The policy cannot change after confirmation.

**Attendee path** — zkTLS proof (wallet commitment, redacted balances) → deterministic `verifyProof(policy, proof)` → if APPROVED: verifier receipt + event nullifier written on-chain → KeeperHub Direct Execution → `mintWithVerifiedReceipt` on Sepolia `EventPassSBT`.

All workflow pointers (policy, compute receipt, audit record, execution receipt) are indexed in ENS event identity text records. The `GateAgentINFT` holds encrypted policy intelligence on 0G Storage, with ERC-7857-style ownership and transfer/clone delegation.

---

## Trust Model

> **AI does not decide eligibility. Policy + proof does.**

| Component | Responsibility | What it cannot do |
|---|---|---|
| 0G Compute | Compiles organizer intent into `EligibilityPolicy` draft | Cannot be the final arbiter of pass/fail |
| Organizer | Reviews and confirms policy; `policyHash` is locked afterward | Cannot modify policy post-confirmation |
| `verifyProof(policy, proof)` | Pure deterministic function — evaluates proof against locked policy | Cannot be overridden by AI hidden state |
| KeeperHub | Executes `mintWithVerifiedReceipt` after a valid verifier receipt exists on-chain | Cannot mint without a genuine on-chain receipt |
| VeriGate server | Orchestrates the workflow | Cannot bypass verifier to issue a pass |

Recommended trust wording:

> *Organizer confirmed the policy. The verifier deterministically evaluated the proof against the policy. KeeperHub executed the on-chain pass mint. VeriGate server coordinated the flow — eligibility judgment comes from the verifier, not from server or AI.*

---

## Data Schemas

### EligibilityPolicy

```json
{
  "policyId": "string",
  "eventName": "string",
  "organizer": "string",
  "requiredClaims": ["ETH_HOLDER", "MULTI_WALLET_AGGREGATION"],
  "privacy": {
    "revealWalletAddress": false,
    "revealExactBalance": false,
    "revealWalletBreakdown": false,
    "disclosureMode": "eligible_only"
  },
  "antiSybil": {
    "enabled": true,
    "nullifierScope": "event"
  },
  "execution": {
    "onPass": "mint_rsvp_pass",
    "executor": "keeperhub"
  },
  "metadata": {
    "policyHash": "sha256Hex('verigate:policy:v1:<canonical JSON>')",
    "verifierVersion": "string",
    "agentVersion": "string",
    "createdAt": "ISO8601"
  }
}
```

### ApplicantProof

```json
{
  "eventId": "string",
  "policyHash": "string",
  "applicantCommitment": "string",
  "walletCommitments": ["string"],
  "claims": {
    "asset": "ETH",
    "aggregatedExposureTier": "qualified | not_qualified"
  },
  "privacy": {
    "walletAddressesHidden": true,
    "exactBalancesHidden": true,
    "walletBreakdownHidden": true
  },
  "antiSybil": {
    "eventNullifier": "string"
  },
  "proof": {
    "proofHash": "string",
    "expiresAt": "ISO8601",
    "proofType": "zkTLS"
  }
}
```

### Hash Convention

All hashes use `sha256Hex("verigate:<type>:v1:<canonical JSON>")`:

| Object | Prefix |
|---|---|
| Policy hash | `verigate:policy:v1:` |
| Proof hash | `verigate:proof:v1:` |
| Compute receipt hash | `verigate:compute-receipt:v1:` |
| Event nullifier | `sha256Hex("verigate:nullifier:v1:<eventId>:<applicantCommitment>")` |

---

## Privacy Model

| Data | Visible to organizer | On-chain | On 0G Storage |
|---|---|---|---|
| Eligibility result (pass/fail) | ✅ | receipt hash only | audit record |
| Policy hash | ✅ | ✅ | ✅ |
| Proof hash | ✅ | ✅ | ✅ |
| Event nullifier | ✅ | ✅ | hash only |
| Applicant commitment | hash only | hash only | hash only |
| Source wallet addresses | ❌ hidden | ❌ never | ❌ never |
| Exact ETH balance | ❌ hidden | ❌ never | ❌ never |
| Wallet-by-wallet breakdown | ❌ hidden | ❌ never | ❌ never |

RSVP Pass is minted to a **fresh pass wallet** generated client-side — not to any source wallet used for proof generation.

Event nullifiers are scoped to `(eventId, applicantCommitment)`. Cross-event tracking is not possible: the same applicant has a different nullifier for every event.

---

## Sponsor Design Rationale

### 0G

0G is the primary infrastructure layer — not just a log backend.

- **0G Chain**: Immutable on-chain state for policy registry (`EventRegistry`), duplicate-prevention (`NullifierRegistry`), deterministic results (`VerifierReceiptRegistry`), and pass issuance (`EventPassSBT`). Every significant state transition is anchored here.
- **0G Storage**: Shared persistent agent memory across the full workflow. Each event has a memory namespace (`policy/`, `compute-receipts/`, `proofs/`, `audit/`, `execution/`). Objects stored include the `EligibilityPolicy`, `ComputeReceipt`, `AuditRecord`, `ExecutionReceipt`, and `GateAgentINFT` encrypted metadata.
- **0G Compute**: Policy compilation with a verifiable inference receipt. The organizer's natural language intent runs through 0G Compute, producing a structured `EligibilityPolicy` draft and a receipt that can be independently audited. This makes the AI contribution to policy creation traceable.
- **GateAgentINFT (ERC-7857)**: Each event has an organizer-owned iNFT on 0G Galileo. It holds encrypted policy intelligence via 0G Storage and supports `authorizeUsage`, `iTransfer`, and `iClone` — gate ownership can change hands with verifier-checked transfer receipts, without breaking the event's audit trail.

### ENS

`verigate-agent.eth` serves as the agent's persistent on-chain identity. Event subnames (e.g. `eth-holder-night.verigate-agent.eth`) carry text record metadata linking `policyHash`, verifier contract, pass contract, 0G audit pointer, and app URL.

This makes event discovery and policy resolution transparent: a user can resolve the ENS subname and independently verify what policy was used and where the audit log is stored — without trusting VeriGate's server to tell them.

### KeeperHub

`mintWithVerifiedReceipt` on Sepolia can only succeed if a valid on-chain verifier receipt exists. KeeperHub executes this call via Direct Execution — VeriGate does not maintain a privileged hot wallet for pass issuance, and the execution is retry-safe and gas-managed.

This enforces the trust boundary at the execution layer: even if the VeriGate orchestration server is unavailable or compromised, KeeperHub cannot mint a pass without a genuine verifier receipt already recorded on-chain.

---

*This document describes what was actually built. For deployment addresses, tx hashes, and explorer links, see [README.md](../README.md).*
