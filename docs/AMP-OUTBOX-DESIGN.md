# Agents only write their own area: the outbox design (F035)

*Design note for review. Nothing here is built. 2026-10-10. Prompted by issue #555; continues F027 Phase 3.*

## The problem in one picture

Today, to send a message on the same machine, the sender walks into the recipient's area and puts the file in the recipient's inbox. That one choice causes most of our delivery trouble:

- **Anyone who can write files can fake a message.** The file says who sent it, but nothing checks. The file route skips the signature check, the rate limit, the delivery log and the recipient check (F027).
- **A locked-down agent cannot send at all.** Codex in its "workspace-write" mode may change only files inside its project folder, so it cannot write another agent's inbox (#555). Containers and other restricted agents have the same problem.
- **"Sent" is not "delivered".** There is no outbox and no state in between. A message can be filed under `sent` that never arrived.
- **The recipient is not woken.** A dropped file tells nobody. We added the inbox sweeper (0.49.9) and the doorbell (0.50.2) to patch that.
- **Two paths behave differently.** Same-machine messages go by file, other-machine messages go by server, with different checks and results.

## The idea

**An agent only ever writes in its own area. Only AI Maestro writes into inboxes.** Like a post office: you hand your letter to the mailroom, and the mailroom delivers it and tells you what happened. You never walk into someone else's office.

## How a message travels

1. The sender writes the message into **its own outbox**: `~/.agent-messaging/agents/<sender>/messages/outbox/<id>.json`. The sender is allowed to write there.
2. AI Maestro notices it (a folder watch, with a short sweep as the safety net). Which outbox the file is in tells AI Maestro who the sender is, so a sender cannot pretend to be someone else. It also checks the signature.
3. AI Maestro delivers it with the same code it uses for every other message: it writes the recipient's inbox, wakes the recipient, records the delivery.
4. AI Maestro moves the file out of the outbox into `sent`, with a result: `delivered`, or `failed` and the reason.

## What the sender sees

After writing to the outbox, the send command waits a few seconds for the result and then says one of three honest things:

- `delivered` (the result came back).
- `queued: AI Maestro has not confirmed yet` (it is still in the outbox).
- `failed: <reason>` (also left in `sent` with that status).

It never says `delivered` unless the recipient inbox was written.

## Without AI Maestro

The protocol should still work with nothing but files. In that case the send command sees that no AI Maestro is reachable and falls back to the old direct write (as today), and says so. The outbox is how a sandboxed or restricted agent sends when AI Maestro is running. If nothing is running to empty the outbox, the message stays `queued` and the command says that plainly. *(Open question 2 below.)*

## What this fixes

| Problem | Fixed by |
|---|---|
| Forged sender | The outbox identifies the sender; the signature is checked |
| Locked-down agents (#555) | They only write their own outbox; no network and no other folder needed |
| "Sent" without delivery | Honest states; `sent` is written after delivery |
| No wake-up | The server delivers, so the normal wake chain runs |
| Two different paths | One delivery code path on the server |

## What changes for existing agents

- Old `amp-send.sh` versions keep working exactly as today. The server still accepts the HTTP route and does not touch inboxes it did not write.
- A new plugin version of `amp-send.sh` (upstream `agentmessaging/claude-plugin`, then the plugin builder, then AI Maestro, the usual chain) writes the outbox first when AI Maestro is present.
- Later, once agents have moved, direct writes into another agent's inbox can be switched off by default. Nothing is removed until the outbox has run for a few weeks.

## Steps

0. **Honest failure now (small).** Check each write, save to `sent` only after delivery succeeds, print "delivered" only after the file is verified. Fixes the worst part of #555 today.
1. **Server:** an outbox watcher that validates and delivers, and writes the result to `sent`. Tests: forged sender, bad signature, size limit, unknown recipient, duplicate id, AI Maestro restarted mid-delivery, a crash after delivery and before the move.
2. **Plugin:** the new send behavior, with the three honest results. Evals and shell tests.
3. **Codex agents:** check that a "workspace-write" agent can write its **own** `~/.agent-messaging/agents/<id>/` folder. If not, AI Maestro starts Codex with that one folder added as a writable root (one folder per agent, never the whole tree).
4. **Later:** turn off cross-inbox writes by default.

## Open questions (your call)

1. **Is the server the only writer of inboxes whenever it is running?** I recommend yes. It is what makes forged mail impossible.
2. **The no-server fallback.** Keep the direct write when nothing is running (works, but a locked-down agent still cannot send then), or leave the message queued and say so, for a pure-files protocol.
3. **Speed.** A folder watch makes delivery near-instant. A 5-second sweep is simpler. I recommend the watch plus the sweep as the safety net.
4. **Can a sandboxed Codex agent write its own folder today?** The reporter's failure was at the recipient write, which suggests yes. Worth asking him before step 3.
