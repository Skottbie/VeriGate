import dotenv from "dotenv";
import { ethers } from "ethers";

import {
  DEFAULT_AGENT_ENS_NAME,
  buildEnsIdentityPayload,
} from "../src/index.js";

dotenv.config({ quiet: true });

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL ?? "https://ethereum-sepolia-rpc.publicnode.com";
const PRIVATE_KEY = process.env.SEPOLIA_PRIVATE_KEY ?? process.env.OG_PRIVATE_KEY;
const AGENT_NAME = process.env.ENS_AGENT_NAME ?? DEFAULT_AGENT_ENS_NAME;
const DURATION = BigInt(process.env.ENS_REGISTRATION_DURATION ?? 365 * 24 * 60 * 60);
const CONTROLLER = "0xfb3cE5D01e0f33f41DbB39035dB9745962F1f968";
const REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
const PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";

if (!PRIVATE_KEY) {
  throw new Error("SEPOLIA_PRIVATE_KEY or OG_PRIVATE_KEY is required");
}

const provider = new ethers.JsonRpcProvider(SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(PRIVATE_KEY, provider);

const controller = new ethers.Contract(CONTROLLER, [
  "function available(string name) view returns (bool)",
  "function rentPrice(string name,uint256 duration) view returns (uint256 base,uint256 premium)",
  "function minCommitmentAge() view returns (uint256)",
  "function makeCommitment(string name,address owner,uint256 duration,bytes32 secret,address resolver,bytes[] data,bool reverseRecord,uint16 ownerControlledFuses) pure returns (bytes32)",
  "function makeCommitment((string label,address owner,uint256 duration,bytes32 secret,address resolver,bytes[] data,uint8 reverseRecord,bytes32 referrer) registration) pure returns (bytes32)",
  "function commit(bytes32 commitment) external",
  "function register(string name,address owner,uint256 duration,bytes32 secret,address resolver,bytes[] data,bool reverseRecord,uint16 ownerControlledFuses) payable",
  "function register((string label,address owner,uint256 duration,bytes32 secret,address resolver,bytes[] data,uint8 reverseRecord,bytes32 referrer) registration) payable",
], wallet);

const registry = new ethers.Contract(REGISTRY, [
  "function owner(bytes32 node) view returns (address)",
  "function resolver(bytes32 node) view returns (address)",
  "function setResolver(bytes32 node,address resolver) external",
  "function setSubnodeRecord(bytes32 node,bytes32 label,address owner,address resolver,uint64 ttl) external",
], wallet);

const resolver = new ethers.Contract(PUBLIC_RESOLVER, [
  "function setText(bytes32 node,string calldata key,string calldata value) external",
  "function setAddr(bytes32 node,address addr) external",
], wallet);

const policy = {
  policyId: process.env.TEST_ENS_POLICY_ID ?? "AI_AGENT_BUILDER_GATE",
  eventName: process.env.TEST_ENS_EVENT_NAME ?? "AI Agent Builder Gathering",
  organizer: wallet.address,
  requiredClaims: ["ETH_HOLDER"],
  privacy: {
    revealWalletAddress: false,
    revealExactBalance: false,
    revealWalletBreakdown: false,
    disclosureMode: "tier_only",
  },
  antiSybil: {
    enabled: true,
    nullifierScope: "event",
  },
  execution: {
    onPass: "mint_rsvp_pass",
    executor: "keeperhub",
  },
  metadata: {
    verifierVersion: "p1-deterministic-verifier",
    agentVersion: "p7-ens-identity",
    createdAt: new Date().toISOString(),
    policyHash: process.env.TEST_ENS_POLICY_HASH
      ?? "0x53edcc87b9990e70177a2fe47a432860598d1cdb63d835cde6777246bb377ea9",
  },
};

const payload = buildEnsIdentityPayload({
  policy,
  agentName: AGENT_NAME,
  auditPointer: process.env.TEST_ENS_AUDIT_POINTER ?? "0G://pending-audit-pointer",
  appUrl: process.env.VERIGATE_APP_URL ?? "http://localhost:4173",
});

const label = AGENT_NAME.toLowerCase().replace(/\.eth$/, "");
if (!/^[a-z0-9-]+$/.test(label)) {
  throw new Error("setup script currently supports .eth second-level names only");
}

console.log(JSON.stringify({
  step: "balance",
  wallet: wallet.address,
  balanceEth: ethers.formatEther(await provider.getBalance(wallet.address)),
}, null, 2));

await ensureParentName(label);
await ensureAgentRecords(payload);
await ensureEventSubname(payload);
await ensureEventRecords(payload);

console.log(JSON.stringify({
  ok: true,
  agentName: payload.agentName,
  eventName: payload.eventName,
  node: payload.node,
  parentNode: payload.parentNode,
}, null, 2));

async function ensureParentName(label) {
  const available = await controller.available(label);
  if (!available) {
    console.log(JSON.stringify({ step: "register_parent", status: "already_registered", name: `${label}.eth` }));
    return;
  }

  const secret = ethers.hexlify(ethers.randomBytes(32));
  const registration = makeRegistration(label, secret);
  const commitment = await controller[
    "makeCommitment((string,address,uint256,bytes32,address,bytes[],uint8,bytes32))"
  ](registration);
  const commitTx = await controller.commit(commitment);
  console.log(JSON.stringify({ step: "commit", txHash: commitTx.hash }));
  await commitTx.wait();

  const minAge = await controller.minCommitmentAge();
  const waitMs = Number(minAge + 5n) * 1000;
  console.log(JSON.stringify({ step: "wait_commitment", seconds: waitMs / 1000 }));
  await new Promise((resolve) => setTimeout(resolve, waitMs));

  const price = await controller.rentPrice(label, DURATION);
  const value = ((price.base + price.premium) * 120n) / 100n;
  const registerTx = await controller[
    "register((string,address,uint256,bytes32,address,bytes[],uint8,bytes32))"
  ](registration, { value });
  console.log(JSON.stringify({
    step: "register",
    txHash: registerTx.hash,
    valueEth: ethers.formatEther(value),
  }));
  await registerTx.wait();
}

async function ensureAgentRecords(payload) {
  const node = ethers.namehash(payload.agentName);
  await ensureResolver(node, "agent_resolver");
  await send("agent_addr", () => resolver.setAddr(node, wallet.address));
  await send("agent_text_agent.name", () => resolver.setText(node, "agent.name", "VeriGate Agent"));
  await send("agent_text_agent.version", () => resolver.setText(node, "agent.version", "p7-ens-identity"));
}

async function ensureEventSubname(payload) {
  const currentOwner = await registry.owner(payload.node);
  if (currentOwner.toLowerCase() === wallet.address.toLowerCase()) {
    console.log(JSON.stringify({ step: "event_subname", status: "already_owned", name: payload.eventName }));
    return;
  }

  const tx = await registry.setSubnodeRecord(
    payload.parentNode,
    ethers.id(payload.eventLabel),
    wallet.address,
    PUBLIC_RESOLVER,
    0,
  );
  console.log(JSON.stringify({ step: "event_subname", txHash: tx.hash, name: payload.eventName }));
  await tx.wait();
}

async function ensureEventRecords(payload) {
  const node = payload.node;
  await ensureResolver(node, "event_resolver");
  await send("event_addr", () => resolver.setAddr(node, wallet.address));
  for (const [key, value] of Object.entries(payload.textRecords)) {
    if (typeof value === "string" && value.length > 0) {
      await send(`event_text_${key}`, () => resolver.setText(node, key, value));
    }
  }
}

function makeRegistration(label, secret) {
  return {
    label,
    owner: wallet.address,
    duration: DURATION,
    secret,
    resolver: PUBLIC_RESOLVER,
    data: [],
    reverseRecord: 0,
    referrer: ethers.ZeroHash,
  };
}

async function ensureResolver(node, step) {
  const currentResolver = await registry.resolver(node);
  if (currentResolver.toLowerCase() === PUBLIC_RESOLVER.toLowerCase()) {
    console.log(JSON.stringify({ step, status: "already_set", resolver: currentResolver }));
    return;
  }
  await send(step, () => registry.setResolver(node, PUBLIC_RESOLVER));
}

async function send(step, fn) {
  const tx = await fn();
  console.log(JSON.stringify({ step, txHash: tx.hash }));
  await tx.wait();
}
