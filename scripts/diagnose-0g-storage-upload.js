import dotenv from "dotenv";

import { create0GStorageAdapter } from "../src/ogStorage.js";

dotenv.config();

const eventId = "open-agents-storage-diagnostic";
const namespace = `verigate/diagnostic/${Date.now()}`;
const hardTimeoutMs = Number.parseInt(process.env.OG_STORAGE_UPLOAD_TIMEOUT_MS ?? "90000", 10);

let lastProgress = "script started";
const startedAt = Date.now();
const hardTimer = setTimeout(() => {
  console.error(`TIMEOUT after ${hardTimeoutMs}ms; lastProgress=${lastProgress}`);
  process.exit(124);
}, hardTimeoutMs);

function mark(message) {
  lastProgress = message;
  console.log(`[+${Date.now() - startedAt}ms] ${message}`);
}

try {
  const adapter = create0GStorageAdapter();
  mark(`adapter ready indexer=${adapter.indexerRpc}`);

  const pointer = await adapter.uploadJson({
    eventId,
    namespace,
    kind: "diagnostic",
    object: {
      eventId,
      probe: true,
      schemaVersion: 1,
    },
    uploadOptions: {
      onProgress: (message) => mark(`sdk: ${message}`),
    },
  });

  mark(`upload returned root=${pointer.rootHash} tx=${pointer.txHash}`);

  const downloaded = await adapter.downloadJson(pointer, { proof: true });
  mark(`download returned kind=${downloaded.kind} namespace=${downloaded.namespace}`);

  clearTimeout(hardTimer);
  console.log(JSON.stringify({ ok: true, pointer }, null, 2));
} catch (error) {
  clearTimeout(hardTimer);
  console.error(`FAILED lastProgress=${lastProgress}`);
  console.error(error);
  process.exit(1);
}
