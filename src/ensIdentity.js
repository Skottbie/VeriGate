import { ethers } from "ethers";

export const DEFAULT_AGENT_ENS_NAME = "verigate-agent.eth";
export const DEFAULT_ENS_NETWORK = "sepolia";
export const DEFAULT_SEPOLIA_RPC_URL = "https://ethereum-sepolia-rpc.publicnode.com";
export const SEPOLIA_ENS_REGISTRY = "0x00000000000C2E074eC69A0dFb2997BA6C7d2e1e";
export const SEPOLIA_PUBLIC_RESOLVER = "0xE99638b40E4Fff0129D56f03b55b6bbC4BBE49b5";
export const ENS_TEXT_KEYS = [
  "agent.name",
  "agent.version",
  "event.id",
  "event.name",
  "event.policyHash",
  "event.verifier",
  "event.passContract",
  "event.auditPointer",
  "event.appUrl",
  "event.proofHash",
  "event.nullifier",
];

export function buildEventEnsLabel(policy) {
  const source = policy?.policyId || policy?.eventName;
  if (typeof source !== "string" || source.length === 0) {
    throw new TypeError("policy.policyId or policy.eventName is required");
  }

  const label = source
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 63)
    .replace(/-+$/g, "");

  if (label.length === 0) {
    throw new Error("policy did not produce a valid ENS event label");
  }
  return label;
}

export function buildEventEnsName({ policy, agentName = DEFAULT_AGENT_ENS_NAME } = {}) {
  assertEnsName(agentName, "agentName");
  return `${buildEventEnsLabel(policy)}.${agentName.toLowerCase()}`;
}

export function buildEnsIdentityPayload({
  policy,
  verificationResult,
  agentName = DEFAULT_AGENT_ENS_NAME,
  auditPointer,
  appUrl,
  passContract = "pending:phase-8-pass-contract",
  verifierAddress = policy?.organizer,
  agentVersion,
} = {}) {
  if (!policy) {
    throw new TypeError("policy is required");
  }
  assertEnsName(agentName, "agentName");
  const eventName = buildEventEnsName({ policy, agentName });
  const proofHash = verificationResult?.proofHash;
  const eventNullifier = verificationResult?.eventNullifier;
  const textRecords = buildEnsTextRecords({
    policy,
    verificationResult,
    auditPointer,
    appUrl,
    passContract,
    verifierAddress,
    agentVersion,
  });

  return {
    network: DEFAULT_ENS_NETWORK,
    agentName: agentName.toLowerCase(),
    eventName,
    eventLabel: buildEventEnsLabel(policy),
    node: ethers.namehash(eventName),
    parentNode: ethers.namehash(agentName),
    proofHash,
    eventNullifier,
    textRecords,
  };
}

export function buildEnsTextRecords({
  policy,
  verificationResult,
  auditPointer,
  appUrl,
  passContract = "pending:phase-8-pass-contract",
  verifierAddress = policy?.organizer,
  agentVersion = policy?.metadata?.agentVersion,
} = {}) {
  if (!policy) {
    throw new TypeError("policy is required");
  }

  const records = {
    "agent.name": "VeriGate Agent",
    "agent.version": agentVersion ?? "unknown",
    "event.id": policy.policyId,
    "event.name": policy.eventName,
    "event.policyHash": policy.metadata?.policyHash ?? "",
    "event.verifier": verifierAddress ?? "",
    "event.passContract": passContract,
    "event.auditPointer": auditPointer ?? "",
    "event.appUrl": appUrl ?? "",
  };
  if (verificationResult?.proofHash) {
    records["event.proofHash"] = verificationResult.proofHash;
  }
  if (verificationResult?.eventNullifier) {
    records["event.nullifier"] = verificationResult.eventNullifier;
  }
  return records;
}

export function validateEnsRecordAlignment({ payload, resolvedTextRecords } = {}) {
  if (!payload || !resolvedTextRecords) {
    throw new TypeError("payload and resolvedTextRecords are required");
  }
  const expected = payload.textRecords;
  const checks = [
    "event.policyHash",
    "event.auditPointer",
    "event.verifier",
    "event.appUrl",
  ];

  return checks.map((key) => ({
    key,
    expected: expected[key],
    actual: resolvedTextRecords[key] ?? null,
    matches: Boolean(expected[key]) && resolvedTextRecords[key] === expected[key],
  }));
}

export function createEnsResolverAdapter({
  provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL ?? DEFAULT_SEPOLIA_RPC_URL),
} = {}) {
  return {
    async resolveIdentity({ name, textKeys = ENS_TEXT_KEYS } = {}) {
      assertEnsName(name, "name");
      const resolver = await provider.getResolver(name);
      if (!resolver) {
        return {
          name,
          exists: false,
          address: null,
          textRecords: {},
          error: "ENS resolver not found",
        };
      }

      const textRecords = {};
      for (const key of textKeys) {
        try {
          const value = await resolver.getText(key);
          if (value) {
            textRecords[key] = value;
          }
        } catch {
          // Missing text records are expected while a test name is being configured.
        }
      }

      return {
        name,
        exists: true,
        address: await resolver.getAddress().catch(() => null),
        resolverAddress: resolver.address,
        textRecords,
      };
    },
  };
}

export async function publishEnsTextRecords({
  name,
  records,
  rpcUrl = process.env.SEPOLIA_RPC_URL ?? DEFAULT_SEPOLIA_RPC_URL,
  privateKey = process.env.SEPOLIA_PRIVATE_KEY ?? process.env.OG_PRIVATE_KEY,
  address,
} = {}) {
  assertEnsName(name, "name");
  if (!records || typeof records !== "object") {
    throw new TypeError("records must be an object");
  }
  if (!privateKey) {
    throw new Error("SEPOLIA_PRIVATE_KEY or OG_PRIVATE_KEY is required to publish ENS records");
  }

  const provider = new ethers.JsonRpcProvider(rpcUrl);
  const wallet = new ethers.Wallet(privateKey, provider);
  const resolverAddress = await ensureWritableResolver({ name, provider, wallet });
  const contract = new ethers.Contract(
    resolverAddress,
    [
      "function setAddr(bytes32 node,address addr) external",
      "function setText(bytes32 node,string calldata key,string calldata value) external",
      "function multicall(bytes[] calldata data) external returns (bytes[] memory results)",
    ],
    wallet,
  );
  const node = ethers.namehash(name);

  const entries = Object.entries(records).filter(
    ([, value]) => typeof value === "string" && value.length > 0,
  );
  const addressRecord = address ?? wallet.address;

  const calls = [
    contract.interface.encodeFunctionData("setAddr", [node, addressRecord]),
    ...entries.map(([key, value]) =>
      contract.interface.encodeFunctionData("setText", [node, key, value]),
    ),
  ];

  if (calls.length === 0) {
    return { name, resolverAddress, txs: [] };
  }

  const txEntries = [
    { key: "addr", value: addressRecord },
    ...entries.map(([key, value]) => ({ key, value })),
  ];

  try {
    const tx = await contract.multicall(calls);
    await tx.wait();
    return {
      name,
      resolverAddress,
      txs: txEntries.map(({ key, value }) => ({ key, value, txHash: tx.hash })),
      multicall: true,
    };
  } catch {
    const txs = [];
    const addrTx = await contract.setAddr(node, addressRecord);
    txs.push({ key: "addr", value: addressRecord, txHash: addrTx.hash });
    await addrTx.wait();
    for (const [key, value] of entries) {
      const tx = await contract.setText(node, key, value);
      txs.push({ key, value, txHash: tx.hash });
      await tx.wait();
    }
    return { name, resolverAddress, txs, multicall: false };
  }
}

async function ensureWritableResolver({ name, provider, wallet }) {
  const resolver = await provider.getResolver(name);
  if (resolver) {
    return resolver.address;
  }

  const labels = name.toLowerCase().split(".");
  if (labels.length < 3) {
    throw new Error(`ENS resolver not found for ${name}`);
  }

  const [eventLabel, ...parentLabels] = labels;
  const parentName = parentLabels.join(".");
  const registry = new ethers.Contract(
    SEPOLIA_ENS_REGISTRY,
    [
      "function owner(bytes32 node) view returns (address)",
      "function resolver(bytes32 node) view returns (address)",
      "function setResolver(bytes32 node,address resolver) external",
      "function setSubnodeRecord(bytes32 node,bytes32 label,address owner,address resolver,uint64 ttl) external",
    ],
    wallet,
  );
  const parentNode = ethers.namehash(parentName);
  const parentOwner = await registry.owner(parentNode);
  if (parentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(
      `ENS resolver not found for ${name}; ${wallet.address} does not own parent ${parentName}`,
    );
  }

  const node = ethers.namehash(name);
  const currentOwner = await registry.owner(node);
  if (currentOwner === ethers.ZeroAddress) {
    const tx = await registry.setSubnodeRecord(
      parentNode,
      ethers.id(eventLabel),
      wallet.address,
      SEPOLIA_PUBLIC_RESOLVER,
      0,
    );
    await tx.wait();
    return SEPOLIA_PUBLIC_RESOLVER;
  }

  if (currentOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`ENS resolver not found for ${name}; subname is owned by ${currentOwner}`);
  }

  const currentResolver = await registry.resolver(node);
  if (currentResolver !== ethers.ZeroAddress) {
    return currentResolver;
  }

  const tx = await registry.setResolver(node, SEPOLIA_PUBLIC_RESOLVER);
  await tx.wait();
  return SEPOLIA_PUBLIC_RESOLVER;
}

function assertEnsName(name, field) {
  if (typeof name !== "string" || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(name.toLowerCase())) {
    throw new TypeError(`${field} must be an ENS name`);
  }
}
