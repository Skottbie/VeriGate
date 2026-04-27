# VeriAgent Mesh

VeriAgent Mesh is open infrastructure for verifiable multi-agent task execution.

A user publishes a task, agents coordinate to complete it, and the system produces a public execution receipt with task inputs, agent outputs, evidence references, decentralized storage pointers, and onchain audit or settlement metadata.

This repository is being started fresh for ETHGlobal Open Agents 2026. The initial scope is intentionally small: one demonstrable agent task flow, sponsor-native integrations, and a clear proof receipt that makes agent work inspectable instead of opaque.

## Hackathon Direction

- Event: ETHGlobal Open Agents 2026
- Category: Infrastructure
- Project stage: Check-in #1 / initial design and implementation
- Primary sponsor targets: 0G, Gensyn AXL, KeeperHub

## MVP Goal

Build a minimal agent mesh where:

1. A user creates a task for open agents.
2. A planner dispatches work to worker agents.
3. Workers return outputs and evidence references.
4. The system stores an execution receipt and agent memory artifacts.
5. A verifier page shows what happened, who produced it, where the evidence lives, and whether any onchain execution or audit metadata exists.

## Planned Sponsor Integrations

### 0G

Use 0G as the decentralized data and memory layer for execution receipts, task artifacts, and agent output references.

### Gensyn AXL

Use AXL for agent-to-agent coordination so task dispatch and response are represented as an open multi-agent execution flow instead of a local function call.

### KeeperHub

Use KeeperHub for reliable execution or onchain follow-through, such as task settlement, receipt anchoring, or recurring verification jobs.

## Repository Status

This repository currently contains the initial planning and check-in materials. Implementation commits will follow after the MVP scope and sponsor integration order are finalized.
