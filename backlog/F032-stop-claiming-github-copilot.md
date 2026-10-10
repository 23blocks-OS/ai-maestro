# F032 - Stop claiming GitHub Copilot as a supported agent

**Status:** Done (0.62.1)
**Type:** Cleanup (docs and website accuracy)
**Created:** 2026-10-09
**Requested by:** Juan, 2026-10-09 ("remove github copilot from the agents we can manage")

## What is true (checked 2026-10-09)

- AI Maestro has **no GitHub Copilot support in code**: no program kind in `lib/program-command.ts`, no wake-dialog entry, no launch flags, no chat reader, no hook handling. The only references are claims in docs and on the website (13 mentions in `docs/*.html`, 9 in `docs/*.md`).
- GitHub Copilot CLI is not insignificant: generally available since February 2026, daily releases (v1.0.96 on 2026-10-09), plan mode, autopilot and agent delegation, token billing since May 2026; 11k stars on github/copilot-cli, behind GitHub's enterprise base. Dropping the claim is about accuracy (we never supported it), not about the tool being dead.
- Our fleet runs no Copilot agents.

## Decision

Remove the claim wherever it says AI Maestro works with / manages Copilot. Do not add support. Anything not on the supported list still works as a plain terminal agent (terminal tab, message wake by typing into the pane), which the docs can say once, accurately.

## Work

1. Remove "GitHub Copilot" / "Copilot CLI" from `docs/index.html` (meta description, JSON-LD, hero strip, "Universal Support" card, FAQ), `docs/ai-index.html` (description, keywords, JSON-LD, supported list, use cases), `docs/skills.html` where it claims skill compatibility with Copilot (check the Agent Skills Standard adopters list before editing a claim about a third party), `docs/OPERATIONS-GUIDE.md`, `docs/WINDOWS-INSTALLATION.md`, README and any other hit of `grep -ril copilot docs README.md PRODUCT.md`.
2. Add one accurate sentence where the supported list lives (`docs/AGENT-PROGRAMS.md`, README): "Any terminal-based agent works in the terminal tab and receives messages; Claude Code, Codex and Grok Build have first-class chat, status and approval cards."
3. If Copilot CLI support is wanted later, make it its own feature: it would need a launch kind, transcript reader, hook or status source and approval-card parser, like Grok (F028).
4. Check the website after the Pages build (`curl https://ai-maestro.23blocks.com/ | grep -ci copilot` should be 0) and the GitHub repo description and topics.

## Not in scope

Any code change; the Aider item (F031).
