# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

**Primary: the solo operator running a fleet.** One human orchestrating dozens of
AI coding agents (80+ today) across several machines, all day, as their main
working surface. Confirmed usage pattern: **switching constantly between agents**
— so knowing *which agent am I in* and getting there fast are the dominant jobs,
above density or long-form reading comfort.

**Secondary: a newcomer evaluating AI Maestro.** The project is public and takes
outside contributions, so the dashboard must stay legible and presentable to
someone opening it for the first time. Confirmed priority order: **power users
first, newcomers second** — expressive, but never at the cost of the daily
workflow.

Not currently designed for multiple humans sharing one fleet (no attribution or
handoff model exists).

## Product Purpose

One dashboard to see and drive every AI agent, on every machine. It exists
because running many agents in separate terminals makes the human the message bus
between them — copying context out of one terminal and pasting it into another.
AI Maestro removes that bottleneck: agents are discovered, visible, addressable,
and can message each other directly.

Success is the operator never having to hunt for an agent, and never having to
relay between them by hand.

## Positioning

"The OS for AI-first organizations." The mechanism a neighboring tool could not
truthfully copy: **agents are the core entity, not terminal sessions** — they
persist with their own identity, memory, working directory and mailbox, exist
across multiple machines, and talk to each other over a signed agent-to-agent
protocol (AMP). A terminal multiplexer shows sessions; this shows an
organization.

## Operating Context

- Runs at `localhost:23000` in the browser, against a fleet of personal machines
  joined by Tailscale (confirmed: 3 hosts today).
- Agents live in tmux sessions and run a coding CLI — **Claude Code or Codex**
  (multi-provider as of v0.39.0). Others (Gemini, Aider) are anticipated.
- The operator moves rapidly between agents, and between two views of one agent:
  a **chat** (message history, send, live working state) and a **terminal**
  (direct tmux attachment).
- Agents have real state the operator must read at a glance: online/offline,
  working, waiting for input, blocked on a permission prompt, hibernated.
- Agents send each other messages; unread counts matter.
- Work happens across long sessions and also in short ambient glances.

## Capabilities and Constraints

- **Core surfaces (confirmed):** chat and terminal are what the operator lives
  in. The other per-agent tabs — messages, worktree, graph, memory, docs, canvas,
  search, export, playback — are **secondary** and may be given less prominence.
  They must remain reachable; none are being removed as product capabilities.
- Agents are grouped hierarchically by name (`org/team/agent`), and the sidebar
  reflects that hierarchy. ~93 registered agents today.
- Agent identity assets already exist: photographic portrait avatars, emoji
  avatars, per-category colors derived by hash, and status indicators.
- Terminal rendering is xterm.js and is **not themeable like ordinary DOM** — it
  has its own color model and must stay legible and faithful to terminal output.
- Live state arrives over WebSocket; some agents (codex) expose less live state
  than others (no permission cards).
- Responsive: desktop, tablet and phone layouts all exist and are in use.
- No authentication, by design — the trust boundary is the local network plus
  Tailscale.
- Stack is fixed and existing: Next.js 14 App Router, React 18, Tailwind,
  lucide-react, xterm.js.

## Brand Commitments

- **Name:** AI Maestro. Logo asset exists (`docs/logo-constellation.svg`).
- **Voice (evidenced in README):** first-person, candid, practitioner-to-
  practitioner. It tells a real story ("I became the human mailman between
  them") rather than marketing abstraction. Honest about limits.
- The incumbent look — dark near-black UI, Space Grotesk — is **evidence, not a
  commitment.** The operator has explicitly opened both the background and the
  typography to change.
- Open source with external contributors; the project publicly credits them.

## Evidence on Hand

- Real fleet data to design against: ~93 agents, real hierarchical names, real
  status distributions, real unread counts.
- Existing avatar library at `public/avatars/` (photographic portraits) plus
  emoji support.
- Screenshot of the current dashboard at `docs/images/aiteam-web.png`.
- No user research, analytics, testimonials, or usage telemetry exist. Future
  work must not fabricate them.

## Product Principles

1. **Agents are people-shaped, not process-shaped.** The product's mental model
   is an organization of colleagues, not a list of sessions. Identity beats
   configuration.
2. **Orientation is the first job.** Because the operator switches agents
   constantly, every surface must answer "who am I talking to, and what are they
   doing?" before anything else.
3. **State must be readable at a glance.** Working, waiting, blocked, and
   offline are the vocabulary of the whole product; ambiguity here costs real
   time.
4. **Two surfaces carry the work.** Chat and terminal earn primacy; everything
   else is available without competing for attention.
5. **Honesty over reassurance.** The product does not claim delivery it cannot
   prove — a principle already enforced in its messaging internals, and one the
   interface language should match.

## Accessibility & Inclusion

No product-specific standard has been established. Known constraints: the
interface is used for long stretches and at a glance from a distance, and
terminal content must remain faithfully legible.
