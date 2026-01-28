# AI Maestro: A Development History

*From "AI Agents Web Dashboard" to multi-host agent orchestration in 110 days.*

---

## The Numbers

| Metric | Value |
|--------|-------|
| First Commit | October 9, 2025 |
| Current Version | v0.19.31 |
| Total Commits | 628 |
| Pull Requests | 137 |
| Days of Development | 110 |
| Primary Developer | Juan Pelaez (740 commits) |
| AI Co-Author | Claude (10 commits) |

---

## Chapter 1: The Beginning (October 9-14, 2025)

**The First Day - October 9, 2025**

It started with a simple idea: manage multiple Claude Code agents from one dashboard.

```
d317980 - Initial commit: AI Agents Web Dashboard
765be95 - Add collapsible notes, redesign sidebar with dynamic colors
1377ee3 - Rebrand to AI Maestro and prepare for open source launch
```

Within hours, the project had a name ("AI Maestro"), a logo (the constellation), and was deployed to GitHub Pages. The CNAME was created, deleted, and recreated within minutes—the first of many rapid iterations.

**The Terminal Wars - October 10-12**

The first real challenge emerged: getting terminal rendering right.

```
v0.1.2 - Terminal scrollback improvements
v0.1.3 - Add scrollback workarounds and terminal improvements
v0.1.4 - Scrollback improvements and workarounds
v0.1.5 - Fix regex pattern error and restore session content
```

Four versions in two days, all fighting with xterm.js scrollback, line rendering, and text selection. The commits reveal the struggle:

- "Fix Claude Code terminal scrollback and line rendering issues"
- "Fix terminal scrollback buffer and improve performance"
- "Fix terminal rendering issues"

**PR #1: Messaging - October 12**

Just three days in, the first major feature landed: agent-to-agent messaging.

```
c702a7a - Add agent-to-agent messaging system v0.2.0
```

This would become one of AI Maestro's defining features—but not without more terminal battles:

```
v0.2.1 - Fix terminal scrollback, text selection, and line ending issues
v0.2.2 - Fix terminal rendering issues
v0.2.3 - Fix terminal scrollback buffer and improve performance
```

---

## Chapter 2: Architecture Evolution (October 13-31, 2025)

**The Tab-Based Revolution - PR #2**

October 13 brought a fundamental architectural change:

```
4c87d7e - Refactor to tab-based terminal architecture
```

The old approach: mount/unmount terminals on agent switch.
The new approach: all terminals mounted simultaneously, toggle visibility.

This eliminated race conditions and made agent switching instant. The CLAUDE.md documentation was updated to memorialize this decision forever.

**The First Crisis: PTY Leak - PR #4**

October 17, 2025. The first real crisis:

```
5106455 - Fix critical PTY leak bug causing system resource exhaustion (v0.4.0)
```

PTY handles weren't being cleaned up. The system would slowly exhaust resources until terminals stopped working. This bug would resurface months later (#104), proving that some battles are never truly won.

**Messages Get Serious - PRs #5-9**

The messaging system grew rapidly:

- PR #5-7: Core message infrastructure
- PR #8: Forward messages between agents
- PR #9: Windows support

**The Agent Refactor - PR #15**

October ended with a major refactor:

```
67041d6 - Merge pull request #15 from 23blocks-OS/refactor/agents
```

Agents became first-class entities. Sessions became properties of agents, not the other way around. This "agent-first architecture" would be written into CLAUDE.md as doctrine.

---

## Chapter 3: Intelligence Awakens (November 2025)

**152 commits. The most prolific month.**

**Distributed Agents - PR #23**

November 6: AI Maestro learned to see beyond localhost.

```
ea78a60 - Merge pull request #23 from 23blocks-OS/feature/distributed-agents
```

Agents could now live on different machines. The hosts.json configuration was born.

**The Conversation Tree - PR #25**

Agents gained the ability to browse their own conversation history:

```
7ff2c58 - Merge pull request #25 from 23blocks-OS/feature/conversation_tree
```

**The WorkTree & Memory System - PR #22**

The biggest November feature: agents gained memory.

```
9980460 - Merge pull request #22 from 23blocks-OS/feature/combined-v0.8.0-worktree-persistence
```

This combined multiple features:
- WorkTree visualization
- Agent memory system
- Session persistence
- Settings UI with host management wizard

Version jumped from 0.7.0 to 0.9.0 in days.

**Community Contribution - PR #17**

The first external contribution arrived:

```
696e23c - Merge pull request #17 from TheMightyDman/feature/prompt-builder
```

AI Maestro was no longer a solo project.

---

## Chapter 4: The Database Era (December 2025)

**208 commits. Peak development.**

**CozoDB Integration - PRs #29-30**

December 7: Agents got their own databases.

```
99ac142 - Merge pull request #30 from 23blocks-OS/feature/db
```

CozoDB—a Datalog-based database—gave agents structured memory with relationship queries.

**Portable Agents - PR #31**

Agents became exportable:

```
5adb6b8 - Merge pull request #31 from 23blocks-OS/feature/portable
```

Export an agent to a ZIP file, import on another machine. Identity, memory, and configuration traveled together.

**Inter-Host Messaging - PR #34**

December 15: Messages could cross machine boundaries.

```
180a197 - Merge pull request #34 from 23blocks-OS/feature/interhost-messages
```

**Hibernate - PR #35**

Agents learned to sleep:

```
71bcd6b - Merge pull request #35 from 23blocks-OS/feature/hibernate
```

Suspend an agent's tmux session, wake it later. Resource management for large agent fleets.

**The Installer - PR #36**

December 23: One-command installation arrived.

```
c217647 - Merge pull request #36 from 23blocks-OS/feature/installer
./install-messaging.sh
```

**Tutorials - PR #37**

December 27: Comprehensive documentation with interactive tutorials.

**Long-Term Memory - PR #39**

January 4, 2026: The memory system got long-term consolidation.

```
651d625 - Merge pull request #39 from 23blocks-OS/feature/long-term-memory
```

Agents could now consolidate memories over time, building understanding across sessions.

---

## Chapter 5: The January Crises (January 2026)

**143 commits. Stabilization and firefighting.**

**The Idle Bug - PR #48**

January 14: Agents weren't properly detecting idle state.

```
3fa0760 - Merge pull request #48 from 23blocks-OS/fix/idle
```

**Inter-Host Message Failures - PRs #49-51**

Mid-January brought a cascade of messaging bugs:

```
fd60cbe - fix: Inter-host messages
0e49dbb - fix: Resolve agent alias
36ec36a - fix: Messaging use name for lookups
```

Messages between hosts were failing silently. Agent aliases weren't resolving. The fix required touching nearly every layer of the messaging system.

**The ONNX Crash - PR #55**

January 17: The embedding model crashed on mutex lock.

```
6beb3b3 - Merge pull request #55 from 23blocks-OS/fix/onnxruntime-mutex-crash
```

The fix: graceful handling of the ONNX runtime's threading issues.

**Push Notifications - PR #89**

January 24: Real-time notifications replaced polling.

```
d097387 - Merge pull request #89 from 23blocks-OS/feat/push-notifications
```

Messages now arrived instantly via tmux notifications.

**The PTY Leak Returns - PR #112**

January 25: The PTY leak from October came back.

```
355322c - Merge pull request #112 from 23blocks-OS/fix/pty-leak-104
```

Issue #104. The same fundamental problem—PTY handles not being cleaned up—but in a different code path. Some bugs are eternal.

**Installer Bugs - PRs #111, #92**

The installer broke in creative ways:

```
bbc6d9b - fix: Installer scripts fail with set -e due to arithmetic increment bug
8033ca5 - fix: Add -y flag for non-interactive installation
```

Bash arithmetic and interactive prompts don't mix with CI/CD.

**External Agents - PR #122**

January 26: Agents could now live outside AI Maestro entirely.

```
7c2b75a - Merge pull request #122 from 23blocks-OS/feature/external-agents
```

GitHub Actions, cron jobs, external services—all could now message registered AI Maestro agents.

**Agent-First Identity - PR #137**

January 27: The identity system was fixed to be truly agent-first.

```
9676742 - Merge pull request #137 from 23blocks-OS/feature/security-content
```

Shell scripts had been parsing session names to derive identity. The fix: query the registry instead. The session name is just a name—the registry is the source of truth.

---

## The Feature Timeline

| Version | Date | Milestone |
|---------|------|-----------|
| v0.1.0 | Oct 9 | Initial release |
| v0.2.0 | Oct 11 | Agent-to-agent messaging |
| v0.3.0 | Oct 13 | Tab-based terminal architecture |
| v0.4.0 | Oct 17 | PTY leak fix, communication docs |
| v0.5.0 | Oct 31 | Unread messages, auto-mark-as-read |
| v0.7.0 | Nov 1 | Migration tracking, deployment indicators |
| v0.8.0 | Nov 5 | Settings UI, host management |
| v0.9.0 | Nov 6 | Conversation detail viewer |
| v0.10.0 | Nov 8 | Work mode documentation |
| v0.11.0 | Dec 6 | Agent intelligence, CozoDB |
| v0.17.x | Dec-Jan | Stabilization, inter-host messaging |
| v0.18.x | Jan | Push notifications, installer improvements |
| v0.19.x | Jan | External agents, federated lookup, agent-first identity |

---

## Recurring Themes

### The Terminal Curse

Terminal rendering issues appeared in:
- October 10-12 (v0.1.2-v0.2.3)
- October 13-14 (tab architecture)
- Throughout: selection, scrollback, resize

xterm.js is powerful but unforgiving.

### The PTY Leak

First appeared: October 17 (PR #4)
Returned: January 25 (PR #112)

PTY handle management remains a challenge in any terminal multiplexer.

### The Messaging Evolution

1. **Local messages** (October) - Same machine
2. **Inter-host messages** (December) - Different machines
3. **Push notifications** (January) - Real-time delivery
4. **External agents** (January) - Non-AI Maestro senders
5. **Federated lookup** (January) - Find agents anywhere

Each layer added complexity and new edge cases.

### The Identity Crisis

The system evolved through multiple identity models:
1. **Session names** - Tmux session = identity
2. **Structured names** - `agent@host` encoded in session name
3. **Registry lookup** - Session maps to agent in registry
4. **Agent-first** - Registry is source of truth

Each transition broke something. The final fix (PR #137) enshrined the principle: agents are entities, sessions are just tools.

---

## What's Next?

The git history shows a project that moves fast and breaks things—then fixes them. 628 commits in 110 days averages to nearly 6 commits per day.

The architecture has evolved from "terminal dashboard" to "multi-host agent orchestration platform with memory, messaging, and federated identity."

The journey continues.

---

*Generated from git history on January 28, 2026*
*AI Maestro v0.19.31*
