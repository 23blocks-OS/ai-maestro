# Mapping AID, AMP and AAP onto the Personal Agent Protocol (Poppy)

**Status:** design note, 2026-10-09. Based on Poppy Draft 0.1 (published 2026-10-09, which says it may change in breaking ways) and AID v0.3.0. Items marked *(verify)* were not confirmed in the text read. Nothing here is implemented.

## Different problems, so the layers stack

| | Poppy | AID | AMP | AAP |
|---|---|---|---|---|
| Question it answers | Which human allowed this agent to act at this company, with what scope | Which agent is this, and what role did an admin give it | How agents exchange signed messages | How a click in an agent-drawn UI reaches the agent |
| Principal | A user, through OAuth sign-in | An organization admin approving a role | The sending agent | The viewing human |
| Counterparty | A company's API, site or company agent | An auth server | Another agent | The agent that drew the UI |

Poppy needs an agent identity (a stable `client_id` with keys). AID is that identity layer. Poppy adds the part AID never had: a human's delegated consent.

## Concept by concept

| Poppy requirement | AID today | Change |
|---|---|---|
| Agent identifier is an HTTPS URL (`client_id`) serving a metadata document | `address` such as `name@tenant.provider`, plus a fingerprint | Publish `https://{host}/agents/{name}/agent.json` with `client_id` equal to that URL. Carry the AID address and fingerprint in an AID extension entry in the document *(verify: Poppy says third-party extension names are domain-namespaced, for example `example.com/x`, so use a name like `agentids.org/identity`)*. |
| `jwks_uri` on the same domain as `client_id`, public keys only | Public key lives inside the signed identity document | Serve a JWKS built from the agent's public keys. Poppy states no algorithm restriction beyond examples that use ES256, so an Ed25519 key (JWK `OKP`) is allowed by the text read, but a company's library may only handle ES256. Safest: keep Ed25519 as the AID root and add an ES256 operational key, bound to the AID identity by a signature from the root key. |
| Client authentication: `private_key_jwt`, RFC 7523 JWT bearer assertion, `jti` of at least 128 random bits, one minute lifetime | Custom grant `urn:aid:agent-identity`; proof signs `aid-token-exchange\n{timestamp}\n{auth_server_url}`, valid 5 minutes, no unique id | Let AID servers also accept the standard JWT bearer grant with `client_assertion`. Add a `jti` and replay cache to the AID proof. Keep the old grant for existing clients. |
| Tokens bound to a key with DPoP (RFC 9449), nonces supported | Bearer JWT (RS256), no binding | AID token endpoint accepts a `DPoP` header and returns `token_type: DPoP`. `aid-token.sh` generates proofs (needs the ES256 key). Handle `use_dpop_nonce`. |
| Session tokens are opaque to the agent | AID tokens are JWTs the agent may read | Clients treat tokens as opaque. No change to servers. |
| Per-company opaque User ID, not derived from personal data, "even with a keyed hash" | No user concept | New: random id per (user, company), stored in the vault, never derived. |
| User consent: OAuth direct, device or mediated sign-in; scopes `poppy:read`, `poppy:write` plus company scopes | Admin approval of an agent registration (RFC 8628 style) | New component. Not a replacement for AID roles: a Poppy company sees the agent's identity and a user's delegation, which are different facts. |
| Account Token (refresh token) must never be in model context, messages, logs or URLs | Not applicable | New: a vault plus a signer outside the model's reach (see F033). The agent asks the signer for a signature or an authorised call; it never receives the key or the token. |
| Discovery: `/.well-known/poppy.json` | RFC 9728 then RFC 8414 | Try `poppy.json` first; fall back to the AID path. |
| Company interfaces: OpenAPI, MCP, browser, conversation (`POST` conversation, messages, `GET` events, handoff, close) | Not applicable | New client skill. This is not AMP: AMP is agent to agent with signed messages; the conversation interface is agent to a company's own agent. An AMP bridge is possible later but not needed for compatibility. |
| `operations` extension: the agent confirms an exact action with the user before the company performs it; idempotent retries; one record across channels | Not applicable | Closest local analogue is the approval cards in the chat (permission and question cards), not AAP. AAP carries a human's UI click back to an agent. Read the full extension text before deciding *(verify: schemas and endpoints were not in the page read)*. |
| Revocation endpoint; `sign_in_required` and `insufficient_scope` events | AID has server-side suspend and introspection | Client handles the events; add token revocation call to the vault tooling. |

## What each of our protocols gets

- **AID:** extend, do not replace. Add the metadata document, JWKS, JWT bearer grant, DPoP and `jti`. A short "AID profile for Poppy" section in the spec would do it.
- **AMP:** untouched. Poppy has nothing for agent to agent.
- **AAP:** untouched. It is a different direction (human UI to agent). Do not reuse the name `operations`.
- **F033 (secrets):** becomes the foundation. Poppy's one hard rule on the agent side, no account token in model context, is exactly what `aim-secret` and a signer service enforce.

## Order of work

1. Keep keys and tokens away from the model: signer service, no secrets in the agent environment (lolabot platform findings).
2. AID: `jti`, JWT bearer grant, DPoP, ES256 operational key bound to the root identity.
3. Per-agent metadata document and JWKS on a public HTTPS host.
4. OAuth broker and token vault (the human consent part).
5. Discovery and conversation client skill.

## Open questions

- Does Poppy allow EdDSA in `client_assertion` and DPoP in practice, or only ES256 *(verify with the authors)*?
- Are third-party extension entries in the agent metadata document honoured by companies, or only listed in `poppy.json`?
- How a fleet of agents behind one host gets one `client_id` per agent versus one per product.
