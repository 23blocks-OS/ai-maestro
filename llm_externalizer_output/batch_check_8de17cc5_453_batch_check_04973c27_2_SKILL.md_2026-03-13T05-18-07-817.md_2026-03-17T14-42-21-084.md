# LLM Externalizer Response

- **Tool**: `code_task`
- **Model**: `google/gemini-2.5-flash`
- **Timestamp**: 2026-03-17T14:42:21.084Z
- **Input file**: `/Users/emanuelesabetta/ai-maestro/llm_externalizer_output/batch_check_04973c27_2_SKILL.md_2026-03-13T05-18-07-817.md`
- **Task**: This is an AI Maestro project (Next.js). Find ALL occurrences of the old marketplace name 'ai-maestro-local-marketplace' in each file. Also find any occurrences of the even older name 'role-plugins' used as a marketplace name (NOT as a directory path or URL path segment — only when used as a marketplace identifier/name string). Report the exact line number and the full line content for each occurrence. If a file has zero occurrences, skip it entirely — do not report clean files.

---

```
/Users/emanuelesabetta/ai-maestro/llm_externalizer_output/batch_check_04973c27_2_SKILL.md_2026-03-13T05-18-07-817.md
Line 1: # Code Check Report
Line 3: - **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-remote-agent-coordinator/SKILL.md`
Line 4: - **Task**: You are analyzing a Claude Code plugin called "AI Maestro Orchestrator Agent" (AMOA). This is the orchestrator role in an AI agent team. The orchestrator manages tasks, assigns work to programmer agents, and tracks progress on a kanban board.
Line 13: The user wants me to analyze a Claude Code plugin called "AI Maestro Orchestrator Agent" (AMOA). They've provided one file - SKILL.md which is a skill descriptor for "amoa-remote-agent-coordinator".
Line 30: - This is the "amoa-remote-agent-coordinator" skill
Line 31: - It's used for coordinating remote AI agents via AI Maestro messaging
Line 37: 1. Verify AI Maestro running and agents registered
Line 40: 3. Send via AMP, wait for ACK (5 min timeout)
Line 41: 4. Monitor progress every 10-15 min
Line 42: 5. Enforce 4 verification loops before PR approval
Line 50: - `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-remote-agent-coordinator/SKILL.md`
Line 62: - Tasks flow through: **Task Creation → ACK → Monitoring → Verification Loops → PR Approval**
Line 76: - Tasks sent via **AMP (AI Maestro Protocol)**
Line 83: - **AI Maestro messaging (AMP)** - Primary notification channel
Line 99: - **AMP (AI Maestro Protocol)** - Primary channel for agent-to-agent messaging
Line 100: - **AI Maestro running** - Required infrastructure
Line 103: - `libs-auth-agent` - Example programmer agent (line 24)
Line 104: - Other agents registered in `agent-registration.md`
Line 120: | Task Assignment | Via AMP with ACK, context, scope, criteria |
Line 121: | Notification | AMP messaging with 5-min ACK timeout |
Line 123: | Agent Communication | Via AI Maestro Protocol (AMP) |
```