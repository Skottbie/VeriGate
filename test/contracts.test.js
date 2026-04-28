import { expect } from "chai";
import { ethers as ethersLib } from "ethers";
import { network } from "hardhat";

const { ethers } = await network.create();

function id(value) {
  return ethersLib.id(value);
}

async function deployStack() {
  const [organizer, recipient, stranger] = await ethers.getSigners();

  const eventRegistry = await ethers.deployContract("EventRegistry");
  const nullifierRegistry = await ethers.deployContract("NullifierRegistry", [organizer.address]);
  const verifierReceiptRegistry = await ethers.deployContract("VerifierReceiptRegistry", [organizer.address]);
  const eventPass = await ethers.deployContract("EventPassSBT", [
    "VeriGate Event Pass",
    "VGATE",
    await eventRegistry.getAddress(),
    await nullifierRegistry.getAddress(),
    await verifierReceiptRegistry.getAddress(),
  ]);

  await nullifierRegistry.setController(await eventPass.getAddress());

  return {
    organizer,
    recipient,
    stranger,
    eventRegistry,
    nullifierRegistry,
    verifierReceiptRegistry,
    eventPass,
  };
}

async function createEventAndReceipt(stack, overrides = {}) {
  const eventId = overrides.eventId ?? id("open-agents-demo-event");
  const policyHash = overrides.policyHash ?? id("eth-holder-policy-v1");
  const proofHash = overrides.proofHash ?? id("proof-v1");
  const nullifier = overrides.nullifier ?? id("event-user-nullifier");
  const receiptId = overrides.receiptId ?? id("receipt-v1");
  const approved = overrides.approved ?? true;
  const expiresAt = overrides.expiresAt ?? 0n;
  const metadataURI = overrides.metadataURI ?? "0g://event/open-agents-demo";
  const auditURI = overrides.auditURI ?? "0g://audit/receipt-v1";

  await stack.eventRegistry.createEvent(eventId, policyHash, metadataURI);
  await stack.verifierReceiptRegistry.recordReceipt({
    receiptId,
    eventId,
    policyHash,
    proofHash,
    nullifier,
    approved,
    expiresAt,
    verifier: stack.organizer.address,
    auditURI,
  });

  return {
    eventId,
    policyHash,
    proofHash,
    nullifier,
    receiptId,
    metadataURI,
    auditURI,
  };
}

describe("P2 0G chain gate settlement contracts", function () {
  it("creates an event bound to a policy hash", async function () {
    const stack = await deployStack();
    const eventId = id("event-create");
    const policyHash = id("policy-create");

    await expect(stack.eventRegistry.createEvent(eventId, policyHash, "0g://event/create"))
      .to.emit(stack.eventRegistry, "GateEventCreated")
      .withArgs(eventId, policyHash, stack.organizer.address, "0g://event/create");

    const gateEvent = await stack.eventRegistry.getFunction("getEvent")(eventId);
    expect(gateEvent.eventId).to.equal(eventId);
    expect(gateEvent.policyHash).to.equal(policyHash);
    expect(gateEvent.organizer).to.equal(stack.organizer.address);
    expect(gateEvent.active).to.equal(true);
  });

  it("records a verifier receipt with policy, proof, nullifier, and audit pointer", async function () {
    const stack = await deployStack();
    const receipt = await createEventAndReceipt(stack, { receiptId: id("receipt-record") });

    const stored = await stack.verifierReceiptRegistry.getReceipt(receipt.receiptId);
    expect(stored.eventId).to.equal(receipt.eventId);
    expect(stored.policyHash).to.equal(receipt.policyHash);
    expect(stored.proofHash).to.equal(receipt.proofHash);
    expect(stored.nullifier).to.equal(receipt.nullifier);
    expect(stored.approved).to.equal(true);
    expect(stored.auditURI).to.equal(receipt.auditURI);
  });

  it("mints a non-transferable pass from an approved verifier receipt", async function () {
    const stack = await deployStack();
    const receipt = await createEventAndReceipt(stack, { receiptId: id("receipt-mint") });

    await expect(
      stack.eventPass.mintWithVerifiedReceipt(stack.recipient.address, receipt.receiptId, "0g://pass/token-1"),
    )
      .to.emit(stack.eventPass, "EventPassMinted")
      .withArgs(1n, stack.recipient.address, receipt.eventId, receipt.receiptId, receipt.nullifier, "0g://pass/token-1");

    expect(await stack.eventPass.ownerOf(1)).to.equal(stack.recipient.address);
    expect(await stack.eventPass.balanceOf(stack.recipient.address)).to.equal(1n);
    expect(await stack.nullifierRegistry.usedNullifiers(receipt.nullifier)).to.equal(true);

    await expect(
      stack.eventPass
        .connect(stack.recipient)
        .transferFrom(stack.recipient.address, stack.stranger.address, 1),
    ).to.be.revertedWithCustomError(stack.eventPass, "TransferDisabled");
  });

  it("rejects duplicate mint attempts for the same event nullifier", async function () {
    const stack = await deployStack();
    const receipt = await createEventAndReceipt(stack, { receiptId: id("receipt-duplicate") });

    await stack.eventPass.mintWithVerifiedReceipt(stack.recipient.address, receipt.receiptId, "0g://pass/token-1");

    await expect(
      stack.eventPass.mintWithVerifiedReceipt(stack.stranger.address, receipt.receiptId, "0g://pass/token-2"),
    ).to.be.revertedWithCustomError(stack.nullifierRegistry, "NullifierAlreadyUsed");
  });

  it("rejects a receipt whose policy hash no longer matches the event policy", async function () {
    const stack = await deployStack();
    const eventId = id("event-wrong-policy");
    await createEventAndReceipt(stack, {
      eventId,
      policyHash: id("policy-a"),
      receiptId: id("receipt-wrong-policy-good"),
    });

    await stack.verifierReceiptRegistry.recordReceipt({
      receiptId: id("receipt-wrong-policy-bad"),
      eventId,
      policyHash: id("policy-b"),
      proofHash: id("proof-wrong-policy"),
      nullifier: id("nullifier-wrong-policy"),
      approved: true,
      expiresAt: 0,
      verifier: stack.organizer.address,
      auditURI: "0g://audit/wrong-policy",
    });

    await expect(
      stack.eventPass.mintWithVerifiedReceipt(stack.recipient.address, id("receipt-wrong-policy-bad"), "0g://pass/bad"),
    ).to.be.revertedWithCustomError(stack.eventPass, "WrongPolicyHash");
  });

  it("rejects unapproved verifier receipts", async function () {
    const stack = await deployStack();
    const receipt = await createEventAndReceipt(stack, {
      receiptId: id("receipt-unapproved"),
      approved: false,
    });

    await expect(
      stack.eventPass.mintWithVerifiedReceipt(stack.recipient.address, receipt.receiptId, "0g://pass/unapproved"),
    ).to.be.revertedWithCustomError(stack.eventPass, "ReceiptNotApproved");
  });

  it("rejects expired verifier receipts", async function () {
    const stack = await deployStack();
    const latest = await ethers.provider.getBlock("latest");
    const receipt = await createEventAndReceipt(stack, {
      receiptId: id("receipt-expired"),
      expiresAt: BigInt(latest.timestamp - 1),
    });

    await expect(
      stack.eventPass.mintWithVerifiedReceipt(stack.recipient.address, receipt.receiptId, "0g://pass/expired"),
    ).to.be.revertedWithCustomError(stack.eventPass, "ReceiptExpired");
  });
});
