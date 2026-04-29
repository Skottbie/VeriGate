import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { network } from "hardhat";

const TARGETS = {
  ogGalileo: {
    networkName: "0G Galileo",
    outputDir: path.join("deployments", "0g-galileo"),
    requiredKey: "OG_PRIVATE_KEY",
  },
  sepolia: {
    networkName: "Sepolia",
    outputDir: path.join("deployments", "sepolia"),
    requiredKey: process.env.SEPOLIA_PRIVATE_KEY ? "SEPOLIA_PRIVATE_KEY" : "OG_PRIVATE_KEY",
  },
};

const targetName = process.env.DEPLOY_TARGET ?? process.argv[2] ?? "ogGalileo";
const target = TARGETS[targetName];
if (!target) {
  throw new Error(`Unsupported deploy target: ${targetName}`);
}
if (!process.env[target.requiredKey]) {
  throw new Error(`Set ${target.requiredKey} in .env before deploying to ${targetName}.`);
}

const outputPath = path.join(target.outputDir, "addresses.json");
const { ethers } = await network.create(targetName);
const [deployer] = await ethers.getSigners();

if (deployer === undefined) {
  throw new Error(`No deployer signer found for ${targetName}.`);
}

console.log(`Deploying VeriAgent Mesh gate contracts to ${target.networkName}`);
console.log("Deployer:", deployer.address);

const eventRegistry = await ethers.deployContract("EventRegistry");
await eventRegistry.waitForDeployment();

const nullifierRegistry = await ethers.deployContract("NullifierRegistry", [deployer.address]);
await nullifierRegistry.waitForDeployment();

const verifierReceiptRegistry = await ethers.deployContract("VerifierReceiptRegistry", [deployer.address]);
await verifierReceiptRegistry.waitForDeployment();

const eventPass = await ethers.deployContract("EventPassSBT", [
  "VeriGate Event Pass",
  "VGATE",
  await eventRegistry.getAddress(),
  await nullifierRegistry.getAddress(),
  await verifierReceiptRegistry.getAddress(),
]);
await eventPass.waitForDeployment();

await (await nullifierRegistry.setController(await eventPass.getAddress())).wait();

const deployment = {
  network: target.networkName,
  chainId: Number((await ethers.provider.getNetwork()).chainId),
  deployer: deployer.address,
  contracts: {
    EventRegistry: await eventRegistry.getAddress(),
    NullifierRegistry: await nullifierRegistry.getAddress(),
    VerifierReceiptRegistry: await verifierReceiptRegistry.getAddress(),
    EventPassSBT: await eventPass.getAddress(),
  },
  createdAt: new Date().toISOString(),
};

await mkdir(target.outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log("Deployment written to", outputPath);
