# AI Maestro email bridge

Polls a mailbox over IMAP and tells an agent about new mail through AI Maestro (`POST /api/messages`).

With `SPLIT_MODE=on`, mail from an allowlisted sender that **our mail server authenticated** wakes the agent
at once (high priority, no body by default). Authenticated mail from a **company domain** (`COMPANY_DOMAINS`) goes into the digest, labelled, and never wakes anyone. Everything else goes into a **digest** (08:00, 13:00, 18:00, or
when 25 are waiting). A mail from an allowlisted sender that fails authentication is counted, never shown.
The design, the trust rules and the test list are in [`docs/EMAIL-BRIDGE-TRUST-SPLIT-SPEC.md`](../../docs/EMAIL-BRIDGE-TRUST-SPLIT-SPEC.md).

| `SPLIT_MODE` | What it does |
|---|---|
| `off` | One notification per mail, as before |
| `shadow` | The same, plus a log line per mail with its class (never a subject or body) |
| `on` | The split |

Fixed in every mode: a failed send is retried instead of lost, the mailbox's `UIDVALIDITY` is kept, subject and
sender text are made safe before they reach an agent, and the first run announces nothing old.

```bash
npm install
cp .env.example .env     # fill it in; the mailbox login stays in the credentials file, not here
npm test && npm run typecheck
DRY_RUN=true npm start   # log what would happen, send nothing, write no state
```

The mailbox is opened read-only; nothing is marked as read. The server certificate is checked.
Run it under pm2 through `start-email-bridge.sh`.
