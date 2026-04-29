import { createWriteStream } from "node:fs";
import { mkdir, stat, copyFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";
import { pipeline } from "node:stream/promises";

const require = createRequire(import.meta.url);

const { GIT_COMMIT_HASH } = require("@reclaimprotocol/zk-symmetric-crypto/lib/config.js");

const REQUIRED_FILES = [
  "snarkjs/chacha20/circuit.wasm",
  "snarkjs/chacha20/circuit_final.zkey",
];

const TARGET_DIRS = [
  join(process.cwd(), "node_modules", "@reclaimprotocol", "zk-symmetric-crypto", "resources"),
  join(
    process.cwd(),
    "node_modules",
    "@reclaimprotocol",
    "attestor-core",
    "node_modules",
    "@reclaimprotocol",
    "zk-symmetric-crypto",
    "resources",
  ),
];

for (const file of REQUIRED_FILES) {
  await installFile(file);
}

console.log("Reclaim chacha20 zk resources are ready.");

async function installFile(relativePath) {
  const primaryTarget = join(TARGET_DIRS[0], relativePath);
  if (await existsWithBytes(primaryTarget)) {
    console.log(`exists ${relativePath}`);
  } else {
    await downloadFile(relativePath, primaryTarget);
  }

  for (const targetDir of TARGET_DIRS.slice(1)) {
    const target = join(targetDir, relativePath);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(primaryTarget, target);
    console.log(`synced ${relativePath} -> ${targetDir}`);
  }
}

async function downloadFile(relativePath, targetPath) {
  const url = `https://github.com/reclaimprotocol/zk-symmetric-crypto/raw/${GIT_COMMIT_HASH}/resources/${relativePath}`;
  await mkdir(dirname(targetPath), { recursive: true });
  console.log(`download ${relativePath}`);

  const response = await fetch(url, {
    redirect: "follow",
    headers: {
      "User-Agent": "verigate-reclaim-resource-setup/1.0",
    },
  });
  if (!response.ok || !response.body) {
    throw new Error(`failed to download ${relativePath}: HTTP ${response.status}`);
  }

  await pipeline(response.body, createWriteStream(targetPath));
  if (!await existsWithBytes(targetPath)) {
    throw new Error(`downloaded empty file: ${relativePath}`);
  }
}

async function existsWithBytes(path) {
  try {
    const info = await stat(path);
    return info.isFile() && info.size > 0;
  } catch {
    return false;
  }
}
