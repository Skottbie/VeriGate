import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import dotenv from "dotenv";
import { DEFAULT_ORGANIZER_INTENT, runVeriGateDryRun, summarizeDryRun } from "./tools.js";

dotenv.config({ quiet: true });

const outputDir = path.join("cache", "openclaw");
const outputPath = path.join(outputDir, "verigate-dry-run-session.json");

const organizerIntent = process.argv.slice(2).join(" ").trim() || DEFAULT_ORGANIZER_INTENT;
const result = await runVeriGateDryRun({ organizerIntent });
const summary = summarizeDryRun(result);

if (summary.approved !== true) {
  throw new Error(`dry-run verifier did not approve fixture: ${summary.reasonCode}`);
}

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`);

console.log(JSON.stringify({
  ok: true,
  outputPath,
  ...summary,
}, null, 2));
