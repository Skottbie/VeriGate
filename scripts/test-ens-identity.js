import dotenv from "dotenv";

import {
  DEFAULT_AGENT_ENS_NAME,
  ENS_TEXT_KEYS,
  buildEnsIdentityPayload,
  createEnsResolverAdapter,
  validateEnsRecordAlignment,
} from "../src/index.js";

dotenv.config({ quiet: true });

const agentName = process.env.ENS_AGENT_NAME ?? DEFAULT_AGENT_ENS_NAME;
const appUrl = process.env.VERIGATE_APP_URL ?? "http://localhost:4173";
const auditPointer = process.env.TEST_ENS_AUDIT_POINTER ?? "0G://pending-audit-pointer";

const policy = {
  policyId: "AI_AGENT_BUILDER_GATE",
  eventName: "AI Agent Builder Gathering",
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
    agentVersion: "p7-ens-identity",
    createdAt: new Date().toISOString(),
    policyHash: process.env.TEST_ENS_POLICY_HASH
      ?? "0x53edcc87b9990e70177a2fe47a432860598d1cdb63d835cde6777246bb377ea9",
  },
};

const payload = buildEnsIdentityPayload({
  policy,
  agentName,
  auditPointer,
  appUrl,
});
const resolver = createEnsResolverAdapter();
const [agent, event] = await Promise.all([
  resolver.resolveIdentity({ name: payload.agentName, textKeys: ENS_TEXT_KEYS }),
  resolver.resolveIdentity({ name: payload.eventName, textKeys: ENS_TEXT_KEYS }),
]);

console.log(JSON.stringify({
  ok: true,
  payload,
  resolved: {
    agent,
    event,
  },
  alignment: event.exists
    ? validateEnsRecordAlignment({ payload, resolvedTextRecords: event.textRecords })
    : [],
}, null, 2));
