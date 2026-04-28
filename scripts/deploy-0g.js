import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

import { network } from "hardhat";

const outputDir = path.join("deployments", "0g-galileo");
const outputPath = path.join(outputDir, "addresses.json");

if (!process.env.OG_PRIVATE_KEY) {
  throw new Error("Set OG_PRIVATE_KEY in .env before running deploy:0g.");
}

const { ethers } = await network.create("ogGalileo");
const [deployer] = await ethers.getSigners();

if (deployer === undefined) {
  throw new Error("No deployer signer found after loading OG_PRIVATE_KEY.");
}

console.log("Deploying VeriAgent Mesh P2 contracts to 0G Galileo");
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
  network: "0G Galileo",
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

await mkdir(outputDir, { recursive: true });
await writeFile(outputPath, `${JSON.stringify(deployment, null, 2)}\n`);

console.log("Deployment written to", outputPath);
