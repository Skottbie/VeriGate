import dotenv from "dotenv";
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0glabs/0g-serving-broker";

dotenv.config({ quiet: true });

const rpcUrl = process.env.OG_RPC_URL;
const privateKey = process.env.OG_PRIVATE_KEY;
const providerAddress = process.env.OG_COMPUTE_PROVIDER_ADDRESS;
const ledgerDepositOg = Number.parseFloat(process.env.OG_COMPUTE_LEDGER_DEPOSIT_OG ?? "3");
const providerFundOg = process.env.OG_COMPUTE_PROVIDER_FUND_OG ?? "1";
const targetProviderFund = ethers.parseEther(providerFundOg);

if (!rpcUrl) {
  throw new Error("OG_RPC_URL is required");
}
if (!privateKey) {
  throw new Error("OG_PRIVATE_KEY is required");
}
if (!providerAddress) {
  throw new Error("OG_COMPUTE_PROVIDER_ADDRESS is required");
}
if (!Number.isFinite(ledgerDepositOg) || ledgerDepositOg < 3) {
  throw new Error("OG_COMPUTE_LEDGER_DEPOSIT_OG must be at least 3");
}
if (targetProviderFund <= 0n) {
  throw new Error("OG_COMPUTE_PROVIDER_FUND_OG must be greater than 0");
}

const provider = new ethers.JsonRpcProvider(rpcUrl);
const wallet = new ethers.Wallet(privateKey, provider);
const broker = await createZGComputeNetworkBroker(wallet);

console.log(`0G Compute setup wallet=${wallet.address}`);
console.log(`0G Compute provider=${providerAddress}`);

let ledgerExists = false;
try {
  await broker.ledger.getLedger();
  ledgerExists = true;
  console.log("ledger=exists");
} catch {
  console.log(`ledger=missing; depositing ${ledgerDepositOg} 0G to create ledger`);
  await broker.ledger.depositFund(ledgerDepositOg);
  ledgerExists = true;
  console.log("ledger=created");
}

if (!ledgerExists) {
  throw new Error("ledger setup failed");
}

const currentProviderBalance = await getInferenceProviderBalance(providerAddress);
if (currentProviderBalance >= targetProviderFund) {
  console.log(`providerSubAccount=exists balance=${ethers.formatEther(currentProviderBalance)} 0G`);
} else {
  console.log(`providerSubAccount=transfer ${providerFundOg} 0G`);
  await broker.ledger.transferFund(providerAddress, "inference", targetProviderFund);
  console.log("providerSubAccount=funded");
}

console.log("providerSigner=acknowledge");
try {
  await broker.inference.acknowledgeProviderSigner(providerAddress);
  console.log("providerSigner=acknowledged");
} catch (error) {
  if (!isAlreadyAcknowledged(error)) {
    throw error;
  }
  console.log("providerSigner=already-acknowledged");
}

console.log("0G Compute account setup complete");

async function getInferenceProviderBalance(address) {
  try {
    const providers = await broker.ledger.getProvidersWithBalance("inference");
    const entry = providers.find(([provider]) => provider.toLowerCase() === address.toLowerCase());
    if (!entry) {
      return 0n;
    }
    return BigInt(entry[1]);
  } catch {
    return 0n;
  }
}

function isAlreadyAcknowledged(error) {
  const text = `${error?.message ?? ""} ${error?.shortMessage ?? ""} ${error?.reason ?? ""}`;
  return /already|acknowledged|exists/i.test(text);
}
