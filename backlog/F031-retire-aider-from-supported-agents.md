# F031 - Stop advertising Aider; keep it launchable but deprecated

**Status:** Done (0.62.1)
**Type:** Cleanup (product positioning)
**Created:** 2026-10-09
**Requested by:** Juan, 2026-10-09 ("remove ... ada [Aider, assumed], it seems those tools are now just insignificant in the agentic tooling")

Assumption to confirm: "ada" in the request means **Aider**. Nothing called Ada exists in the code or docs. If AdaL or another tool was meant, revise this item.

## Evidence (checked 2026-10-09)

- Aider-AI/aider: 49k stars, last tagged release v0.86.0 on 2025-08-09, last code push 2026-05-22, not archived. A mid-2026 roundup says it dropped out of the top five of CLI coding agents because momentum slowed, not because it got worse.
- Our own fleet: 0 Aider agents on this Mac, mac-mini or mini-lola (registries: 105 Claude Code, 35 + 8 Claude Code elsewhere, 1 Codex).
- For comparison, active agents in the same view: claude-code 150k stars, codex 128k, gemini-cli 107k, opencode 212k, Grok Build 27k, all pushed within the last two weeks.

## Decision

Stop advertising it; do not break anyone's existing Aider agent. An unrecognised program refuses to launch (`lib/program-command.ts`), so deleting Aider from the resolver would break other users' agents for no benefit.

## Work

1. **Remove from where it is advertised:** `components/WakeAgentDialog.tsx` (the Aider entry), `components/onboarding/UseCaseSelector.tsx` and `components/onboarding/guides/SingleComputerGuide.tsx`, `services/help-service.ts` (the line listing supported tools), README (3 mentions), website pages `docs/index.html`, `docs/ai-index.html`, `docs/skills.html` and the Operations / Windows guides, `docs/AGENT-PROGRAMS.md` (say it is deprecated, not absent), `PRODUCT.md`.
2. **Keep in the launch resolver, marked deprecated:** `lib/program-command.ts` keeps `aider` (comment: deprecated 2026-10, kept so existing agents launch); the "unrecognised program" message stops listing it.
3. **Leave the neutral comments** in `lib/wake-chain.ts`, `lib/notification-service.ts`, `services/agents-core-service.ts` and `lib/agent-uploads.ts` that mention Aider as an example of a terminal agent whose prompt we recognise; only update them if the prompt detection is also removed (it is not part of this item).
4. Tests: `tests/program-command.test.ts` still resolves `aider`; add a test that the wake dialog no longer offers it.
5. CHANGELOG note: "Aider is no longer listed; existing Aider agents keep working."

## Not in scope

Removing Aider's prompt detection, or any behaviour change for running Aider agents.
