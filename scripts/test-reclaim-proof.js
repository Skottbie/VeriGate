import dotenv from "dotenv";
import { ethers } from "ethers";

import { hashPolicy, verifyProof } from "../src/index.js";
import {
  buildWalletControlMessage,
  requestReclaimEthHolderProof,
} from "../src/reclaimProof.js";

dotenv.config({ quiet: true });

const privateKey = process.env.TEST_SOURCE_WALLET_PRIVATE_KEY;
if (!privateKey) {
  throw new Error("TEST_SOURCE_WALLET_PRIVATE_KEY is required for live Reclaim proof testing");
}

const wallet = new ethers.Wallet(privateKey);
const policy = {
  policyId: "policy-eth-holder-reclaim-live-v1",
  eventName: "Private ETH Holder Meetup",
  organizer: "0xBC4CaCC01E81C7b9258DF424260342D3De72B3d8",
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
    agentVersion: "p6-reclaim-proof",
    createdAt: new Date().toISOString(),
  },
};

const expiresAt = new Date(Date.now() + 60 * 60 * 1000).toISOString();
const message = buildWalletControlMessage({
  eventId: policy.policyId,
  policyHash: hashPolicy(policy),
  nonce: ethers.hexlify(ethers.randomBytes(16)),
  expiresAt,
});
const signature = await wallet.signMessage(message);

const result = await requestReclaimEthHolderProof({
  policy,
  walletAddress: wallet.address,
  walletSignature: signature,
  walletMessage: message,
  applicantSecret: ethers.hexlify(ethers.randomBytes(32)),
  expiresAt,
});

const verification = verifyProof(policy, result.applicantProof, { now: new Date() });

console.log(JSON.stringify({
  ok: true,
  proofType: result.applicantProof.proof.proofType,
  tier: result.applicantProof.claims.aggregatedExposureTier,
  approved: verification.approved,
  reasonCode: verification.reasonCode,
  applicantCommitment: result.applicantProof.applicantCommitment,
  eventNullifier: result.applicantProof.antiSybil.eventNullifier,
  proofHash: result.applicantProof.proof.proofHash,
  publicProofMeta: result.publicProofMeta,
}, null, 2));
