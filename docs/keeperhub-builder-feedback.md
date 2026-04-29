# KeeperHub Builder Feedback

Generated at: 2026-04-29T14:36:30.443Z  
Last updated at: 2026-04-29T23:09:02.825+08:00  
Project: VeriAgent Mesh / VeriGate

## Summary

While integrating KeeperHub Direct Execution for RSVP pass issuance, we found a reproducible authentication mismatch between the Direct Execution documentation and the live API behavior.

The Direct Execution page says direct execution endpoints require an API key in the `X-API-Key` header and shows:

```text
X-API-Key: keeper_...
```

The Authentication page says programmatic API keys use:

```text
Authorization: Bearer kh_your_api_key
```

In live testing with a `kh_` organization API key, `X-API-Key` alone returned `401 Unauthorized`, while `Authorization: Bearer` authenticated successfully.

## Impact

This caused repeated `Unauthorized` errors during hackathon integration even after replacing the API key with a newly generated organization key. The issue slowed down Direct Execution integration because both the key prefix and the required authentication header were ambiguous across docs pages.

The project currently works around the issue by sending both headers:

```http
Authorization: Bearer <KH_API_KEY>
X-API-Key: <KH_API_KEY>
```

This is intentionally defensive because live behavior accepts `Authorization: Bearer`, while the Direct Execution docs currently emphasize `X-API-Key`.

## Reproduction

Do not print or share the actual API key. Use a valid `kh_` organization API key from KeeperHub organization settings.

Environment:

```text
KH_API_BASE_URL=https://app.keeperhub.com
KH_API_KEY=<redacted kh_ organization API key>
```

### Probe 1: status endpoint with fake execution id

Request:

```http
GET /api/execute/direct_verigate_auth_probe_do_not_exist/status
```

Observed results at `2026-04-29T14:36:30.443Z`:

| Auth header | Status | Response |
| --- | ---: | --- |
| `X-API-Key: <kh_...>` | 401 | `{"error":"Unauthorized"}` |
| `Authorization: Bearer <kh_...>` | 404 | `{"error":"Execution not found"}` |
| both headers | 404 | `{"error":"Execution not found"}` |

The 404 is expected for a fake execution id and indicates that authentication passed. The 401 for `X-API-Key` alone indicates that the Direct Execution page's documented header does not match current live behavior for `kh_` organization keys.

### Probe 2: read-only contract call

Request:

```http
POST /api/execute/contract-call
Content-Type: application/json
Authorization: Bearer <kh_...>
```

Body:

```json
{
  "contractAddress": "0x6B175474E89094C44Da98b954EedeAC495271d0F",
  "network": "ethereum",
  "functionName": "balanceOf",
  "functionArgs": "[\"0x0000000000000000000000000000000000000000\"]",
  "abi": "[{\"type\":\"function\",\"name\":\"balanceOf\",\"stateMutability\":\"view\",\"inputs\":[{\"name\":\"account\",\"type\":\"address\"}],\"outputs\":[{\"name\":\"\",\"type\":\"uint256\"}]}]",
  "value": "0",
  "gasLimitMultiplier": "1.2"
}
```

Observed result:

```text
200 OK
```

The same read-only call also succeeded when both `Authorization: Bearer` and `X-API-Key` were sent.

## Expected Behavior

One of the following should be true:

1. If `X-API-Key` is the intended Direct Execution auth header, the live API should accept `X-API-Key: kh_...`.
2. If `Authorization: Bearer kh_...` is the intended API key auth method, the Direct Execution page should use that header in its examples.
3. If both are intentionally supported, both docs pages should say so explicitly.

## Documentation Gaps

- The Direct Execution page shows `X-API-Key: keeper_...`, while the Authentication page describes `kh_` organization API keys.
- The Authentication page says `kh_` keys are accepted on `/api/execute`, but the Direct Execution page points to a different header format.
- The Direct Execution examples should clarify whether `functionArgs` and `abi` must be JSON strings. They are documented as JSON strings, and using arrays directly caused `Invalid field type` during integration.
- The supported `network` names should be listed or linked directly from the Direct Execution page. This would help builders understand whether custom EVM networks, such as 0G Galileo, are supported.

## Suggested Fix

Update the Direct Execution documentation to include an authentication example that matches the live API:

```http
Authorization: Bearer kh_your_api_key
```

Or, if `X-API-Key` is intended, update the API gateway so that this also works:

```http
X-API-Key: kh_your_api_key
```

Also add a small canonical `curl` example for `contract-call` that includes:

- a `kh_` organization API key placeholder,
- `functionArgs` as a JSON array string,
- `abi` as a JSON string,
- the list of accepted `network` values or a link to the supported chains endpoint.

## Current Project Workaround

VeriAgent Mesh currently sends both headers for KeeperHub Direct Execution:

```http
Authorization: Bearer <KH_API_KEY>
X-API-Key: <KH_API_KEY>
```

The request body is encoded according to the Direct Execution schema:

```json
{
  "contractAddress": "0x...",
  "network": "0g-galileo",
  "functionName": "mintWithVerifiedReceipt",
  "functionArgs": "[\"0x...\", \"0x...\", \"0G://...\"]",
  "abi": "[{\"type\":\"function\", ...}]",
  "value": "0",
  "gasLimitMultiplier": "1.2"
}
```

## Report Log

- 2026-04-29T23:09:02.825+08:00: Reported to the KeeperHub Discord by `skottbie_92270`.
  - Discord thread: https://discord.com/channels/1485135725585371266/1485165916869365770/threads/1499064751664140420
  - Report type: documentation gap / reproducible authentication mismatch.

## Related Links

- KeeperHub Authentication docs: https://docs.keeperhub.com/api/authentication
- KeeperHub Direct Execution docs: https://docs.keeperhub.com/api/direct-execution
- ETHGlobal Open Agents KeeperHub prize page: https://ethglobal.com/events/openagents/prizes
