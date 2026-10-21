# Tasks, the Matrix and the Attention page

Every card lives on a board: an agent's own, a team's, or a project's. The same card model
serves all three, and every view reads from it.

| View | Where | What it shows |
|---|---|---|
| Board | the agent's Board tab, a team meeting, a project | cards by status: backlog, to do, in progress, review, waiting, done |
| Matrix (`/matrix`) | header link | open cards in the four Eisenhower squares (urgent / important), across agents and hosts. Dated cards come first, earliest first |
| Org (`/org`) | header link | cards and relations grouped by organization |
| Attention (`/attention`) | header link | what needs you: agents in "Needs you", cards waiting on you, open cards that are overdue |

None of these replaces the default view. They are extra pages reached from the header.

## What a card holds

`subject`, `description`, `status`, `assigneeAgentId`, `blockedBy`, `priority`, plus:

- **quadrant**: `urgent` and `important` (the Matrix square).
- **waitingOn / waitingNote**: the status `waiting`, and on whom.
- **org**: the organization the card is labelled for.
- **kind**: `task` (default), `idea`, `bug` or `research`. A parked idea is a card of kind `idea`.
- **origin** (0.90.0): where the card came from: `agentId`, `hostId`, `sessionId`, `threadId`, `repo`, `note`. The card detail shows a "Came from" block that links to the agent.
- **due** (0.93.0): `YYYY-MM-DD`, a real calendar day. The card shows "due Oct 25" (amber within 3 days, red "overdue 2d"). `null` clears it.
- **owners** (0.93.0): up to 10 other agents (ids or names) besides the primary assignee. The card appears on each owner's board marked "shared", also when it is stored on another host. The Matrix, Org and Attention pages show it once, with all owners. Naming an owner sends no message.

Limits of sharing: a shared card appears on a co-owner's board only while it is open, so a finished card leaves their Done column.

## For agents: `aimaestro-task.sh`

The `agent-tasks` skill (plugin 1.18.0, skill 1.5.0) works for any agent, whatever framework it runs on.
The CLI describes itself: `aimaestro-task.sh schema`.

```bash
aimaestro-task.sh add "Fix the billing export" --quadrant urgent-important --due 2026-10-25 --owner ops-agent
aimaestro-task.sh list --overdue
aimaestro-task.sh due <id> 2026-11-01        # or: none
aimaestro-task.sh owners <id> ops-agent qa-agent   # or: none
aimaestro-task.sh park "Idea: nightly digest"      # kind idea, off the board
aimaestro-task.sh import tasks.json --dry-run      # bring an existing task list over
aimaestro-task.sh delete <id>                      # own board only
aimaestro-task.sh show <id>
```

`import` checks everything first and skips a subject already on the board. It accepts `subject`,
`description`, `status`, `quadrant`, `org`, `kind`, `waitingOn`, `due` and `owners`.
Team boards use `meeting-task.sh` (same options).

## API

| Call | Notes |
|---|---|
| `GET/POST /api/agents/<id>/tasks`, `PATCH/DELETE .../tasks/<taskId>` | an agent's own board |
| `GET/POST /api/teams/<id>/tasks` | a team board |
| `GET /api/tasks/shared?agent=<id>&as=<names>` | cards on other boards that list the agent as an owner |

Create and update accept `kind`, `origin`, `due` and `owners` as described above; invalid values are refused with a message that names the field.

## Commit to session (0.92.0)

`GET /api/commits/<sha>` (full id or a prefix of at least 7 characters) asks every host which agent session made a commit.
`GET /api/agents/<id>/commits` lists an agent's commits; the Agent Profile has a collapsed "Commits" section.
Claude Code sessions only; a PR opened from the GitHub page, or a rebase merge with a changed message, cannot be traced.

## Memory for Copilot CLI agents (0.92.0)

The memory indexer reads Copilot's `~/.copilot/session-state/<session>/events.jsonl` for agents whose program is Copilot,
so they get the same long-term memory as Claude Code agents. See [AGENT-PROGRAMS.md](./AGENT-PROGRAMS.md).
