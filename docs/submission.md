# Open Agents Submission Notes

Project: VeriGate

Demo video: https://youtu.be/jV2zf1njsjg

Repository: https://github.com/Skottbie/VeriGate

Contact: X https://x.com/eazimonizone / Telegram @UnlockeRrrr

## Short Description

Private RSVP gates with zkTLS eligibility proofs, 0G audit memory, and onchain receipts.

## Full Description

VeriGate is private RSVP infrastructure for verifiable agent events. It lets organizers create access rules such as "qualified ETH holder," compiles those rules with 0G Compute, lets attendees prove eligibility with zkTLS, and keeps source wallets, exact balances, request bodies, and raw proofs private.

After server-side zkTLS attestation verification, a deterministic verifier checks the redacted applicant proof and records the decision. 0G Storage anchors policy, proof metadata, audit memory, execution planning, and pass execution memory. KeeperHub executes the pass mint on a supported Sepolia target, and the receipt is bound back into the 0G audit trail. ENS publishes the event identity, while a GateAgent iNFT on 0G Galileo stores encrypted event intelligence and supports verifier-checked iClone and iTransfer operations.

## How It Is Made

The project is a browser RSVP studio, Node.js backend, and Solidity contract stack.

- Frontend: vanilla HTML/CSS/JS RSVP Studio with organizer and attendee roles plus an Onchain Records rail.
- Backend: Node.js API server that orchestrates 0G Compute, zkTLS proof verification, deterministic verification, 0G Storage, KeeperHub, ENS, and GateAgent operations.
- Contracts: Solidity registries and pass contracts, plus ERC-7857-style GateAgent contracts.
- Storage: 0G Storage for audit memory, proof metadata, workflow manifests, pass execution memory, and encrypted GateAgent metadata.
- Compute: 0G Compute for policy compilation from organizer intent.
- Execution: KeeperHub Direct Execution for receipt-gated pass minting.
- Identity: ENS event subnames and text records for public discovery and alignment checks.

## 0G Materials

0G Galileo deployment:

- EventRegistry: `0x1773fC52D7C64e3AF5C7dad31a28dF999d646f69`
- NullifierRegistry: `0x9D1D4d7c17E87679a27778B2Ba9c3034B94b0788`
- VerifierReceiptRegistry: `0xBC5d68c48014d9C8809a9dF34B03839c8a2A6De7`
- EventPassSBT: `0xC6E45721b7CD58e1FE301870DeE9614DFC1Dc120`
- GateAgentDataVerifier: `0xEAD5F31be0595C79CE56C25cCb7F39f1c4dF1Bf2`
- GateAgentINFT: `0xcD6c201A59F97291dabD45DA1456798D142F9f5e`

GateAgent iNFT proof:

- Mint tx: https://chainscan-galileo.0g.ai/tx/0x4e9b60f357a5fb3655e3ec1d4c7259848095fd6c5cc7ade4a7741d37c60fa30f
- iClone tx: https://chainscan-galileo.0g.ai/tx/0xf80aebe2492af84c4e19dc5805770951edbb2995c1723f8fe2ab3875de8e2690
- iTransfer tx: https://chainscan-galileo.0g.ai/tx/0x0d2957c2deb310d40467d3b2c4b59a027c147e0ba889bd7b48622769d585f6a0
- Minted encrypted metadata root: `0x2432176e14f3182645ff9fcc4e6502a7c6ec05d3e58ae559abdec9932f29bac4`
- Minted data root: `0xfc48322d7306463bb5269b92c41c6286602c2546d9383fa4887c0927d8f7c47c`

0G Storage proof artifact:

- `deployments/0g-galileo/storage-pointers.json`

## ENS Materials

VeriGate uses ENS for agent and event identity. The app publishes and resolves event-scoped text records under the VeriGate agent name, then verifies alignment against the current workflow.

Published record fields include:

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

This is not a hard-coded display: the frontend calls the backend ENS publisher/resolver, then checks resolved records against the live workflow state.

## KeeperHub Materials

KeeperHub is used for receipt-gated pass execution.

- KeeperHub calls `EventPassSBT.mintWithVerifiedReceipt(recipient, receiptId, tokenURI)`.
- The pass contract checks the verifier receipt and consumes the nullifier before minting.
- Pass recipient is a fresh browser-generated wallet, not the source ETH holder wallet.
- Execution id, transaction hash, transaction link, and receipt binding are written back to 0G Storage.

Sepolia KeeperHub execution target:

- EventRegistry: `0xc233c7cDCD2B9D5827beb5FafEf6B67752B2c34f`
- NullifierRegistry: `0x02741144c59870aD1CFa51b5D0b6dd97D27aabac`
- VerifierReceiptRegistry: `0x9aB41705c802C426dBdcFE377F5A96e76F4c51cb`
- EventPassSBT: `0xb283e3D15538529cf7D250663a4436695e8C928e`

Builder feedback is tracked in `docs/keeperhub-builder-feedback.md`.

Recorded demo transaction:

- https://sepolia.etherscan.io/tx/0x255887ca7c9e8c18c5f5df3c45eb3c2d9bcb23c3b75131e38acaa48a3006ee8a

## ENS Demo Material

Recorded demo ENS publish transaction:

- https://sepolia.etherscan.io/tx/0x58743fc9219a528bd084c20c7753da15912fbc2866b8c0ccab0f049e3603d4fa

## Recorded Demo GateAgent Material

- Demo GateAgent mint tx: https://chainscan-galileo.0g.ai/tx/0x9035ef8660ecc65426d852ac24c5210d66befb69e957686362007bd5ab30cc53
- Demo GateAgent iTransfer tx: https://chainscan-galileo.0g.ai/tx/0x3382e832328df0d7b1cbed98e1e22bafeeffa4748956aff559d097f7637de298

## Suggested Prize Targets

- 0G - Best Autonomous Agents, Swarms & iNFT Innovations
- 0G - Best Agent Framework, Tooling & Core Extensions
- ENS - Best ENS Integration for AI Agents
- ENS - Most Creative Use of ENS
- KeeperHub - Best Use of KeeperHub
- KeeperHub - Builder Feedback Bounty
