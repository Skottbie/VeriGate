# Sponsor Alignment

## 0G Chain

Status: implemented and deployed on 0G Galileo testnet.

The P2 gate settlement layer is deployed on 0G Chain with event policy anchoring, verifier receipt anchoring, nullifier replay protection, and soulbound event pass minting.

Deployment metadata: `deployments/0g-galileo/addresses.json`

## 0G Storage

Status: implemented and verified on 0G Galileo testnet.

The P3 gate memory layer writes event-scoped policy, compute receipt, audit record, execution receipt, and manifest objects to 0G Storage through the Turbo indexer. Each object is readable by root hash and recorded in a shared event namespace.

Storage metadata: `deployments/0g-galileo/storage-pointers.json`
