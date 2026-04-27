# MVP Design Notes

## Product Thesis

Open agents need more than chat logs. They need receipts: compact, inspectable records of what an agent was asked to do, what it did, which evidence it used, where artifacts are stored, and what onchain actions followed.

VeriAgent Mesh focuses on turning agent work into verifiable execution receipts.

## Core User Story

As a user, I publish a task to an open agent mesh. The mesh routes the task to one or more agents, records their outputs, stores the evidence, and gives me a public receipt that another user or verifier can inspect.

## Minimal Demo Flow

1. Create task.
2. Dispatch task through an agent coordination layer.
3. Collect worker output and evidence metadata.
4. Build an execution receipt.
5. Store receipt and artifacts.
6. Show a verifier page.
7. Optionally trigger onchain audit or settlement.

## Non-goals for the Initial MVP

- Full marketplace economics.
- Production-grade reputation scoring.
- Complex privacy proofs.
- Multiple real financial execution paths.
- A broad agent framework rewrite.

## Initial Data Model Sketch

```json
{
  "taskId": "string",
  "taskPrompt": "string",
  "createdAt": "iso8601",
  "planner": {
    "id": "string",
    "transport": "axl | local-dev"
  },
  "workers": [
    {
      "id": "string",
      "role": "string",
      "outputHash": "string",
      "evidence": []
    }
  ],
  "storage": {
    "provider": "0g",
    "receiptUri": "string",
    "artifactUris": []
  },
  "onchain": {
    "provider": "keeperhub | none",
    "chainId": "string",
    "txHash": "string"
  },
  "status": "created | dispatched | completed | anchored | failed"
}
```
