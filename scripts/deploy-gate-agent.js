import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { network } from "hardhat";

const targetName = process.env.DEPLOY_TARGET ?? "ogGalileo";
const outputDir = targetName === "sepolia"
  ? path.join("deployments", "sepolia")
  : path.join("deployments", "0g-galileo");
const outputPath = path.join(outputDir, "addresses.json");
const requiredKey = targetName === "sepolia" && process.env.SEPOLIA_PRIVATE_KEY
  ? "SEPOLIA_PRIVATE_KEY"
  : "OG_PRIVATE_KEY";

if (!process.env[requiredKey]) {
  throw new Error(`Set ${requiredKey} in .env before deploying GateAgent iNFT to ${targetName}.`);
}

const { ethers } = await network.create(targetName);
const [deployer] = await ethers.getSigners();
if (!deployer) {
  throw new Error(`No deployer signer found for ${targetName}.`);
}

console.log(`Deploying GateAgent iNFT contracts to ${targetName}`);
console.log("Deployer:", deployer.address);

let existing = {};
try {
  existing = JSON.parse(await readFile(outputPath, "utf8"));
} catch {
  existing = {};
}

const verifier = await ethers.deployContract("GateAgentDataVerifier", [deployer.address]);
await verifier.waitForDeployment();

const gateAgent = await ethers.deployContract("GateAgentINFT", [
  "VeriGate Agent iNFT",
  "VGAINFT",
  await verifier.getAddress(),
]);
await gateAgent.waitForDeployment();

const deployment = {
  ...existing,
  network: existing.network ?? (targetName === "sepolia" ? "Sepolia" : "0G Galileo"),
  chainId: Number((await ethers.provider.getNetwork()).chainId),
  deployer: existing.deployer ?? deployer.address,
  contracts: {
    ...(existing.contracts ?? {}),
    GateAgentDataVerifier: await verifier.getAddress(),
    GateAgentINFT: await gateAgent.getAddress(),
  },
  gateAgent: {
    attestor: deployer.address,
    standard: "ERC-7857",
    version: "p9-real-erc7857-gate-agent",
    deployedAt: new Date().toISOString(),
  },
};

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log("GateAgent deployment written to", outputPath);
