# F025 — The chat header shows what the terminal status bar shows

**Status:** In progress (step 1 done in 0.49.3: terminal bar name and folder)
**Type:** Feature
**Created:** 2026-10-05
**Requested by:** Juan, 2026-10-05

## Description

In the terminal tab you see the Claude Code status line: the model, the context size, the "/compact soon" and "/compact now" recommendation, the cost, the mode, and the rest. In the chat tab you see almost none of it: the header has the agent's name and its folder. The same agent, two tabs, two different amounts of information.

Make the two match, in both directions:

1. **Chat header:** show the **name, the AMP address and the folder**, plus every data element the terminal status bar shows that the chat header lacks.
2. **Terminal status bar:** it shows the AMP address and the unread count but **not the agent's name or its folder**. Add both, so each bar carries name, address and folder.

Where we can, one definition of "what the status bar says" feeds both tabs, so they cannot drift apart.

## Why It's Needed

- The information that matters most while you work (context size, the compact recommendation, cost, the model, the mode) is hidden in the one tab that people increasingly use. Juan's expectation is that people will soon use only the agent UX (chat, canvas, file viewer), so the chat tab has to be complete on its own.
- The compact recommendation is a cost control (F016, F020). A person in the chat tab never sees it, so the recommendation does nothing there.
- Two tabs showing different facts about one agent is the kind of drift the "one source of truth" rules exist to prevent.

## What exists now

**Terminal tab.** What you see is the Claude Code status line, drawn inside the terminal by Claude Code from the output of `amp-statusline.sh` (`plugin/plugins/ai-maestro/scripts/amp-statusline.sh`). The script receives a JSON document from Claude Code on every render and prints one line. It reads:

- `model.display_name` (the model),
- `context_window.used_percentage` and `context_window.total_input_tokens` (the context),
- `cost.total_cost_usd` (the cost),
- `workspace.current_dir` and the session title (identity hints),

and adds the compact recommendation (`AMP_STATUSLINE_COMPACT_AT`, default 150k tokens: "/compact soon" in amber, "/compact now: 2x cost" in red above 200k). It also looks up the agent through `/api/agents`.

**What AI Maestro receives from it today.** Only the cost: the script does a best-effort, backgrounded `PATCH /api/agents/<id>/metrics` when the cost has grown. The server never gets the model, the context size or the recommendation. This is the root of the gap: **the data exists only inside the terminal.**

**Chat header.** `components/AgentHeaderBar.tsx` (81 lines) takes `name`, `workingDirectory`, `presence`, `status`, `actions`, `avatar`, and the host. That is all it has. It is shared by `ChatView.tsx` and `MobileChatView.tsx` (the mobile view is also used on desktop through a layout override).

## What to show (to be confirmed against the live status line)

Everything the terminal status bar shows, plus the address:

| Item | Source today | Needed |
|------|--------------|--------|
| Name | registry | already shown |
| AMP address | registry / AMP identity | add |
| Folder | registry (`workingDirectory`) | already shown |
| Model | status line JSON only | report to server |
| Context size and percent | status line JSON only (the transcript also holds token usage) | report to server |
| Compact recommendation (soon / now) | computed in the script | compute on the server from the context size, same thresholds |
| Cost | status line, already PATCHed | read from metrics |
| Mode (permission mode: plan, accept edits, and so on) | **not in the status line JSON** (the status line re-runs when the mode changes, but is not told what it is). Claude Code hook input carries `permission_mode`, to be verified; our hook already runs on every event | report from `ai-maestro-hook.cjs` |
| Effort level, fast mode, thinking | status line JSON: `effort.level`, `fast_mode`, `thinking.enabled` | report to server |
| Prompt cache: warm or cold, expiry, hit ratio | status line JSON: `prompt_cache.warm`, `expires_at`, `ttl`, `hit_ratio` (Claude Code 2.1.251+) | report to server. This is the data behind F020 (cold wakes): a header that says "cache warm for 12 more minutes" tells you whether waking the agent now is cheap |
| Rate limits (5-hour and 7-day) | status line JSON: `rate_limits.*` | report to server |
| Git branch, worktree, open PR and review state | status line JSON: `workspace.git_worktree`, `worktree.*`, `pr.*` | optional, decide per item |
| Session name, Claude Code version, output style, vim mode | status line JSON | low value in chat; leave out unless asked |

The field list above comes from Claude Code's status line documentation (`code.claude.com/docs/en/statusline`, read 2026-10-05). Step zero of the work is still to capture a real JSON from a running session and check which fields it actually sends on the installed version, since several are version-gated and some are absent until the first API call.

## Proposed approach

Follow the existing rules: one source on the server, one browser store, no view computing from its own data.

1. **Report the snapshot.** Extend what `amp-statusline.sh` sends: instead of only the cost, a small session snapshot (model, context tokens and percent, cost, mode if present, effort if present) to one endpoint, throttled (only when a value changed, at most every few seconds, backgrounded, never blocking the render). This is a plugin change, so it follows the release chain: the script is upstream in `agentmessaging/claude-plugin`, then the plugin builder, then this repo.
2. **Carry it in the existing feed.** Put the snapshot in the same server feed that gives presence (`services/sessions-service.ts` `getActivity`, normalised by `lib/agent-presence.ts`), and read it in the browser through `hooks/useSessionActivity.ts`, next to `presenceOf(agent)`. No new socket, no per-view polling.
3. **Compute the recommendation on the server** with the same thresholds as the script, from one shared constant, so the terminal and the chat always agree. Tell the user in the code where the threshold lives.
4. **Fallback for agents with no status line** (an agent started without the plugin, Codex, others): derive model and context from the session transcript, which AI Maestro already reads for the chat, and show only what is known. A missing value is hidden, not shown as zero.
5. **The header.** Extend `AgentHeaderBar` with the address and a compact status row (model, context bar with the compact hint, cost, mode). It must work in the narrow mobile layout: collapse to the context bar and the hint first, the rest behind a tap. Both chat views already share the header, so one change covers both.
6. **Terminal bar: add name and folder.** The status line is a script we own (`amp-statusline.sh`). It already resolves the agent name (to find the address) and has the working directory, so it can print them. Claude Code shows each `echo` as its own row, so there is room for a first row of `name · address · folder · unread` and the existing `model | ctx | cost` row below it. The script can read the terminal width from `COLUMNS` and shorten the folder to fit. Claude Code itself still draws the bar, we only change what the script prints.
7. **One definition.** The text of the compact recommendation, the thresholds and the field names live in one place (a shared constant on the server, a small copy in the script) with a test that fails if they drift.

## Where it touches

- `plugin/plugins/ai-maestro/scripts/amp-statusline.sh` (upstream `agentmessaging/claude-plugin`): report the snapshot.
- A new or extended metrics endpoint under `app/api/agents/[id]/` and its service in `services/` (and the headless router, `services/headless-router.ts`, since new routes need both).
- `services/sessions-service.ts` (`getActivity`), `lib/agent-presence.ts`, `hooks/useSessionActivity.ts`: carry and expose the snapshot.
- `components/AgentHeaderBar.tsx`, `components/ChatView.tsx`, `components/MobileChatView.tsx`.
- `docs/COST-OPTIMIZATION.md` and F016 / F020: the compact recommendation moves from a terminal-only hint to something every view can show.

## Risks and open questions

- **Stale data.** The snapshot only updates when Claude Code renders the status line, which is not constant. The header should show the age of the value, or hide it when old, rather than claim it is current.
- **Cross-host agents.** The script runs on the agent's host and reports to its host's AI Maestro. On a worker host, the manager has to see it too. Reuse how metrics already reach the manager, or fetch through the host's API like other agent data.
- **Mode.** The permission mode is **not** in the status line JSON (confirmed against the docs). The terminal's own footer shows it, but our status line script cannot. For the chat header, the hook input is the likely source; verify the field exists on the installed version and on every event we need before promising it. If it only arrives on some events, show the last known value with its age.
- **Terminal bar width.** The status line runs with `COLUMNS` set but cannot rely on a wide terminal; a narrow pane needs a shorter first row (drop the folder first, then the address).
- **Agents with no status line** show less. That is acceptable if it is stated, not hidden.
- **Header space.** The header is already tight on mobile. Needs a design pass, in the style the dashboard already uses ("The Agency" world: oat ground, brass accents), not an ad hoc row.
- **Terminal and chat disagree** if the thresholds are defined twice. One constant, tested.
- **Not verified:** the exact fields of the status line JSON on the installed Claude Code version, whether `permission_mode` is in the hook input on every event, and whether `/api/agents/<id>/metrics` can take more than the cost today.

## Progress

- 2026-10-05, v0.49.3 (plugin 1.3.2): the terminal bar now shows name, address and folder on row 1, fitted to the pane width. Tests in `claude-plugin/tests/unit/statusline_row1.bats`.
- Next: step 1 of the approach (report a snapshot to the server), then the header.

## Success criteria

- Open the same agent in the terminal tab and the chat tab: every fact on the terminal status bar is also visible in the chat header, with the same value.
- The chat header shows name, AMP address and folder, and the terminal status bar shows name, address and folder too.
- The "/compact soon" and "/compact now" recommendations appear in the chat at the same moment as in the terminal.
- A value that is unknown or stale is hidden or marked, never shown as a wrong number.
- No view computes any of these values on its own; the browser reads one store.
- Works on mobile width.

Effort: M (plugin script change plus release chain, one endpoint, feed and store fields, header design).
