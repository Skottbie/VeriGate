import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";

import { createEventMemoryNamespace, create0GStorageAdapter } from "../src/ogStorage.js";
import {
  validateAuditRecord,
  validateComputeReceipt,
  validateEligibilityPolicy,
  validateExecutionReceipt,
} from "../src/schemas.js";

dotenv.config();

const eventId = "open-agents-demo-gate";
const namespace = createEventMemoryNamespace(eventId);
const outputDir = path.join("deployments", "0g-galileo");
const outputPath = path.join(outputDir, "storage-pointers.json");
const fixtureDir = "fixtures/memory";

const memoryObjects = [
  ["policy", "eligibility-policy.json", validateEligibilityPolicy],
  ["compute-receipts", "compute-receipt.json", validateComputeReceipt],
  ["audit", "audit-record.json", validateAuditRecord],
  ["execution", "execution-receipt.json", validateExecutionReceipt],
];

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readFixture(fileName) {
  return JSON.parse(await readFile(path.join(fixtureDir, fileName), "utf8"));
}

async function readWithRetry(adapter, pointer, expectedKind) {
  const maxAttempts = Number.parseInt(process.env.OG_STORAGE_READ_ATTEMPTS ?? "20", 10);
  const delayMs = Number.parseInt(process.env.OG_STORAGE_READ_DELAY_MS ?? "15000", 10);
  let lastError;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const downloaded = await adapter.downloadJson(pointer, { proof: true });
      if (downloaded.kind !== expectedKind) {
        throw new Error(`expected kind ${expectedKind}, got ${downloaded.kind}`);
      }
      if (downloaded.namespace !== namespace) {
        throw new Error(`expected namespace ${namespace}, got ${downloaded.namespace}`);
      }
      return downloaded;
    } catch (error) {
      lastError = error;
      if (attempt < maxAttempts) {
        console.log(`Waiting for 0G Storage propagation: ${expectedKind} attempt ${attempt}/${maxAttempts}`);
        await sleep(delayMs);
      }
    }
  }

  throw lastError;
}

const adapter = create0GStorageAdapter();
const pointers = {};

console.log("Uploading P3 gate memory objects to 0G Storage");
for (const [kind, fixtureName, validate] of memoryObjects) {
  const object = await readFixture(fixtureName);
  validate(object);
  const pointer = await adapter.uploadJson({
    eventId,
    namespace,
    kind,
    object,
    uploadOptions: {
      onProgress: (message) => console.log(`${kind}: ${message}`),
    },
  });
  pointers[kind] = pointer;
  console.log(`${kind}: root=${pointer.rootHash} tx=${pointer.txHash}`);
}

const manifestObject = {
  eventId,
  namespace,
  schemaVersion: 1,
  pointers,
};
const manifestPointer = await adapter.uploadJson({
  eventId,
  namespace,
  kind: "manifest",
  object: manifestObject,
  uploadOptions: {
    onProgress: (message) => console.log(`manifest: ${message}`),
  },
});
pointers.manifest = manifestPointer;
console.log(`manifest: root=${manifestPointer.rootHash} tx=${manifestPointer.txHash}`);

for (const [kind, pointer] of Object.entries(pointers)) {
  await readWithRetry(adapter, pointer, kind);
  console.log(`${kind}: readable`);
}

const output = {
  network: "0G Galileo",
  eventId,
  namespace,
  indexerRpc: adapter.indexerRpc,
  pointers,
  createdAt: new Date().toISOString(),
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(output, null, 2)}\n`);

console.log(`0G Storage pointers written to ${outputPath}`);
