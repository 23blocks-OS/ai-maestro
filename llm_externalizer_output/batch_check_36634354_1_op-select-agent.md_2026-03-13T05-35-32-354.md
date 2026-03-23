# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-ORCHESTRATOR-AGENT/ai-maestro-orchestrator-agent/skills/amoa-task-distribution/references/op-select-agent.md`
- **Task**: You are analyzing the task distribution and assignment system from the "AI Maestro Orchestrator Agent" (AMOA). This defines how the orchestrator breaks down tasks, selects agents, assigns work, and handles dependencies.

For each file, extract:
1. ASSIGNMENT PROTOCOL: Exact steps for assigning a task to an agent
2. AGENT SELECTION: How is the right agent chosen? Load balancing? Skills matching?
3. NOTIFICATION FORMAT: The exact message format sent to agents when they get a task
4. DEPENDENCY TRACKING: How are task dependencies tracked? What happens when a dependency is resolved?
5. BLOCKED TASKS: What puts a task in blocked state? How is it unblocked?
6. REASSIGNMENT: When and how are tasks reassigned from one agent to another?
7. TASK BREAKDOWN: How does the orchestrator break design docs into implementable tasks?

Extract exact formats, templates, and workflow steps.
- **Model**: `minimax/minimax-m2.5`

---

The user wants me to analyze the task distribution and assignment system from the "AI Maestro Orchestrator Agent" (AMOA). They've provided one file so far - `op-select-agent.md` which is a reference document about selecting agents for tasks.

Let me analyze what I've extracted from this file:

1. **ASSIGNMENT PROTOCOL**: The exact steps for assigning a task to an agent are:
   - Filter agents by availability (exclude hibernated/offline)
   - For each available agent: calculate skill match score, get current task count
   - Sort agents by: skill match score (descending), current load (ascending)
   - Select top agent
   - If no suitable agent, return error

2. **AGENT SELECTION**: How is the right agent chosen?
   - Three criteria evaluated in order:
     a. Availability Check

---
⚠ TRUNCATED (partial result due to timeout)