# B016 - AMP: a sender on the local provider domain is trusted without a signature check

**Status:** Todo
**Type:** Bug
**Created:** 2026-10-28
**Source:** Security round, 2026-10-28.

## What the code does

In the AMP plugin (repo `agentmessaging/claude-plugin`), `scripts/amp-helper.sh`, `save_to_inbox` (about lines 1347-1365): when the sender's claimed address is on the local provider domain, the message is accepted without checking its signature. A TODO marks the spot. `amp-fetch.sh` also trusts messages that come from the same provider.

## Why

Anything that can write a message with a local-domain address can pose as any local agent. The network is the trust boundary here by design, but a forged sender inside an inbox defeats the point of signed messages, and relayed paths can carry a local-looking address.

## Work

- Verify the Ed25519 signature for local-domain senders against the sender's registered public key, as is done for remote senders. Or make the server the only writer of local inboxes, so a local address is only ever stamped by it.
- Apply the same rule in `amp-fetch.sh`.
- Keep backward compatibility: messages from older agents without a signature are accepted with a visible "unverified" mark for one release, then refused behind a setting.
- Fix upstream and merge to `main`, then rebuild the plugin (CLAUDE.md, plugin section); a local edit is reverted by the next build.
- Tests: a forged local sender is rejected or marked; a genuine one passes; an unsigned legacy one follows the compatibility rule.
