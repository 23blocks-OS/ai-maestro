# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-INTEGRATOR-AGENT/ai-maestro-integrator-agent/skills/amia-github-projects-sync/SKILL.md`
- **Task**: You are analyzing the "AI Maestro Integrator Agent" (AMIA) plugin. The integrator manages code reviews, PR integration, CI/CD quality gates, and kanban card movements for reviewed items.

For each file, extract:
1. KANBAN COLUMNS: What columns does the integrator interact with? What column transitions does it trigger?
2. REVIEW FLOW: How does the integrator receive review assignments? How does it report results?
3. ORCHESTRATOR INTERACTION: How does the integrator communicate with the orchestrator? What protocols?
4. QUALITY GATES: What conditions must be met before a task passes review?
5. GITHUB SYNC: How does the integrator sync task status with GitHub Projects V2?
6. PR WORKFLOW: What is the PR lifecycle managed by the integrator?
7. NOTIFICATION: How does the integrator notify the orchestrator and programmer agents of review results?

Extract exact column names, message formats, API patterns, and workflow steps.
- **Model**: `minimax/minimax-m2.5`

---

The user wants me to analyze the "AI Maestro Integrator Agent" (AMIA) plugin based on the provided SKILL.md file. Let me extract the requested information from this file.

Let me go through each item:

1. **KANBAN COLUMNS**: The SKILL.md file mentions GitHub Projects V2 but doesn't specify exact column names. It mentions "project board" and "STATUS UPDATE ONLY" - so it can update status but doesn't list specific columns.

2. **REVIEW FLOW**: The file doesn't explicitly describe how the integrator receives review assignments or reports results. It mentions "Notify stakeholders via AI Maestro if needed" but doesn't detail the flow.

3. **ORCHESTRATOR INTERACTION**: The file mentions "agent: api-coordinator" in metadata and "AI Maestro integration for notifications". It mentions sending "AI Maestro messages to relevant agents".

4. **QUALITY GATES**: Not explicitly mentioned in this file.

5. **GITHUB SYNC**: The file describes using GraphQL API to sync with GitHub Projects V2. It mentions:
   - Using `gh api graphql` 
   - Finding project ID via GraphQL query
   - Updating project items
   - READ + STATUS UPDATE ONLY

6. **PR WORKFLOW**: Not explicitly described in this file.

7. **NOTIFICATION**: The file mentions "Notify stakeholders via AI Maestro if needed" and "AI Maestro integration for notifications".

Wait, this is just one file (SKILL.md). The task says "Process ALL attached files". But I only see one file provided. Let me re-read the task...

The task says to analyze the "AI Maestro Integrator Agent" (AMIA) plugin. The SKILL.md file is for "amia-github-projects-sync" skill. 

Looking at the file path: `/Users/emanuelesabetta/Code/EMASOFT-INTEGRATOR-AGENT/ai-maestro-integrator-agent/skills/amia-github-projects-sync/SKILL.md`


I'll focus on the key details from this single file. The metadata reveals the agent is "api-coordinator" with a "fork" context. The skill emphasizes GitHub Projects V2 management through GraphQL, with specific authentication requirements and notification capabilities via AI Maestro. While the file provides limited details on some aspects, it offers insights into the project's technical approach and integration strategy.
# AI Maestro Integrator Agent (AMIA) Analysis

Based on the provided `SKILL.md` file for the `amia-github-projects-sync` skill, here is the extracted information:

---

## 1. KANBAN COLUMNS

**

---
⚠ TRUNCATED (partial result due to timeout)