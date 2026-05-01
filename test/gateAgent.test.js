import { expect } from "chai";
import { ethers as ethersLib } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.create();
const coder = ethersLib.AbiCoder.defaultAbiCoder();
const RECEIPT_TYPE = "tuple(bytes32 oldDataHash,bytes32 newDataHash,string oldMetadataURI,string newMetadataURI,string[] dataDescriptions,bytes32[] dataHashes,address from,address to,uint256 tokenId,uint256 expiresAt,bytes32 nonce,string attestationURI,bytes signature)";
const RECEIPT_TYPEHASH = ethersLib.keccak256(ethersLib.toUtf8Bytes(
  "GateAgentTransferReceipt(bytes32 oldDataHash,bytes32 newDataHash,string oldMetadataURI,string newMetadataURI,address from,address to,uint256 tokenId,uint256 expiresAt,bytes32 nonce,string attestationURI)",
));

function id(value) {
  return ethersLib.id(value);
}

async function deployGateAgent() {
  const [organizer, executor, recipient, stranger, attestor] = await ethers.getSigners();
  const verifier = await ethers.deployContract("GateAgentDataVerifier", [attestor.address]);
  const gateAgent = await ethers.deployContract("GateAgentINFT", [
    "VeriGate Agent iNFT",
    "VGAINFT",
    await verifier.getAddress(),
  ]);
  return { organizer, executor, recipient, stranger, attestor, verifier, gateAgent };
}

function makeData(suffix = "v1") {
  return [
    { dataDescription: "gate.policy", dataHash: id(`policy-${suffix}`) },
    { dataDescription: "gate.memory", dataHash: id(`memory-${suffix}`) },
    { dataDescription: "gate.executionPolicy", dataHash: id(`execution-${suffix}`) },
    { dataDescription: "gate.agentProfile", dataHash: id(`profile-${suffix}`) },
  ];
}

async function signReceipt({
  gateAgent,
  attestor,
  oldDataHash,
  oldMetadataURI,
  newMetadataURI,
  data,
  from,
  to,
  tokenId,
  nonce = id(`nonce-${Date.now()}`),
  expiresAt,
  attestationURI = "0G://transfer-attestation",
}) {
  const descriptions = data.map((item) => item.dataDescription);
  const dataHashes = data.map((item) => item.dataHash);
  const newDataHash = await gateAgent.computeDataRoot(data, newMetadataURI);
  const digest = ethersLib.keccak256(coder.encode(
    [
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "bytes32",
      "address",
      "address",
      "uint256",
      "uint256",
      "bytes32",
      "bytes32",
    ],
    [
      RECEIPT_TYPEHASH,
      oldDataHash,
      newDataHash,
      ethersLib.keccak256(ethersLib.toUtf8Bytes(oldMetadataURI)),
      ethersLib.keccak256(ethersLib.toUtf8Bytes(newMetadataURI)),
      from,
      to,
      tokenId,
      expiresAt,
      nonce,
      ethersLib.keccak256(ethersLib.toUtf8Bytes(attestationURI)),
    ],
  ));
  const signature = await attestor.signMessage(ethersLib.getBytes(digest));
  const receipt = {
    oldDataHash,
    newDataHash,
    oldMetadataURI,
    newMetadataURI,
    dataDescriptions: descriptions,
    dataHashes,
    from,
    to,
    tokenId,
    expiresAt,
    nonce,
    attestationURI,
    signature,
  };
  const encodedReceipt = coder.encode([RECEIPT_TYPE], [receipt]);
  return {
    accessProof: {
      oldDataHash,
      newDataHash,
      nonce: ethersLib.randomBytes(32),
      encryptedPubKey: "0x",
      proof: "0x",
    },
    ownershipProof: {
      oracleType: 0,
      oldDataHash,
      newDataHash,
      sealedKey: "0x1234",
      encryptedPubKey: "0x",
      nonce: ethersLib.randomBytes(32),
      proof: encodedReceipt,
    },
  };
}

describe("P9 real ERC-7857 GateAgent iNFT", function () {
  it("mints a GateAgent iNFT with 0G encrypted metadata and authorized executor", async function () {
    const stack = await deployGateAgent();
    const metadataURI = "0G://gate-agent/encrypted-v1";
    const data = makeData();

    await expect(
      stack.gateAgent.mintGateAgent(
        stack.organizer.address,
        id("event-v1"),
        id("policy-v1"),
        id("memory-v1"),
        metadataURI,
        data,
        [stack.executor.address],
      ),
    )
      .to.emit(stack.gateAgent, "GateAgentMinted")
      .withArgs(
        1n,
        stack.organizer.address,
        id("event-v1"),
        id("policy-v1"),
        id("memory-v1"),
        await stack.gateAgent.computeDataRoot(data, metadataURI),
        metadataURI,
      );

    expect(await stack.gateAgent.ownerOf(1)).to.equal(stack.organizer.address);
    expect(await stack.gateAgent.encryptedMetadataURIOf(1)).to.equal(metadataURI);
    expect(await stack.gateAgent.authorizedUsersOf(1)).to.deep.equal([stack.executor.address]);
    expect(await stack.gateAgent.assertAuthorizedUsage(1, stack.executor.address)).to.equal(true);
    await expect(
      stack.gateAgent.assertAuthorizedUsage(1, stack.stranger.address),
    ).to.be.revertedWithCustomError(stack.gateAgent, "UnauthorizedExecutor");
  });

  it("updates owner and encrypted intelligence through verifier-checked iTransfer", async function () {
    const stack = await deployGateAgent();
    const metadataURI = "0G://gate-agent/encrypted-v1";
    const data = makeData();
    await stack.gateAgent.mintGateAgent(
      stack.organizer.address,
      id("event-transfer"),
      id("policy-transfer"),
      id("memory-transfer"),
      metadataURI,
      data,
      [stack.executor.address],
    );

    const oldDataHash = (await stack.gateAgent.gateAgentRecord(1)).dataRoot;
    const nextData = makeData("v2");
    const nextMetadataURI = "0G://gate-agent/encrypted-v2";
    const latest = await ethers.provider.getBlock("latest");
    const proof = await signReceipt({
      gateAgent: stack.gateAgent,
      attestor: stack.attestor,
      oldDataHash,
      oldMetadataURI: metadataURI,
      newMetadataURI: nextMetadataURI,
      data: nextData,
      from: stack.organizer.address,
      to: stack.recipient.address,
      tokenId: 1,
      expiresAt: latest.timestamp + 3600,
      nonce: id("transfer-proof-v1"),
    });

    await expect(
      stack.gateAgent.iTransfer(stack.recipient.address, 1, [proof]),
    )
      .to.emit(stack.gateAgent, "Transferred")
      .withArgs(1n, stack.organizer.address, stack.recipient.address);

    expect(await stack.gateAgent.ownerOf(1)).to.equal(stack.recipient.address);
    expect(await stack.gateAgent.encryptedMetadataURIOf(1)).to.equal(nextMetadataURI);
    const record = await stack.gateAgent.gateAgentRecord(1);
    expect(record.dataRoot).to.equal(await stack.gateAgent.computeDataRoot(nextData, nextMetadataURI));

    await expect(
      stack.gateAgent.connect(stack.recipient).iTransfer(stack.stranger.address, 1, [proof]),
    ).to.be.revertedWithCustomError(stack.verifier, "ProofAlreadyUsed");
  });

  it("clones a GateAgent iNFT into a new token with independent encrypted metadata", async function () {
    const stack = await deployGateAgent();
    const metadataURI = "0G://gate-agent/encrypted-source";
    const data = makeData("source");
    await stack.gateAgent.mintGateAgent(
      stack.organizer.address,
      id("event-clone"),
      id("policy-clone"),
      id("memory-clone"),
      metadataURI,
      data,
      [stack.executor.address],
    );

    const oldDataHash = (await stack.gateAgent.gateAgentRecord(1)).dataRoot;
    const cloneData = makeData("clone");
    const cloneMetadataURI = "0G://gate-agent/encrypted-clone";
    const latest = await ethers.provider.getBlock("latest");
    const proof = await signReceipt({
      gateAgent: stack.gateAgent,
      attestor: stack.attestor,
      oldDataHash,
      oldMetadataURI: metadataURI,
      newMetadataURI: cloneMetadataURI,
      data: cloneData,
      from: stack.organizer.address,
      to: stack.stranger.address,
      tokenId: 1,
      expiresAt: latest.timestamp + 3600,
      nonce: id("clone-proof-v1"),
    });

    await expect(stack.gateAgent.iClone(stack.stranger.address, 1, [proof]))
      .to.emit(stack.gateAgent, "Cloned")
      .withArgs(1n, 2n, stack.organizer.address, stack.stranger.address);

    expect(await stack.gateAgent.ownerOf(1)).to.equal(stack.organizer.address);
    expect(await stack.gateAgent.ownerOf(2)).to.equal(stack.stranger.address);
    expect(await stack.gateAgent.encryptedMetadataURIOf(2)).to.equal(cloneMetadataURI);
    const cloneRecord = await stack.gateAgent.gateAgentRecord(2);
    expect(cloneRecord.policyHash).to.equal(id("policy-clone"));
    expect(cloneRecord.dataRoot).to.equal(await stack.gateAgent.computeDataRoot(cloneData, cloneMetadataURI));
  });
});
