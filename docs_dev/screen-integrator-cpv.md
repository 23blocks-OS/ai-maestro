# LLM Externalizer Response

- **Tool**: `check_against_specs`
- **Model**: `ensemble: google/gemini-2.5-flash + x-ai/grok-4.1-fast`
- **Timestamp**: 2026-03-26T22:07:56.727Z
- **Input file**: `/tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/SKILL.md`
- **Task**: Spec compliance: cpv-compliance-spec.md vs 556 file(s)

---

## Batch 1/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/api-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/test-engineering.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/debug-procedures.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/integration-verification.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/rollback-procedures.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/cicd-integration.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/post-release-verification.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-process.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/pre-release-verification.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/cross-platform-hook-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/error-handling.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/blocking-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/semantic-versioning.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/communication-guidelines.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/review-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-process-override.md

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/api-operations.md
Location: GitHub API Operations Reference
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The document uses `## Contents` instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/test-engineering.md
Location: Test Engineering Procedures
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The document uses `## Contents` instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/integration-verification.md
Location: Integration Verification Procedures
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The document uses `## Contents` instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/cross-platform-hook-patterns.md
Location: Cross-Platform Hook Patterns
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The document uses `## Table of Contents` but it is on line 3, not within the first 50 lines.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/error-handling.md
Location: Error Handling in Code Reviews
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The document uses `## Table of Contents` but it is on line 3, not within the first 50 lines.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/communication-guidelines.md
Location: Code Review Communication Guidelines
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The document uses `## Table of Contents` but it is on line 3, not within the first 50 lines.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/review-workflow.md
Location: Code Review Workflow Reference
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The document uses `## Contents` instead of `## Table of Contents`.
Severity: MEDIUM

SUMMARY:
- CRITICAL: 0
- HIGH: 0
- MEDIUM: 7
- LOW: 0

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/api-operations.md  
**Location**: Document header (first 50 lines)  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses "## Contents" instead of the required "## Table of Contents" header. TOC entries use proper anchor links (e.g., `- 1.1 [Executing GitHub Issue Operations](#11-executing-github-issue-operations)`).  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/test-engineering.md  
**Location**: Document header (first 50 lines)  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses "## Contents" instead of the required "## Table of Contents" header. TOC entries use proper anchor links (e.g., `- 1.1 When verifying TDD cycle compliance (RED-GREEN-REFACTOR pattern)`).  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/integration-verification.md  
**Location**: Document header (first 50 lines)  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses "## Contents" instead of the required "## Table of Contents" header. TOC entries use proper anchor links (e.g., `- [1. Verifying Component Integration Readiness](#1-verifying-component-integration-readiness)`).  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-process-override.md  
**Location**: Document header (first 50 lines)  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses "## Contents" instead of the required "## Table of Contents" header. TOC entries use proper anchor links (e.g., `- [Purpose](#purpose)`).  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/review-workflow.md  
**Location**: Document header (first 50 lines)  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses "## Contents" instead of the required "## Table of Contents" header. TOC entries use proper anchor links (e.g., `- 1. When starting a code review task`).  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/debug-procedures.md  
CLEAN — no spec violations found.  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/rollback-procedures.md  
CLEAN — no spec violations found.  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/cicd-integration.md  
CLEAN — no spec violations found.  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/post-release-verification.md  
CLEAN — no spec violations found.  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-process.md  
CLEAN — no spec violations found.  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/semantic-versioning.md  
CLEAN — no spec violations found.  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/error-handling.md  
CLEAN — no spec violations found.  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/blocking-workflow.md  
CLEAN — no spec violations found.  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/communication-guidelines.md  
CLEAN — no spec violations found.  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/cross-platform-hook-patterns.md  
CLEAN — no spec violations found.  

## SUMMARY
- CRITICAL: 0
- HIGH: 0
- MEDIUM: 5
- LOW: 0
- Total: 5

---

## Batch 2/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/commit-conventions.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-workflow-chain.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/edge-case-protocols.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/status-transitions.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/pr-evaluation.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/worktree-safety-checks.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/automation-scripts.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-types.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-5-false-positive-detection.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/troubleshooting-agreement.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/ai-maestro-message-templates.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/github-sync-procedure.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-pr-auto-labeling.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/cross-platform-development-rules.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part1-basic-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/conventional-commits-validation.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-worktree-scripts.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/projects-v2-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/common-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/polling-strategies.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/git-cliff-integration.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-minimum-permissions.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/label-management.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-security-scanning.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-configure-pre-push-hook.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/troubleshooting-coverage.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/backward-compatibility.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part2-management-scripts.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/agent-assignment-via-board.md

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/commit-conventions.md
Location: 1.1 Writing Descriptive Commit Messages with WHAT and WHY Sections
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1.1 Writing descriptive commit messages with WHAT and WHY sections" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-workflow-chain.md
Location: 1. Why Release Automation Uses Two Separate Workflows Instead of One
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1. Why release automation uses two separate workflows instead of one" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/edge-case-protocols.md
Location: 1.0 AI Maestro Unavailable
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1.0 AI Maestro Unavailable" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/status-transitions.md
Location: 5.1 Transition Matrix
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "5.1 Transition Matrix" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/pr-evaluation.md
Location: 1.0 When to evaluate a PR for merge readiness
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1.0 When to evaluate a PR for merge readiness" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/worktree-safety-checks.md
Location: 1. Understanding git worktrees and why they create problems for hooks
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1. Understanding git worktrees and why they create problems for hooks" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/automation-scripts.md
Location: Use-Case TOC
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "Use-Case TOC" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-types.md
Location: Overview
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "Overview" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-5-false-positive-detection.md
Location: D5.1 When to apply false positive detection
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "D5.1 When to apply false positive detection" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/troubleshooting-agreement.md
Location: Problem Description
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "Problem Description" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/ai-maestro-message-templates.md
Location: 1.0 Standard AI Maestro Messaging Approach
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1.0 Standard AI Maestro Messaging Approach" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/github-sync-procedure.md
Location: 1.1 Authenticating and verifying GitHub CLI access
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1.1 Authenticating and verifying GitHub CLI access" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-pr-auto-labeling.md
Location: 7.1 Three Label Categories
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "7.1 Three Label Categories" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/cross-platform-development-rules.md
Location: 1. When to Apply These Rules
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1. When to Apply These Rules" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part1-basic-workflow.md
Location: Use-Case TOC
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "Use-Case TOC" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/conventional-commits-validation.md
Location: 1. Understanding the Conventional Commits format before implementing validation
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1. Understanding the Conventional Commits format before implementing validation" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-worktree-scripts.md
Location: worktree_create.py - Creating new worktrees
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "worktree_create.py - Creating new worktrees" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/projects-v2-operations.md
Location: Creating Projects V2 Board
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "Creating Projects V2 Board" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/common-patterns.md
Location: Use-Case TOC
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "Use-Case TOC" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/polling-strategies.md
Location: 1. When to Poll for Check Completion
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1. When to Poll for Check Completion" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/git-cliff-integration.md
Location: 1. What git-cliff Is and When to Use It
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1. What git-cliff Is and When to Use It" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-minimum-permissions.md
Location: 9.1 Understanding Default GITHUB_TOKEN Permissions
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "9.1 Understanding Default GITHUB_TOKEN Permissions" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/label-management.md
Location: 1.1 Creating Labels via GitHub API
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1.1 Creating Labels via GitHub API" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-security-scanning.md
Location: 6.1 CodeQL Setup with Language Matrix
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "6.1 CodeQL Setup with Language Matrix" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-configure-pre-push-hook.md
Location: 1. Understanding git hook basics before creating a pre-push hook
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "1. Understanding git hook basics before creating a pre-push hook" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/troubleshooting-coverage.md
Location: Problem Description
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "Problem Description" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/backward-compatibility.md
Location: Purpose
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "Purpose" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part2-management-scripts.md
Location: Script Reference: Management Scripts
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "Script Reference: Management Scripts" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/agent-assignment-via-board.md
Location: 4.1 Assignment Principle
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, "4.1 Assignment Principle" is not an anchor link.
Severity: MEDIUM

SUMMARY:
- MEDIUM: 27

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/commit-conventions.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Uses '## Contents' header (not exact '## Table of Contents') starting line 3; TOC entries are plain numbered lists (e.g., '- 1.1 Writing descriptive commit messages...') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-workflow-chain.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Uses '## Contents' header (not exact '## Table of Contents') starting line 3; TOC entries are plain numbered lists (e.g., '- 1. Why release automation...') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/edge-case-protocols.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Has '## Table of Contents' header starting line ~10 (within first 50 lines); TOC entries are plain lists (e.g., '- 1.0 AI Maestro Unavailable') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/pr-evaluation.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Uses '## Contents' header (not exact '## Table of Contents') starting line 3; TOC entries are plain numbered lists (e.g., '- 1.0 When to evaluate...') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/worktree-safety-checks.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Has '## Table of Contents' header starting line ~5 (within first 50 lines); TOC entries are plain numbered lists (e.g., '- 1. Understanding git worktrees...') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/automation-scripts.md  
**CLEAN — no spec violations found.**  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-types.md  
**CLEAN — no spec violations found.**  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-5-false-positive-detection.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Has '## Table of Contents' header starting line ~5 (within first 50 lines); TOC entries are plain lists (e.g., '- D5.1 When to apply...') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/troubleshooting-agreement.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Has '## Table of Contents' header starting line ~5 (within first 50 lines); TOC entries are plain lists (e.g., '- If you need to understand...') without anchor links (uses → arrows).  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/ai-maestro-message-templates.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Uses '## Contents' header (not exact '## Table of Contents') starting line 3; TOC entries are plain numbered lists (e.g., '- 1.0 Standard AI Maestro...') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/github-sync-procedure.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Uses '## Contents' header (not exact '## Table of Contents') starting line 3; TOC entries are plain numbered lists (e.g., '- 1.1 Authenticating...') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-pr-auto-labeling.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Has '## Table of Contents' header starting line ~3 (within first 50 lines); TOC entries are plain numbered lists (e.g., '- 7.1 Three Label Categories') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/cross-platform-development-rules.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Has '## Table of Contents' header starting line ~5 (within first 50 lines); TOC entries are plain numbered lists (e.g., '- 1. When to Apply These Rules') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part1-basic-workflow.md  
**CLEAN — no spec violations found.**  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/conventional-commits-validation.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Has '## Table of Contents' header starting line ~3 (within first 50 lines); TOC entries are plain numbered lists (e.g., '- 1. Understanding the Conventional Commits format...') without anchor links.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-worktree-scripts.md  
**CLEAN — no spec violations found.**  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/projects-v2-operations.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents`

---

## Batch 3/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees-part2-post-removal.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/review-output-template.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/security-analysis.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/docker-worktree-testing-part1-setup.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/performance-analysis.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/label-taxonomy.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/claude-pr-handling.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/template-pull-request.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/diff-analysis.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/testing-analysis.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part3-port-scripts.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/failure-scenarios.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part3-cicd.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/escalation-procedures.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/merge-failure-recovery.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/batch-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part5-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part2-advanced-topics.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-validate-release-tags.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-job-summaries.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/github-infrastructure-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/troubleshooting-calibration.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/references/thread-conversation-tracking.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/template-bug-report.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-update-readme-badges.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/pr-metadata.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/code-quality.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part2-allocation-cli.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/multi-user-workflow-part1-setup.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-column-semantics.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part1-fundamentals.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/pull-request-management.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/phase-1-context-gathering.md

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees-part2-post-removal.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. [After removing a worktree → Post-Removal Steps](#post-removal-steps)" should be "- [After removing a worktree → Post-Removal Steps](#post-removal-steps)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/review-output-template.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "T.1 When to generate the review output" should be "- [When to generate the review output](#t1-when-to-generate-the-review-output)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/template-pull-request.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. When to Use This Template" should be "- [When to Use This Template](#1-when-to-use-this-template)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/diff-analysis.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. Understanding Diff Output" should be "- [Understanding Diff Output](#1-understanding-diff-output)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/failure-scenarios.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. Subtask Reports Failure After Others In Progress" should be "- [Subtask Reports Failure After Others In Progress](#1-subtask-reports-failure-after-others-in-progress)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part5-troubleshooting.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "Problem: Script says "worktree already exists" but directory is empty" should be "- [Problem: Script says "worktree already exists" but directory is empty](#problem-script-says-worktree-already-exists-but-directory-is-empty)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/batch-operations.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "Use-Case TOC" should be "- [Use-Case TOC](#use-case-toc)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-validate-release-tags.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. When to validate release tags before creating them" should be "- [When to validate release tags before creating them](#1-when-to-validate-release-tags-before-creating-them)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-job-summaries.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "8.1 Understanding Job Summaries" should be "- [Understanding Job Summaries](#81-understanding-job-summaries)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/github-infrastructure-patterns.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "5.1 Missing Labels" should be "- [Missing Labels](#51-missing-labels)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/references/thread-conversation-tracking.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "2.1 Getting thread history via GraphQL" should be "- [Getting thread history via GraphQL](#21-getting-thread-history-via-graphql)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/template-bug-report.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. When to Use This Template" should be "- [When to Use This Template](#1-when-to-use-this-template)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-update-readme-badges.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. When to update README badges as part of a release" should be "- [When to update README badges as part of a release](#1-when-to-update-readme-badges-as-part-of-a-release)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/pr-metadata.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. PR Metadata JSON Structure" should be "- [PR Metadata JSON Structure](#1-pr-metadata-json-structure)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part2-allocation-cli.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. When you need to allocate ports programmatically → Port Allocation Functions" should be "- [When you need to allocate ports programmatically → Port Allocation Functions](#port-allocation-functions)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/multi-user-workflow-part1-setup.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "SSH Key Setup" should be "- [SSH Key Setup](#ssh-key-setup)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-column-semantics.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "2.1 [Overview of the 8-column workflow](#21-overview)" should be "- [Overview of the 8-column workflow](#21-overview)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part1-fundamentals.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. When you need to understand testing in isolated worktrees → Overview" should be "- [When you need to understand testing in isolated worktrees → Overview](#overview)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/pull-request-management.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "Creating Pull Requests" should be "- [Creating Pull Requests](#creating-pull-requests)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/docker-worktree-testing-part1-setup.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. When you need to understand Docker with worktrees - Overview" should be "- [When you need to understand Docker with worktrees - Overview](#overview)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/security-analysis.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "When validating input handling → Verification Checklist: Input Validation" should be "- [When validating input handling → Verification Checklist: Input Validation](#input-validation)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/label-taxonomy.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. When starting with the label system" should be "- [When starting with the label system](#overview)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/performance-analysis.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "When reviewing algorithm efficiency → Verification Checklist: Algorithm Efficiency" should be "- [When reviewing algorithm efficiency → Verification Checklist: Algorithm Efficiency](#algorithm-efficiency)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/claude-pr-handling.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "Overview" should be "- [Overview](#overview)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/testing-analysis.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "When reviewing test coverage → Verification Checklist: Test Coverage" should be "- [When reviewing test coverage → Verification Checklist: Test Coverage](#test-coverage)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/detailed-guide.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "4 Phases Overview" should be "- [4 Phases Overview](#4-phases-overview)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part3-port-scripts.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "Script Reference: Port Scripts" should be "- [Script Reference: Port Scripts](#script-reference-port-scripts)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/escalation-procedures.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "Overview" should be "- [Overview](#overview)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/merge-failure-recovery.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "Overview" should be "- [Overview](#overview)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part2-advanced-topics.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "Team Onboarding" should be "- [Team Onboarding](#team-onboarding)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part3-cicd.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1. When integrating with CI/CD → CI/CD Integration" should be "- [When integrating with CI/CD → CI/CD Integration](#cicd-integration)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/troubleshooting-calibration.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "If you need to understand the problem → Problem Description" should be "- [If you need to understand the problem → Problem Description](#problem-description)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/code-quality.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "When checking if code is readable → Verification Checklist: Readability" should be "- [When checking if code is readable → Verification Checklist: Readability](#readability)".
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/phase-1-context-gathering.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are numbered lists instead of bullet points, and the anchor links are not formatted correctly. For example, "1.1 When to perform context gathering" should be "- [When to perform context gathering](#11-when-to-perform-context-gathering)".
Severity: MEDIUM

SUMMARY:
- MEDIUM: 28

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees-part2-post-removal.md  
**Location**: Table of Contents section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: TOC section exists in first 10 lines, but entries use numbered list format "1. [After removing a worktree → Post-Removal Steps](#post-removal-steps)" instead of unnumbered bullet "- [Section Name](#section-name)", and includes arrow "→" not matching exact pattern.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ai

---

## Batch 4/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/architecture-design.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part3-conflicts-health.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part2-execution.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/docker-worktree-testing-part2-best-practices.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/issue-management.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-port-management.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/design-document-protocol.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees-part1-basics.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-management.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/sub-agent-role-boundaries-template.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-basic.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-gate-job-pattern.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/auto-merge.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/quality-gate-changelog.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/stop-hook-integration.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/cross-platform-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/quality-gate-ci-checks.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/language-specific-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/override-examples.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/ai-agent-vs-human-workflow-part2-workflows.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/documentation-analysis-part2-common-issues.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/rules-and-constraints.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/verification-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-linting-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/pre-push-vs-pre-commit.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-optimized-matrix.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/completion-criteria.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/merge-strategies.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-dependency-updates.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part3-advanced.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-4-senior-review.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part1-schema-operations.md

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/architecture-design.md
Location: Architecture and Design Review
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- When evaluating SOLID principles adherence → Verification Checklist: Architectural Principles' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part3-conflicts-health.md
Location: Port Management - Part 3: Conflict Detection and Health Checking
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '1. [When you encounter port conflicts → Conflict Detection](#conflict-detection)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part2-execution.md
Location: Testing in Isolated Worktrees - Part 2: Test Execution & Database Patterns
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '1. [When you need to run tests → Running Tests in Isolation](#running-tests-in-isolation)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/docker-worktree-testing-part2-best-practices.md
Location: Docker Worktree Testing - Part 2: Best Practices & Troubleshooting
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '1. [If you need implementation guidelines - Best Practices](#best-practices)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/issue-management.md
Location: Issue Management
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- [Use-Case TOC](#use-case-toc)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-port-management.md
Location: Port Management Reference
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '1. [port_allocate.py](#port_allocatepy) - Allocating and releasing ports' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees-part1-basics.md
Location: Removing Worktrees - Part 1: Preparation and Basic Commands
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '1. [When you need to understand worktree removal → Overview](#overview)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-management.md
Location: Worktree Operations: Management
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '1. [If you need to protect a worktree from deletion → Locking and Unlocking Worktrees](#locking-and-unlocking-worktrees)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-gate-job-pattern.md
Location: CI Gate Job Pattern
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 1.1 Understanding the Gate Job Pattern' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/auto-merge.md
Location: Auto-Merge Configuration
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 3.1 Setting up auto-merge via GraphQL API' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/quality-gate-changelog.md
Location: Changelog Verification for Quality Gates
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 1. When to Require Changelog Verification as a Quality Gate' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/stop-hook-integration.md
Location: Stop Hook Integration
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 8.1 [The stop hook's role in orchestration](#81-stop-hook-role)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide.md
Location: Worktree Automation Scripts Guide
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '1. [Overview](#overview)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/ai-agent-vs-human-workflow-part2-workflows.md
Location: AI Agent vs Human Workflow - Part 2: Workflows and Coordination
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 9.5 [Review workflow differences and routing](#95-review-workflow)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/detailed-guide.md
Location: GitHub Projects Sync — Detailed Guide
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- [Critical Distinction](#critical-distinction)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/documentation-analysis-part2-common-issues.md
Location: Documentation Analysis: Common Issues
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- [Common Issues to Look For](#common-issues-to-look-for)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/rules-and-constraints.md
Location: TDD Rules and Constraints
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- [The Iron Law (Absolute)](#the-iron-law-absolute)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/detailed-guide.md
Location: CI Failure Patterns — Detailed Guide
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- [Failure Pattern Categories](#failure-pattern-categories)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/verification-workflow.md
Location: Verification Workflow
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 3.1 Pre-review verification checklist' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-linting-workflow.md
Location: CI Linting Workflow
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 5.1 Why Linting Should Be a Separate Workflow' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/override-examples.md
Location: Gate Override Examples
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- [Overview](#overview)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-troubleshooting.md
Location: Troubleshooting & Best Practices
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '1. [Common Problems and Solutions](#common-problems-and-solutions)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/pre-push-vs-pre-commit.md
Location: Pre-Push vs Pre-Commit Hook Strategy
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 1. When to choose pre-push hooks over pre-commit hooks for quality gates' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-optimized-matrix.md
Location: CI Optimized Matrix
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 4.1 Understanding Default Matrix Behavior' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/completion-criteria.md
Location: Completion Criteria
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 6.1 ALL criteria that must be true' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees.md
Location: Creating Git Worktrees
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- [Overview](#overview)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/merge-strategies.md
Location: Merge Strategies
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- 2.1 Merge commit strategy' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-dependency-updates.md
Location: Scenario Protocol: Dependency Update PRs
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- S-DEP.1 When to use this scenario protocol' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part3-advanced.md
Location: Implementation Guide Part 3: Advanced Implementation Topics
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- [Multi-Repository Projects](#multi-repository-projects)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-4-senior-review.md
Location: Dimension 4: Senior Developer Review
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- D4.1 When to apply senior developer review criteria' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/detailed-guide.md
Location: Code Review Patterns — Detailed Guide
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '- [Core Methodology: Two-Stage Review Process](#core-methodology-two-stage-review-process)' is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part1-schema-operations.md
Location: Registry System: Schema and Operations
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are not anchor links. For example, '1. [When you need to understand the registry system → Overview](#overview)' is not an anchor link.
Severity: MEDIUM

SUMMARY:
- MEDIUM: 29

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/architecture-design.md  
**Location**: Table of Contents section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`" (Rule 8)  
**What the code does**: Contains `## Table of Contents` in first 50 lines, but TOC entries are plain text pointers like "- When evaluating SOLID principles adherence → Verification Checklist: Architectural Principles" without markdown anchor link syntax (`[text](#anchor)`).  
**Severity**: MEDIUM (non-compliance)

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/sub-agent-role-boundaries-template.md  
**Location**: Top-level header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines" (Rule 8)  
**What the code does**: Uses `## Contents` instead of exact `## Table of Contents`. TOC entries are proper anchor links.  
**Severity**: MEDIUM (non-compliance)

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide.md  
**Location**: Top-level header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines" (Rule 8)  
**What the code does**: Uses `## Contents` instead of exact `## Table of Contents`. TOC entries are proper anchor links.  
**Severity**: MEDIUM (non-compliance)

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/detailed-guide.md  
**Location**: Top-level header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines" (Rule 8)  
**What the code does**: Uses `## Contents` instead of exact `## Table of Contents`. TOC entries are proper anchor links.  
**Severity**: MEDIUM (non-compliance)

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/auto-merge.md  
**Location**: Top-level header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines" (Rule 8)  
**What the code does**: Uses `## Contents` instead of exact `## Table of Contents`. TOC entries are proper anchor links.  
**Severity**: MEDIUM (non-compliance)

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part3-advanced.md  
**Location**: Top-level header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines" (Rule 8)  
**What the code does**: Uses `## Contents` instead of exact `## Table of Contents`. TOC entries are proper anchor links.  
**Severity**: MEDIUM (non-compliance)

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/rules-and-constraints.md  
**Location**: Top-level header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines" (Rule 8)  
**What the code does**: Uses `## Contents` instead of exact `## Table of Contents`. TOC entries are proper anchor links.  
**Severity**: MEDIUM (non-compliance)

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/detailed-guide.md  
**Location**: Top-level header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines" (Rule 8)  
**What the code does**: Uses `## Contents` instead of exact `## Table of Contents`. TOC entries are proper anchor links.  
**Severity**: MEDIUM (non-compliance)

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/detailed-guide.md  
**Location**: Top-level header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines" (Rule 8)  
**What the code does**: Uses `## Contents` instead of exact `## Table of Contents`. TOC entries are proper anchor links.  
**Severity**: MEDIUM (non-compliance)

CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part3-conflicts-health.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part2-execution.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/docker-worktree-testing-part2-best-practices.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/issue-management.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-port-management.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/design-document-protocol.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees-part1-basics.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-management.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-basic.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-gate-job-pattern.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/quality-gate-changelog.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/stop-hook-integration.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-troubleshooting.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/ai-agent-vs-human-workflow-part2-workflows.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/quality-gate-ci-checks.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/language-specific-patterns.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/override-examples.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/cross-platform-patterns.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/verification-workflow.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/completion-criteria.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-linting-workflow.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/pre-push-vs-pre-commit.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-optimized-matrix.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-dependency-updates.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-4-senior-review.md)  
CLEAN — no spec violations found. (/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part1-schema-operations.md)  

**SUMMARY**  
CRITICAL: 0  
HIGH: 0  
MEDIUM: 9  
LOW: 0

---

## Batch 5/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-path-filtered-triggers.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees-part3-advanced.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-1-problem-verification.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-advanced.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-performance.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-fundamentals.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/ci-status-interpretation.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part5-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/merge-state-verification.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part1-core-scripts.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/evaluation-criteria.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/ai-agent-vs-human-workflow-part1-fundamentals.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-concurrency-groups.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/template-issue-config.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/dependency-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/record-keeping.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-responsibilities.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/exit-code-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/human-vs-ai-assignment.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/syntax-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-2-redundancy-check.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/template-docs-issue.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part2-validation-cleanup.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates-part4-programmatic.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-escalate-release-blocker.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-validate-changelog-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-3-system-integration.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/core-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-bug-fixes.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/red-green-refactor-cycle.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-execute-rollback.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/polling-schedule.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part1-checklist.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-verification-part1-pre-cleanup-detection.md

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-path-filtered-triggers.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "3.1 Understanding Path Filters in Workflow Triggers", "3.2 Always Including the Workflow File Itself", "3.3 Common Path Filter Patterns", "3.4 Complete YAML Example with Push and Pull Request Path Filters", "3.5 Per-Event Scope of Path Filters", "3.6 Interaction with Gate Jobs", and "3.7 Anti-Pattern: Overly Broad Paths" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees-part3-advanced.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. If you need to remove multiple worktrees → Bulk Removal", "2. When you need to verify successful removal → Verification", "3. If you encounter removal problems → Troubleshooting", and "4. Quick command reference → Quick Reference" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-1-problem-verification.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "D1.1 When to apply problem verification", "D1.2 Identifying the exact error message or unexpected behavior", "D1.3 Determining root cause vs treating symptoms", "D1.4 Verifying the fix addresses the root cause", "D1.5 Documenting assumptions about the system and environment", "D1.6 Testing methodology: before/after, multi-platform, edge cases, automated tests", "D1.7 Red flags that indicate problem verification failure", and "D1.8 Example: A fix that treats symptoms vs one that addresses root cause" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-advanced.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. When creating large multi-issue features", "2. When proposing code refactoring", "3. When requesting documentation improvements", "4. When opening pull requests", "5. When defining code ownership", and "6. When creating issues via GitHub CLI" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-performance.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "S-PERF.1 When to use this scenario protocol", "S-PERF.2 Benchmark requirements (before and after)", "S-PERF.3 Multiple test runs and statistical significance", "S-PERF.4 Verifying no functionality regressions", "S-PERF.5 Significance justification (complexity vs improvement tradeoff)", and "S-PERF.6 Example: Reviewing a caching optimization PR" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-fundamentals.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1.1 What is a git worktree and why it exists", "1.2 Worktree vs clone vs checkout - choosing the right approach", "1.3 The shared git directory model explained", "1.4 When worktrees provide measurable benefits", "1.5 Common misconceptions about worktrees", and "1.6 Prerequisites and git version requirements" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/ci-status-interpretation.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. Understanding GitHub Check Conclusions", "1. Required vs Optional Checks", "1. Check Run vs Check Suite", and "1. Common CI Providers" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part5-troubleshooting.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. If you encounter port management problems → Troubleshooting" and "2. Summary" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/merge-state-verification.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1.1 Why `gh pr view --json state` can be stale", "1.2 GraphQL as the source of truth", "1.3 MergeStateStatus values explained", and "1.4 Pre-merge verification checklist" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part1-core-scripts.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Script Reference: Core Scripts", "worktree_create.py", "Purpose", "Usage Syntax", "Required Arguments", "Optional Arguments", "Examples with Explanations", "Exit Codes", "worktree_list.py", "Purpose", "Usage Syntax", "Optional Arguments", "Examples with Explanations", and "Exit Codes" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/evaluation-criteria.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. Code Quality", "2. Code Style", "3. Security", "4. Performance", "5. Testing", "6. Architecture & Design", "7. Evaluation Scoring", and "8. Review Checklist" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/detailed-guide.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "When to Use Worktrees", "When NOT to Use Worktrees", "Critical Constraints", "Decision Tree", "Script Usage Examples", "Error Handling", "Safety Warning: Destructive Operations", "Emergency Recovery", and "Quick Reference Card" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/ai-agent-vs-human-workflow-part1-fundamentals.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "9.1 Key differences in AI vs human workflow", "9.1a Review routing: AI Review vs Human Review", "9.2 Assignment strategies for AI agents", "9.3 Assignment strategies for human developers", and "9.4 Communication channels" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/detailed-guide.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Decision Tree", "GraphQL Source of Truth", "Script Usage Details", "Common Workflows", "Exit Codes Reference", "Error Handling", "Safety Warning", and "Script Locations" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-concurrency-groups.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "2.1 Understanding Concurrency Groups", "2.2 PR-Based Grouping Pattern", "2.3 Branch-Based Grouping for Push Workflows", "2.4 The `cancel-in-progress` Setting", "2.5 Best Practices for Group Naming", "2.6 When NOT to Cancel In-Progress Runs", and "2.7 Real-World Savings Example" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/detailed-guide.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Purpose and Principles", "Gate Types and Pipeline Position", "Error Handling", "Output Discipline", "Design Document Scripts", "Encoding Compliance Scripts", "Unicode Enforcement Scripts", "PR Gate Scripts", "Script Locations", and "Integration with Other Skills" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/template-issue-config.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. When to Use This Configuration", "1. Disabling Blank Issues", "1. Contact Links", "1. Complete Configuration (Ready to Copy)", "1. How the Template Chooser Appears to Users", and "1. Customization Notes" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/dependency-patterns.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "4.1 Module Import Path Issues", "4.2 Missing Dependencies in CI", and "4.3 Version Mismatches" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/record-keeping.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. Routing Log Format", "1. Integration Status Files", "1. Quality Reports", and "1. Session State Structure" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/release-responsibilities.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Overview", "Core Roles", "Release Manager", "Technical Lead", "Quality Assurance Lead", "DevOps Engineer", "Product Owner", "Responsibility Matrix (RACI)", "Escalation Path", "Level 1: Team Level", "Level 2: Management Level", "Level 3: Executive Level", "Communication Responsibilities", "Daily During Release Window", "Weekly (Pre-Release)", "Post-Release", "Decision Authority", "Release Manager Has Final Authority On", "Technical Lead Has Final Authority On", "QA Lead Has Final Authority On", "DevOps Engineer Has Final Authority On", "Product Owner Has Final Authority On", "Handoff Procedures", "Development to QA", "QA to DevOps", "DevOps to Operations", "Accountability Measures", "Success Metrics by Role", "Cross-Functional Collaboration", "Required Collaboration Points", "Collaboration Best Practices", "Conflict Resolution", "Continuous Improvement", and "Training and Development" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/exit-code-patterns.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "2.1 Exit Code Persistence", "2.2 Common Exit Codes by Tool", and "2.3 GitHub Actions Exit Code Handling" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/human-vs-ai-assignment.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "5.1 Identifying PR author type", "5.2 Communication style differences", "5.3 Escalation rules for human PRs", and "5.4 Direct action rules for AI PRs" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/detailed-guide.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "The Iron Rule", "Board Columns Quick Reference", "Command Integration: /create-issue-tasks", "Python Scripts Detailed Usage", "Error Handling", "Integration Points Summary", "Proactive Kanban Monitoring Summary", "Skill File Structure", and "Related Skills" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/syntax-patterns.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "3.1 Here-String and Heredoc Terminator Issues", "3.2 Shell Quoting Differences", and "3.3 Command Substitution Syntax" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/detailed-guide.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Decision Tree", "Semantic Versioning Quick Reference", "State-Based Verification Model", "Escalation Order", "Scripts Reference", "Critical Rules", "Error Handling", "AI Maestro Communication", "Examples", and "Reference Documentation Details" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-3-system-integration.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "D3.1 When to apply system integration validation", "D3.2 File path verification on target systems (macOS, Linux, Windows)", "D3.3 Cross-referencing paths with official documentation", "D3.4 Path handling: home directory expansion, relative vs absolute, platform-specific", "D3.5 Installation location accuracy across package managers", "D3.6 Red flags for integration failures", and "D3.7 Example: Validating a claimed binary installation path" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Use-Case TOC", "Part 1: Complete Implementation Checklist", "Phase Overview", "Phase 1: Prerequisites and Authentication", "Phase 2: Label System Setup", "Phase 3: GitHub Projects V2 Setup", "Phase 4-5: Issue and PR Workflows", "Phase 6: Automation Scripts", "Phase 7-8: Team Onboarding and Improvement", "Part 2: Agent Orchestrator Integration", "Topics Covered", "Integration Architecture", "Integration Patterns", "Agent Configuration", "Monitoring Agent-GitHub Health", "Next Steps After Implementation", "Team Onboarding", "Part 3: Advanced Implementation Topics", "Topics Covered", "Success Metrics", "Quick Reference", "Essential Commands", and "Related Documents" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Overview", "Document Map", "Part 1: Types and Creation", "Part 2: Environment Setup", "Part 3: Running Tests", "Part 4: Database Testing Patterns", "Part 5: Cleanup After Tests", "Part 6: CI/CD Integration", "Part 7: Troubleshooting and Summary", "Quick Reference", "Essential Commands", "When to Use Each Worktree Type", and "Related Documents" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part2-validation-cleanup.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. When you need schema and operations → Related Part", "2. When you need to enforce registry rules → Validation Rules", "3. When you need to clean stale entries → Automatic Cleanup", "4. If you encounter registry problems → Troubleshooting", and "5. When you need additional context → Related References" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates-part4-programmatic.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "2.4.1 Variable substitution (placeholder syntax, Python substitution)", "2.4.2 Dynamic content injection (system info, git info)", and "2.4.3 Template selection logic (type detection, combining selection with population)" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-escalate-release-blocker.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Purpose", "When to Use", "Prerequisites", "Procedure", "Step 1: Document the blocker", "Step 2: Assess impact", "Step 3: Prepare escalation message", "Description", "Impact", "What Was Attempted", "Decision Required", "Recommended Action", "Step 4: Create GitHub issue (if not exists)", "Step 5: Notify via AI Maestro", "Step 6: Update release state", "Blocker: v$VERSION ($TIMESTAMP)", "Step 7: Wait for decision", "Input", "Output", "Example Output", "Blocker Types", "Severity Levels", "Error Handling", "Cannot create issue", "AI Maestro unavailable", "Orchestrator unresponsive", "Complete Escalation Script", "Description", "Decision Required", and "Verification" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Quick Reference: Which Part to Read", "Part 1: Listing and Switching Worktrees", "Part 2: Updating Worktrees", "Part 3: Locking and Moving Worktrees", "Part 4: Checking Worktree Status", "Part 5: Syncing with Main Branch", "Part 6: Best Practices", "Part 7: Troubleshooting", and "Essential Commands Quick Reference" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-validate-changelog-gate.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. When to enforce changelog validation as a release gate", "1. How to extract a version section from CHANGELOG.md using AWK", "1. How to block a release when changelog entry is missing", "1. How to produce a job summary for CI/CD systems", "1. How to integrate changelog validation into a release pipeline", and "1. Troubleshooting changelog validation failures" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-2-redundancy-check.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "D2.1 When to apply redundancy checking", "D2.2 Searching for similar patterns in the codebase", "D2.3 Identifying when existing code already handles the case", "D2.4 List and array addition analysis: priority order and placement justification", "D2.5 Configuration changes vs code changes", "D2.6 Red flags for redundancy", and "D2.7 Example: Detecting a redundant path addition" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/template-docs-issue.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. When to Use This Template", "1. Template Fields Explained", "1. Auto-Labeling Strategy", "1. Complete YAML Template (Ready to Copy)", and "1. Customization Notes" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/core-operations.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "1. When starting with GitHub Projects operations", "2. When creating issues with project items", "3. When updating project item status", "4. When querying all project items", "5. When linking PRs to issues", "6. When adding comments to issues", and "7. When managing assignees" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/detailed-guide.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Coordinator Role", "TDD Cycle Details", "Core Principles Navigation", "Implementation Guidance Navigation", "Rules and Enforcement Navigation", "Problem Solving Navigation", "Progressive Learning Path", "RULE 14 Requirement Compliance", and "Error Handling" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-bug-fixes.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "S-BUG.1 When to use this scenario protocol", "S-BUG.2 Original error identification", "S-BUG.3 Root cause identification requirements", "S-BUG.4 Reproduction before the fix", "S-BUG.5 Fix demonstration", "S-BUG.6 Regression test requirement", and "S-BUG.7 Example: Reviewing a bug fix PR end-to-end" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/red-green-refactor-cycle.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Use-Case TOC", "Phase 1: RED (Write Failing Test)", "Phase 2: GREEN (Write Minimum Implementation)", "Phase 3: REFACTOR (Improve Code Quality)", "Cycle Flow", and "Cycle Completion" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-execute-rollback.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Purpose", "When to Use", "Prerequisites", "Procedure", "Step 1: Identify versions", "Step 2: Verify target version exists", "Step 3: Document rollback decision", "Impact Assessment", "Actions Taken", "Step 4: Mark bad release as deprecated (GitHub)", "Step 5: Handle package registry (npm)", "Step 6: Handle package registry (PyPI)", "Step 7: Create rollback issue", "Actions Taken", "Root Cause", "Prevention", "Step 8: Notify stakeholders", "Step 9: Verify rollback success", "Input", "Output", "Example Output", "CRITICAL: User Approval Required", "Error Handling", "Target version not found", "GitHub release edit fails", "npm deprecation fails", "Complete Rollback Script", and "Verification" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part1-checklist.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "Phase 1: Prerequisites and Authentication", "Phase 2: Label System Setup", "Phase 3: GitHub Projects V2 Setup", "Phase 4: Issue Workflow Implementation", "Phase 5: Pull Request Workflow", "Phase 6: Automation Scripts Setup", "Phase 7: Team Onboarding", and "Phase 8: Continuous Improvement" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-verification-part1-pre-cleanup-detection.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "4.1 Pre-Cleanup Verification Checklist", "Complete Verification Checklist", "Quick Verification Commands", "4.2 Detecting Files Written Outside Worktree Boundaries", "The Isolation Violation Problem", "Detection Method 1: Main Repo Status Check", "Detection Method 2: Timestamp Analysis", "Detection Method 3: Git Diff Against Expected State", "Detection Method 4: File System Monitoring", "Detection Method 5: Hash Comparison", and "Automated Isolation Check" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/polling-schedule.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries "7.1 Base polling frequency", "7.2 What to check on each poll", "7.3 Adaptive polling rules", and "7.4 Notification triggers" are not anchor links.
Severity: MEDIUM

SUMMARY:
- MEDIUM: 30

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/ci-path-filtered-triggers.md  
**Location**: Table of Contents section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Contains `## Table of Contents` within first 50 lines, but TOC entries are unlinked bullets like `- 3.1 Understanding Path Filters in Workflow Triggers` without `[text](#anchor)` format.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/dimension-1-problem-verification.md  
**Location**: Table of Contents section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Contains `## Table of Contents` within first 50 lines, but TOC entries are unlinked bullets like `- D1.1 When to apply problem verification` without `[text](#anchor)` format.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-performance.md  
**Location**: Table of Contents section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Contains `## Table of Contents` within first 50 lines, but TOC entries are unlinked bullets like `- S-PERF.1 When to use this scenario protocol` without `[text](#anchor)` format.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-fundamentals.md  
**Location**: Table of Contents section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Contains `## Table of Contents` within first 50 lines, but TOC entries are unlinked bullets like `- 1.1 What is a git worktree and why it exists` without `[text](#anchor)` format.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/ci-status-interpretation.md  
**Location**: Contents section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Contains `## Contents` within first 50 lines, but TOC entries are unlinked bullets like `- 1. Understanding GitHub Check Conclusions` without `[text](#anchor)` format.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part1-core-scripts.md  
**Location**: Contents section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must

---

## Batch 6/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/issue-to-module-mapping.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/core-concepts.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/worktree-coordination.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-document-failure.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/multi-user-workflow-part2-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/ci-notification-setup.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking-part3-progress-closing.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/status-management-part2-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/troubleshooting-performance.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/delegation-rules.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-core.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/references/thread-resolution-protocol.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-escalate-failure.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-archive-stale-memory.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/javascript-review-patterns-part1-style-types-modules.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-part1-read-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-verify-release-readiness.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-generate-changelog.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/routing-checklist.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part1-overview-registry.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/python-review-patterns-part2-imports-tests-linting.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-determine-version.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/plan-file-linking.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part2-advanced.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure-part1-test-creation.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/bot-categories.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/stage-two-deep-dive.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-log-release-decision.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-bump-version.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/error-handling.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/quick-reference-checklist.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/automation-scripts.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part1-standard-flow.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/skill-integrations.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part4-workflows.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-save-pr-state-comment.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/op-validate-session-state.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-load-handoff-docs.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/step-by-step-procedures.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-cleanup-worktree.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/op-interpret-check-conclusions.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/op-deserialize-session-state.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/python-review-patterns-part1-style-types-docstrings.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-deep-dive-analysis.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/phase-2-structured-analysis.md

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/issue-to-module-mapping.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `3.1 [The 1:1 principle: every module is exactly one issue](#31-the-11-principle)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/core-concepts.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [What is GitHub Projects V2](#what-is-github-projects-v2)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/worktree-coordination.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `4.1 When to use worktrees` which is missing the anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-document-failure.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/multi-user-workflow-part2-operations.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Use-Case TOC](#use-case-toc)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/ci-notification-setup.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [When understanding CI notification system](#overview)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking-part3-progress-closing.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [3.3 Milestone Progress Tracking](#33-milestone-progress-tracking)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/status-management-part2-operations.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [When updating status via API or scripts](#status-change-api)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/troubleshooting-performance.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- If you need to understand the problem → Problem Description` which is missing the anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/detailed-guide.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Challenges of Multilanguage Repositories](#challenges-of-multilanguage-repositories)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/delegation-rules.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `2.1 When to spawn subagents` which is missing the anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-core.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [When starting with issue templates](#overview)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/references/thread-resolution-protocol.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1.1 Why thread resolution is separate from replying` which is missing the anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-escalate-failure.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-archive-stale-memory.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/javascript-review-patterns-part1-style-types-modules.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [3.1 JavaScript/TypeScript Code Style Checklist](#31-javascripttypescript-code-style-checklist)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-part1-read-operations.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [When starting with GitHub Projects API](#overview)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-verify-release-readiness.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-generate-changelog.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/detailed-guide.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Decision Tree: Which Skill to Use?](#decision-tree-which-skill-to-use)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/routing-checklist.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Sub-Agent Routing Table](#sub-agent-routing-table)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/plan-file-linking.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [When understanding plan files](#overview)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part2-advanced.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [If you need advanced merge techniques → Advanced Scenarios](#advanced-scenarios)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure-part1-test-creation.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Step 1: Understand the Requirement](#step-1-understand-the-requirement) - When starting to implement a new feature` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/bot-categories.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Overview](#overview)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/stage-two-deep-dive.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `2.1 Objective and Purpose` which is missing the anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-log-release-decision.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-bump-version.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/error-handling.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [When encountering GitHub API errors](#overview)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/quick-reference-checklist.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- C.1 When to use this checklist` which is missing the anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/op-interpret-check-conclusions.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/op-deserialize-session-state.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-load-handoff-docs.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/step-by-step-procedures.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Phase 1: Understanding Prerequisites](#phase-1-understanding-worktree-prerequisites) - Before creating worktrees` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-cleanup-worktree.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-determine-version.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/automation-scripts.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [When using skill automation scripts](#overview)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part1-standard-flow.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [STEP 1: Check Registry for Conflicts](#step-1-check-registry-for-conflicts)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/python-review-patterns-part2-imports-tests-linting.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `2.4 Import organization and dependency management` which is missing the anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part1-overview-registry.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [When you need to understand port management → Overview](#overview)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/skill-integrations.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `1. [When integrating GitHub Projects with other AMOA skills](#overview)` which includes a number before the link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/detailed-guide.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Decision Tree](#decision-tree)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/detailed-guide.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Error Handling](#error-handling)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/python-review-patterns-part1-style-types-docstrings.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `2.1 Python code style and formatting checklist` which is missing the anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-deep-dive-analysis.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Purpose](#purpose)` which is missing the section number.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/phase-2-structured-analysis.md
Location: Table of Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `2.1 When to use the structured analysis framework` which is missing the anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-part4-workflows.md
Location: Contents
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries are formatted as `- [Common Workflows](#common-workflows)` which is missing the section number.
Severity: MEDIUM

SUMMARY:
- MEDIUM: 36

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/core-concepts.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-document-failure.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/ci-notification-setup.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"; "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Uses correct `## Table of Contents` header, but TOC entries use numbered format `1. [When understanding CI notification system](#overview)` instead of exact `- [Section Name](#section-name)`.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/status-management-part2-operations.md  
**Location**: document root  
**Spec rule violated**: "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Uses correct `## Table of Contents` header, but TOC entries use numbered format `1. [When updating status via API or scripts](#status-change-api)` instead of exact `- [Section Name](#section-name)`.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/detailed-guide.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-escalate-failure.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-archive-stale-memory.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-part1-read-operations.md  
**Location**: document root  
**Spec rule violated**: "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Uses correct `## Table of Contents` header, but TOC entries use numbered format `1. [When starting with GitHub Projects API](#overview)` instead of exact `- [Section Name](#section-name)`.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-verify-release-readiness.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-generate-changelog.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/detailed-guide.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/routing-checklist.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/README.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: No `## Table of Contents` section present at all.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part1-overview-registry.md  
**Location**: document root  
**Spec rule violated**: "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Uses correct `## Table of Contents` header, but TOC entries use numbered format `1. [When you need to understand port management → Overview](#overview)` instead of exact `- [Section Name](#section-name)`.  
**Severity**: MEDIUM (non-compliance)  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-load-handoff-docs.md  
**Location**: document root  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses `## Contents` instead of the exact required header `## Table of Contents`. TOC entries use correct `- [Section Name](#section-name)` format.  
**Severity**: MEDIUM (non-compliance)  

CLEAN — no spec violations found.  
**/tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/issue-to-module-mapping.md**  
**/tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/worktree-coordination.md**  
**/tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/multi-user-workflow-part2-operations.md**  
**/tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking-part3-progress-closing.md**  
**/tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/status-management-part2-operations.md** (TOC numbered but header correct; assuming minor) wait no, reported above. Wait, I have it as violation for numbered.  
Wait, in clean I listed only perfect ones.  

SUMMARY  
CRITICAL: 0  
HIGH: 0  
MEDIUM: 13  
LOW: 0

---

## Batch 7/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-verify-memory-freshness.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-create-handoff-doc.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/orchestrator-responsibilities.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/pr-evaluator-report-templates.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-check-concurrent-git-ops.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/op-analyze-pr-complexity.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-allocation-part4-cleanup-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/functional-correctness.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-verify-worktree-isolation.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/multi-user-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/status-management-part1-transitions.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-maintenance-part1-syncing.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-load-release-history.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-create-worktree.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/status-tracking.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part1-fundamentals.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure-part2-implementation-refactor.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-workflows.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/kanban-as-truth.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-create-release-tag.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/sub-issue-tracking.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/javascript-review-patterns-part2-testing-linting.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/op-validate-handoff-payload.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-identify-failure-pattern.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part5-commands-checklist.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-registry-validation.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/update-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/op-compile-multilang-review.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-classify-pr-author.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-worktree-commit-push.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-part2-bug-report.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part6-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/op-get-check-details.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-calculate-confidence.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part5-syncing.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/review-worktree-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-path-changes.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-load-pr-memory.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/post-merge-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/best-practices.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/op-get-pr-diff.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-fetch-pr-branch.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-detect-state-triggers.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/status-management.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part6-cicd.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part4-environment-setup.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/instruction-templates.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-detect-platform-issues.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-execute-review-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/op-review-cross-language.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-allocation-part1-core-concepts.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/op-wait-for-checks.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part2-orchestrator.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-list-worktrees.md, /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/op-get-pr-context.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/language-detection-part2-gitattributes-algorithm.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-get-board-state.md

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-load-release-history.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-verify-memory-freshness.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-create-handoff-doc.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-check-concurrent-git-ops.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/op-analyze-pr-complexity.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-verify-worktree-isolation.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/multi-user-workflow.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/detailed-guide.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-create-worktree.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/op-validate-handoff-payload.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-identify-failure-pattern.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-fetch-pr-branch.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-load-pr-memory.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-detect-state-triggers.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/op-get-check-details.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/op-wait-for-checks.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/implementation-guide-part2-orchestrator.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-list-worktrees.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/op-get-pr-context.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/op-review-cross-language.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-allocation-part1-core-concepts.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-detect-platform-issues.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-execute-review-gate.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/op-get-pr-diff.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-worktree-commit-push.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/op-create-release-tag.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/sub-issue-tracking.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/javascript-review-patterns-part2-testing-linting.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/update-patterns.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/op-compile-multilang-review.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part5-commands-checklist.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-registry-validation.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/post-merge-gate.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/best-practices.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part6-cicd.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part4-environment-setup.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/instruction-templates.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-classify-pr-author.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/status-tracking.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure-part2-implementation-refactor.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part1-fundamentals.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/scripts-guide-workflows.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/status-management-part1-transitions.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-maintenance-part1-syncing.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/references/detailed-guide.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/kanban-as-truth.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-part2-bug-report.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/status-management.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part5-syncing.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-calculate-confidence.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/review-worktree-workflow.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/references/scenario-path-changes.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part6-troubleshooting.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/references/detailed-guide.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/language-detection-part2-gitattributes-algorithm.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-get-board-state.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/functional-correctness.md
Location: Rule 8: Reference Files
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but it is not within the first 50 lines (it's on line 4). The spec says "in the first 50 lines", which implies it should be closer to the top. This is a stylistic interpretation, but the spec is strict.
Severity: LOW

SUMMARY:
- MEDIUM: 22
- LOW: 16

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-verify-memory-freshness.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses "## Contents" header instead of exact "## Table of Contents"  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/op-create-handoff-doc.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses "## Contents" header instead of exact "## Table of Contents"  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/orchestrator-responsibilities.md  
**Location**: TOC section  
**Spec rule violated**: "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: TOC entries use plain text with indentation (e.g., "- 1.1 What the orchestrator MUST do - 1.1.1 Monitor PR status periodically") instead of markdown anchor links  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/pr-evaluator-report-templates.md  
**Location**: TOC section  
**Spec rule violated**: "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: TOC entries use indentation without consistent anchor links (e.g., "- Example Evaluation Report - Executive Summary")  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/op-check-concurrent-git-ops.md  
**Location**: TOC section  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents

---

## Batch 8/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-push-and-monitor.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-apply-gate-label.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-merge-decision.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/op-get-pr-files.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-poll-kanban-changes.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/parallel-pr-workflow-part2-subagents-and-paths.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-maintenance-part3-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-verify-fix-locally.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/task-completion-checklist.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/pre-merge-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part2-updating.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-create-review-report.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-naming-conventions.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-allocation-part2-config-status.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part2-purpose-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/op-gh-cli-prereq-check.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/op-create-session-state.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-part1-feature-request.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-execute-pre-merge-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/op-create-handoff-payload.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-part5-docs-pr-cli.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/prerequisites-and-setup.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/language-detection-part1-extensions-shebang.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-allocation-part3-conflict-docker.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-execute-post-merge-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-apply-pattern-fix.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries-part2-filtered.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/op-get-pr-check-status.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part1-schema.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/op-handle-tdd-violation.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/gate-decision-flowchart.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part4-docker.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/review-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/op-run-multilang-linters.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part4-status.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-cleanup-part3-force-recovery.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/op-refactor-code.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/language-detection-part3-mixed-language.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part3-locking-moving.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-execute-pre-review-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/handoff-templates.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/op-verify-tdd-compliance.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/retrieval-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part7-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part4-cleanup.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/iteration-cycle-rules.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates-part3-tasks.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-maintenance-part2-best-practices.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates-part2-feature-requests.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/op-batch-dry-run.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/parallel-pr-workflow-part3-concurrency-and-example.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/phase-procedures.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries-part1-basic.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/op-get-language-linters.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-part4-refactor.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-updates.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part1-listing-switching.md, /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/references/op-mark-blocked-pr.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-identify-current-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure-part1-writing-tests.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/op-rollback-bad-merge.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part1-types-and-creation.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/op-write-failing-test.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part7-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-handle-failure.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-part3-epic.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-quick-scan.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/security-review-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/quick-start-workflows.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/troubleshooting.md

## Model: google/gemini-2.5-flash

I will now act as a strict specification compliance auditor. I will go through each provided source file and check it against the `cpv-compliance-spec.md` specification.

---

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-push-and-monitor.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-apply-gate-label.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-merge-decision.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/op-get-pr-files.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-poll-kanban-changes.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/parallel-pr-workflow-part2-subagents-and-paths.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-maintenance-part3-troubleshooting.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-verify-fix-locally.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/task-completion-checklist.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/pre-merge-gate.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part2-updating.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-create-review-report.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-naming-conventions.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-allocation-part2-config-status.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part2-purpose-patterns.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/op-gh-cli-prereq-check.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/op-create-session-state.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-part1-feature-request.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/language-detection-part1-extensions-shebang.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-allocation-part3-conflict-docker.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-execute-post-merge-gate.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-apply-pattern-fix.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries-part2-filtered.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/op-get-pr-check-status.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part1-schema.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/op-handle-tdd-violation.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/gate-decision-flowchart.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management-part4-docker.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/review-gate.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/language-detection-part3-mixed-language.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part4-status.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-cleanup-part3-force-recovery.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/op-refactor-code.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part3-locking-moving.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/references/detailed-guide.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-execute-pre-review-gate.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/handoff-templates.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/op-verify-tdd-compliance.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/retrieval-patterns.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part7-troubleshooting.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part4-cleanup.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/iteration-cycle-rules.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates-part3-tasks.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-maintenance-part2-best-practices.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates-part2-feature-requests.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/op-batch-dry-run.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/parallel-pr-workflow-part3-concurrency-and-example.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/phase-procedures.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries-part1-basic.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/op-get-language-linters.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-part4-refactor.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-updates.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part1-listing-switching.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/references/op-mark-blocked-pr.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-identify-current-gate.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure-part1-writing-tests.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/op-rollback-bad-merge.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part1-types-and-creation.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/op-write-failing-test.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part7-troubleshooting.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-handle-failure.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates-part3-epic.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-quick-scan.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/security-review-patterns.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/quick-start-workflows.md`
**Location**: `## Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

**File**: `/tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/troubleshooting.md`
**Location**: `## Table of Contents`
**Spec rule violated**: Rule 8: All reference .md files must have a `## Table of Contents` section in the first 50 lines
**What the code does**: The `## Table of Contents` section is on line 3, which is within the first 50 lines. However, the spec also states that "Each TOC entry must be an anchor link: `- [Section Name](#section-name)`". The entries in this file's TOC are not anchor links.
**Severity**: MEDIUM

---
## SUMMARY

- **CRITICAL**: 0
- **HIGH**: 0
- **MEDIUM**: 50
- **LOW**: 0

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-push-and-monitor.md  
**Location**: document header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**What the code does**: Uses "## Contents" instead of the required "## Table of Contents" header (TOC present at line 3 with anchor links, but header text does not match exactly)  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/op-apply-gate-label.md  
**Location**: document header  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines"  
**

---

## Batch 9/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/references/op-request-changes.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-run-diagnostic-script.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/op-post-issue-comment.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/handoff-protocols.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/op-implement-minimum-code.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-part6-best-practices.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/op-configure-auto-merge.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/pr-evaluator-scenarios.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/workflow-and-decision-tree.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-management.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/documentation-analysis.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-file-templates.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/op-execute-pr-merge.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-verification-part2-branch-remote-sync.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/parallel-pr-workflow-part1-creating-and-isolation.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/op-detect-pr-languages.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/handoff-documents.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-close-related-issues.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/op-add-issue-comment.md, /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/references/op-approve-and-merge.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/stage-one-quick-scan.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/parallel-pr-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/unicode-enforcement-hook.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-verification-part3-automated-manual.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part2-environment-setup.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-report-status.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-create-module-issue.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/op-batch-issue-filter.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/op-set-issue-labels.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/cross-platform-support.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/port-allocation.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-part2-mutations.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/script-multi-user-identity.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/review-worktree-isolation.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/op-create-issue.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/script-multi-user-identity-part2-core-commands.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/op-gh-cli-auth-check.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/cross-platform-testing-part4-docker.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates-part1-bug-reports.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/op-set-issue-milestone.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/account-strategy-decision-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-part2-mutations-section3-pr-utilities.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/op-check-merge-readiness.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns-part5-documentation.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/iron-law.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/op-update-item-status.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/documentation-analysis-part3-scoring-and-practices.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/troubleshooting-part4-cli-api.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-delegate-subagent.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/report-templates-part3-test.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-cleanup-part2-removal-procedures.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/troubleshooting-part4-hooks-recovery.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/report-templates-part2-quality.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part4-database-testing.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/op-query-project-items.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/creating-worktrees-part3-port-allocation.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/issue-templates.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/cross-platform-testing-part2-ci-matrix.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-part2-mutations-section1-item-mutations.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/op-get-issue-context.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns-part4-crossplatform.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/op-verify-merge-completion.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/pre-review-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-move-card.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/references/detailed-guide.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/script-multi-user-identity-part1-installation.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-cleanup.md, /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/quick-reference.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/script-multi-user-identity-part4-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-verify-completion.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/docker-worktree-testing.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/language-detection.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/report-templates-part5-summary.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-cleanup-part1-timing-verification.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/op-link-pr-to-issue.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/scripts/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/proactive-kanban-monitoring.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/troubleshooting-part3-pr-labels.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/troubleshooting-part1-issues-status.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-check-completion.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part3-passing-tests.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part3-running-tests.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking-part2-assigning.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/escalation-paths.md

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description starts with "Trigger with /amia-ai-pr-review. Use when performing deep evidence-based PR reviews, investigating false-positive fixes, or validating integration changes."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description starts with "Trigger with /amia-ai-pr-review. Use when performing deep evidence-based PR reviews, investigating false-positive fixes, or validating integration changes."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The TOC for `review-output-template` is not correctly embedded. It lists sub-sections without indentation and bullet points.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ai-pr-review-methodology/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The TOC for `detailed-guide` is not correctly embedded. It lists sub-sections without indentation and bullet points.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description starts with "Use when monitoring PR checks. Trigger with CI status, check verification, or PR readiness requests."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description starts with "Use when monitoring PR checks. Trigger with CI status, check verification, or PR readiness requests."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The TOC for `detailed-guide` is not correctly embedded. It lists sub-sections without indentation and bullet points.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description starts with "Use when accessing shared utilities and protocols. Trigger with cross-skill reference requests."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description starts with "Use when accessing shared utilities and protocols. Trigger with cross-skill reference requests."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description starts with "GitHub label taxonomy reference for the Integrator Agent. Use when managing PR reviews, updating PR status, or applying review labels. Trigger with review label requests."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description starts with "GitHub label taxonomy reference for the Integrator Agent. Use when managing PR reviews, updating PR status, or applying review labels. Trigger with review label requests."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The TOC for `detailed-guide` is not correctly embedded. It lists sub-sections without indentation and bullet points.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description starts with "Quality gate enforcement for PR integration. Use when verifying code through pre-review, review, pre-merge, or post-merge checkpoints. Trigger with /amia-enforce-gates."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description starts with "Quality gate enforcement for PR integration. Use when verifying code through pre-review, review, pre-merge, or post-merge checkpoints. Trigger with /amia-enforce-gates."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The TOC for `gate-pipeline` is not correctly embedded. It lists sub-sections without indentation and bullet points.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The TOC for `escalation-paths` is not correctly embedded. It lists sub-sections without indentation and bullet points.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The TOC for `override-policies` is not correctly embedded. It lists sub-sections without indentation and bullet points.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The TOC for `detailed-guide` is not correctly embedded. It lists sub-sections without indentation and bullet points.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description starts with "Session memory for PR reviews and integration work. Use when resuming reviews, tracking releases, or persisting context across sessions. Trigger with session resumption."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description starts with "Session memory for PR reviews and integration work. Use when resuming reviews, tracking releases, or persisting context across sessions. Trigger with session resumption."
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The TOC for `detailed-guide` is not correctly embedded. It lists sub-sections without indentation and bullet points.
Severity: MEDIUM

SUMMARY:
- CRITICAL: 0
- HIGH: 0
- MEDIUM: 8
- LOW: 10

---

## Model: x-ai/grok-4.1-fast

**File**: amia-quality-gates/references/unicode-enforcement-hook.md  
**Location**: document root (## Contents section)  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Contains "## Contents" (not exact "## Table of Contents") in first 50 lines, with bullet list entries lacking anchor links (e.g., "- When the Unicode enforcement hook runs" instead of "- [When the Unicode enforcement hook runs](#when-the-unicode-enforcement-hook-runs)").  
**Severity**: MEDIUM (non-compliance)  

**File**: amia-multilanguage-pr-review/references/cross-platform-testing-part4-docker.md  
**Location**: document root (## Table of Contents section)  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: "## Table of Contents" present in first 50 lines, but TOC entries lack anchor links (e.g., "- 7.4.1 Multi-platform Docker build with multi-stage" instead of "- [7.4.1 Multi-platform Docker build with multi-stage](#74-multi-platform-docker-build-with-multi-stage)").  
**Severity**: MEDIUM (non-compliance)  

**File**: amia-code-review-patterns/references/pr-evaluator-scenarios.md  
**Location**: document root (## Table of Contents section)  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: "## Table of Contents" present in first 50 lines, but sub-entries under "Common Scenarios" and "Troubleshooting" lack anchor links (e.g., "- Scenario 1: All Tests Pass").  
**Severity**: MEDIUM (non-compliance)  

**File**: amia-code-review-patterns/references/documentation-analysis-part3-scoring-and-practices.md  
**Location**: document root (## Table of Contents section)  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines - Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: "## Table of Contents" present, but some entries are plain bullets without anchors (e.g., under "Scoring Criteria").  
**Severity**: MEDIUM (non-compliance)  

CLEAN — no spec violations found. (All other 26 source files comply with Rule 8: contain `## Table of Contents` or equivalent `## Contents` in first 50 lines with anchor-linked TOC entries; no other rules apply as files are references, not SKILL.md or .sh scripts.)

## SUMMARY
**CRITICAL**: 0  
**HIGH**: 0  
**MEDIUM**: 4  
**LOW**: 0  
**Total**: 4

---

## Batch 10/10

Files: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/examples-and-inline-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/op-find-project.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/script-multi-user-identity-part3-advanced-commands.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-add-issue-to-board.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part2-usage-workflows.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part2-errors.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/examples.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-part2-mutations-section2-issue-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-verification.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part1-test-failures.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-collect-ci-logs.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part2-code-issues.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns-part3-shellcheck.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/cross-platform-testing-part3-test-skips.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns-part1-bash-checklist.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-gate0-compliance-check.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/requirement-compliance.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part4-testing.md, /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/references/op-start-pr-review.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-retrieval.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part5-cleanup.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries-part3-history.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/report-templates-part4-completion.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/implementation-checklist.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/parallel-pr-workflow-part4-error-recovery.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/gate-examples.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/troubleshooting-part2-projects-v2.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part5-troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/troubleshooting.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/pr-evaluator-checklist.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/encoding-compliance-checker.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/op-batch-label-add.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking-part1-creating.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part3-validation-advanced.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/ai-agent-vs-human-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/op-check-pr-merged.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-monitor-progress.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/troubleshooting-tag-branch-collision.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part4-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-maintenance.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-architecture.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/python-review-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-release-management/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part3-validation.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part4-automation-practices.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns-part3-error-handling.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns-part2-memory-safety.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-classify-work.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/javascript-review-patterns.md, /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-types.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-verification-part4-reporting.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/troubleshooting-part3-permissions-sync.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/cross-platform-testing-part1-multi-os.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-identify-author-type.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/cross-platform-testing.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns-part1-style-idioms.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/gate-pipeline.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/documentation-analysis-part1-checklists.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-poll-prs.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/report-templates-part1-progress.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part3-packages.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part2-operations.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part1-style.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/proactive-handoff-protocol.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/report-templates-part6-integration.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns-part2-posix-compat.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/SKILL.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/report-templates.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/troubleshooting-part2-assignment-api.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-index.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/rule-14-enforcement.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/planning-phase-mapping.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns-part4-clippy.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/removing-worktrees-index.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part1-core-concepts.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part5-linting.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure-part3-complete-example.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/troubleshooting-part1-authentication.md, /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/message-response-decision-tree.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/label-reference.md, /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/integration-points.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/single-account-workflow.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/gate-checklist.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/pre-pr-quality-gate.md, /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/override-policies.md, /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/README.md, /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/README.md

## Model: google/gemini-2.5-flash

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks.
Severity: HIGH

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md
Location: Examples
Spec rule violated: Must show expected output or result description after the code block
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists several reference documents but does not embed their Tables of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks for all examples. The second example only has a comment about the output.
Severity: HIGH

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/SKILL.md
Location: Examples
Spec rule violated: Must show expected output or result description after the code block
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks for all examples. The second example only has a comment about the output.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks for all examples. The first example has no output.
Severity: HIGH

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/SKILL.md
Location: Examples
Spec rule violated: Must show expected output or result description after the code block
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks for all examples. The first example has no output.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks for all examples. The first example has no output.
Severity: HIGH

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/SKILL.md
Location: Examples
Spec rule violated: Must show expected output or result description after the code block
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks for all examples. The first example has no output.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 6 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/SKILL.md
Location: Examples
Spec rule violated: Must contain at least one concrete input/output example
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks.
Severity: HIGH

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/SKILL.md
Location: Examples
Spec rule violated: Must show expected output or result description after the code block
What the code does: The "Examples" section contains code blocks but does not explicitly show expected output or result descriptions after the code blocks.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/SKILL.md
Location: Instructions
Spec rule violated: Must contain numbered steps (1. 2. 3. format)
What the code does: The "Instructions" section contains a "Checklist" subsection that is not a numbered step, violating the rule that all instructions must be numbered.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/SKILL.md
Location: Instructions
Spec rule violated: At least 3 numbered steps
What the code does: The "Instructions" section has 5 numbered steps, but then includes a "Checklist" subsection which is not a numbered step, effectively breaking the numbered sequence and not having at least 3 *consecutive* numbered steps for instructions.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/SKILL.md
Location: Instructions
Spec rule violated: Must have a `## Checklist` section (8th section, after Examples)
What the code does: The `## Checklist` section is placed inside the `## Instructions` section, not as a separate 8th top-level section after `## Examples`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/SKILL.md
Location: Resources
Spec rule violated: In the `## Resources` section, every referenced .md file must have its TOC embedded
What the code does: The `## Resources` section lists a detailed guide but does not embed its Table of Contents as indented bullets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/examples-and-inline-troubleshooting.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/examples-and-inline-troubleshooting.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/op-find-project.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/op-find-project.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Basic Queries", "Part 2: Filtered Queries", and "Part 3: History and Completion" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/script-multi-user-identity-part3-advanced-commands.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/script-multi-user-identity-part3-advanced-commands.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-add-issue-to-board.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/op-add-issue-to-board.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part2-usage-workflows.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part2-usage-workflows.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entry for "Usage Workflows" is not an anchor link.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part2-errors.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part2-errors.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its only entry `[5.2 Error Handling Patterns in Go](#52-error-handling-patterns-in-go)` is not correctly formatted as a list item with a hyphen.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Creating Milestones", "Part 2: Assigning Issues to Milestones", and "Part 3: Progress Tracking and Closing Milestones" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/examples.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/examples.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "1.1 When reviewing a PR from AMOA - Example: Review and Merge PR", "1.2 When verifying issue closure - Example: Issue Closure Requirements Check", "1.3 When using scripts for quick scan - Example: Script-Based Quick Scan", and "1.4 When performing full two-stage review - Example: Complete Two-Stage Review with Scripts" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-part2-mutations-section2-issue-operations.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/references/graphql-queries-part2-mutations-section2-issue-operations.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-verification.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-verification.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Pre-Cleanup and Isolation Detection", "Part 2: Branch and Remote Sync Verification", "Part 3: Automated and Manual Verification", and "Part 4: Reporting Violations" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part1-test-failures.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part1-test-failures.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-collect-ci-logs.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/references/op-collect-ci-logs.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part2-code-issues.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part2-code-issues.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns-part3-shellcheck.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns-part3-shellcheck.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its only entry `6.3 ShellCheck lints and fixes` is not correctly formatted as a list item with a hyphen.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/cross-platform-testing-part3-test-skips.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/cross-platform-testing-part3-test-skips.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Test Failures", "Part 2: Code Issues", "Part 3: Passing Tests", and "Part 4: Workflow Issues" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Core Concepts", "Part 2: Usage Workflows", "Part 3: Validation and Advanced Scenarios", "Part 4: Automation and Best Practices", and "Part 5: Troubleshooting and Integration" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns-part1-bash-checklist.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns-part1-bash-checklist.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its only entry `6.1 Bash/Shell script review checklist` is not correctly formatted as a list item with a hyphen.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-gate0-compliance-check.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/op-gate0-compliance-check.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/requirement-compliance.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/requirement-compliance.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part4-testing.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part4-testing.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its only entry `[5.4 Test Patterns with go test](#54-test-patterns-with-go-test)` is not correctly formatted as a list item with a hyphen.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/references/op-start-pr-review.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-label-taxonomy/references/op-start-pr-review.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-retrieval.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-retrieval.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must be under 200 characters
What the code does: The description is 201 characters long.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must NOT contain angle brackets like <query> or <file> (XML tag violation)
What the code does: The description contains `<query>` and `<file>` which are forbidden angle brackets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description includes "Use when merging pull requests, checking merge status, or configuring auto-merge." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description includes "Trigger with merge, auto-merge, or readiness verification requests." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must be under 200 characters
What the code does: The description is 201 characters long.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must NOT contain angle brackets like <query> or <file> (XML tag violation)
What the code does: The description contains `<query>` and `<file>` which are forbidden angle brackets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description includes "Use when merging pull requests, checking merge status, or configuring auto-merge." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description includes "Trigger with merge, auto-merge, or readiness verification requests." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must be under 200 characters
What the code does: The description is 201 characters long.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must NOT contain angle brackets like <query> or <file> (XML tag violation)
What the code does: The description contains `<query>` and `<file>` which are forbidden angle brackets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description includes "Use when merging pull requests, checking merge status, or configuring auto-merge." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description includes "Trigger with merge, auto-merge, or readiness verification requests." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part5-cleanup.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/testing-worktree-isolation-part5-cleanup.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries-part3-history.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries-part3-history.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Rust Code Style and Idioms", "Part 2: Memory Safety Patterns and Ownership", "Part 3: Error Handling with Result and Option", "Part 4: Clippy Lints and Configuration", and "Part 5: Documentation Standards with rustdoc" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/report-templates-part4-completion.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/report-templates-part4-completion.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/troubleshooting-part2-projects-v2.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/troubleshooting-part2-projects-v2.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/shell-review-patterns.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Bash/Shell Script Review Checklist", "Part 2: POSIX Compatibility Requirements", "Part 3: ShellCheck Lints and Fixes", and "Part 4: Cross-Platform Considerations" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part5-troubleshooting.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part5-troubleshooting.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/troubleshooting.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/troubleshooting.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Issue and Status Problems", "Part 2: Assignment and API Issues", "Part 3: Permissions and Sync Issues", and "Part 4: Stop Hook and Recovery Issues" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/pr-evaluator-checklist.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/pr-evaluator-checklist.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/encoding-compliance-checker.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/encoding-compliance-checker.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-maintenance.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/worktree-operations-maintenance.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Syncing with Main Branch", "Part 2: Best Practices", and "Part 3: Troubleshooting" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-architecture.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-session-memory/references/memory-architecture.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/python-review-patterns.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/python-review-patterns.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Style, Types, and Documentation" and "Part 2: Imports, Tests, and Linting" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking-part1-creating.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/milestone-tracking-part1-creating.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part3-validation-advanced.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part3-validation-advanced.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/ai-agent-vs-human-workflow.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/ai-agent-vs-human-workflow.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Fundamentals and Communication" and "Part 2: Workflows and Coordination" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/op-check-pr-merged.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/references/op-check-pr-merged.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-monitor-progress.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-monitor-progress.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/troubleshooting-tag-branch-collision.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/references/troubleshooting-tag-branch-collision.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part4-workflow.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/troubleshooting-part4-workflow.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part3-validation.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part3-validation.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part4-automation-practices.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/merge-safeguards-part4-automation-practices.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns-part3-error-handling.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns-part3-error-handling.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its only entry `[4.3 Error Handling with Result and Option](#43-error-handling-with-result-and-option)` is not correctly formatted as a list item with a hyphen.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns-part2-memory-safety.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/rust-review-patterns-part2-memory-safety.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its only entry `[4.2 Memory Safety Patterns and Ownership](#42-memory-safety-patterns-and-ownership)` is not correctly formatted as a list item with a hyphen.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-classify-work.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/references/op-classify-work.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must be under 200 characters
What the code does: The description is 201 characters long.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must NOT contain angle brackets like <query> or <file> (XML tag violation)
What the code does: The description contains `<query>` and `<file>` which are forbidden angle brackets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description includes "Use when managing GitHub Issues including creation, labels, milestones, assignees, and comments using gh CLI." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description includes "Trigger with create issue, set labels, assign milestone." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must be under 200 characters
What the code does: The description is 201 characters long.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must NOT contain angle brackets like <query> or <file> (XML tag violation)
What the code does: The description contains `<query>` and `<file>` which are forbidden angle brackets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description includes "Use when managing GitHub Issues including creation, labels, milestones, assignees, and comments using gh CLI." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description includes "Trigger with create issue, set labels, assign milestone." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must be under 200 characters
What the code does: The description is 201 characters long.
Severity: LOW

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must NOT contain angle brackets like <query> or <file> (XML tag violation)
What the code does: The description contains `<query>` and `<file>` which are forbidden angle brackets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description includes "Use when managing GitHub Issues including creation, labels, milestones, assignees, and comments using gh CLI." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description includes "Trigger with create issue, set labels, assign milestone." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/op-batch-label-add.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/op-batch-label-add.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/references/issue-templates.md
Spec rule violated: Each TOC entry must be an anchor link: `- [Section Name](#section-name)`
What the code does: The TOC entries for "Part 1: Bug Report Templates", "Part 2: Feature Request Templates", and "Part 3: Task Templates" are not anchor links.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must be under 200 characters
What the code does: The description is 199 characters long.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must NOT contain angle brackets like <query> or <file> (XML tag violation)
What the code does: The description contains `<query>` and `<file>` which are forbidden angle brackets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description includes "Use when managing GitHub Kanban boards." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description includes "Trigger with board state, card move, or completion requests." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must be under 200 characters
What the code does: The description is 199 characters long.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must NOT contain angle brackets like <query> or <file> (XML tag violation)
What the code does: The description contains `<query>` and `<file>` which are forbidden angle brackets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description includes "Use when managing GitHub Kanban boards." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description includes "Trigger with board state, card move, or completion requests." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must be under 200 characters
What the code does: The description is 199 characters long.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must NOT contain angle brackets like <query> or <file> (XML tag violation)
What the code does: The description contains `<query>` and `<file>` which are forbidden angle brackets.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must include "Use when ..." phrase
What the code does: The description includes "Use when managing GitHub Kanban boards." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md
Location: description
Spec rule violated: Must include "Trigger with /skill-name" phrase
What the code does: The description includes "Trigger with board state, card move, or completion requests." which is compliant.
Severity: CLEAN

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part3-packages.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part3-packages.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its only entry `[5.3 Package Organization and Naming](#53-package-organization-and-naming)` is not correctly formatted as a list item with a hyphen.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part2-operations.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/references/registry-system-part2-operations.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part1-style.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part1-style.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its only entry `[5.1 Go Code Style and Idioms Checklist](#51-go-code-style-and-idioms-checklist)` is not correctly formatted as a list item with a hyphen.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part5-linting.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/references/go-review-patterns-part5-linting.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its only entry `[5.5 Linting with golint, go vet, and staticcheck](#55-linting-with-golint-go-vet-and-staticcheck)` is not correctly formatted as a list item with a hyphen.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure-part3-complete-example.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/references/implementation-procedure-part3-complete-example.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `### Available Scripts` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/troubleshooting-part1-authentication.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/troubleshooting-part1-authentication.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## When to Use This Skill` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## When to Use` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/message-response-decision-tree.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/references/message-response-decision-tree.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/label-reference.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/label-reference.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/integration-points.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/integration-points.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/single-account-workflow.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/single-account-workflow.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## When to Use` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## When to Use` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Purpose` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/gate-checklist.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/gate-checklist.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/pre-pr-quality-gate.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/references/pre-pr-quality-gate.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/override-policies.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-quality-gates/references/override-policies.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Table of Contents` section, but its entries are not correctly formatted as list items with hyphens.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Purpose` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Purpose` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-integration-protocols/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## Contents` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## When to Use` section instead of `## Table of Contents`.
Severity: MEDIUM

File: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/README.md
Location: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-checks/README.md
Spec rule violated: All reference .md files must have a `## Table of Contents` section in the first 50 lines
What the code does: The file has a `## When to Use` section instead of `## Table of Contents`.
Severity: MEDIUM

SUMMARY:
- HIGH: 3
- MEDIUM: 104
- LOW: 9

---

## Model: x-ai/grok-4.1-fast

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md  
**Location**: Frontmatter (description field)  
**Spec rule violated**: "Must include "Trigger with /skill-name" phrase"  
**What the code does**: Uses "Trigger with /review-pr [PR_NUMBER]" instead of "/amia-github-pr-context" or similar skill name.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: "Every SKILL.md must contain these exact section headers: ## Overview ## Prerequisites ## Instructions ## Output ## Error Handling ## Examples ## Resources"  
**What the code does**: Has "Reference Documents" section between Output and Error Handling; Examples after Resources; Checklist subsection under Instructions (not separate ## Checklist after Examples).  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md  
**Location**: ## Instructions section  
**Spec rule violated**: "Must have a `## Checklist` section (8th section, after Examples)" and "Must start with: "Copy this checklist and track your progress:"" and "Must contain at least 3 items using `- [ ]` format"  
**What the code does**: Checklist is subsection under Instructions (not separate after Examples); starts with "- [ ] GitHub CLI authenticated".  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-context/SKILL.md  
**Location**: ## Resources section  
**Spec rule violated**: "In the `## Resources` section, every referenced .md file must have its TOC embedded Format: indented bullets under the link listing all headings from the referenced file"  
**What the code does**: Lists links like "- [pr-metadata](references/pr-metadata.md) — PR metadata JSON structure" without indented TOC bullets (e.g., no "- CLI Quick Reference"). Ends with "See `references/` directory for all reference documents." and "Full reference: [detailed-guide](references/detailed-guide.md):" with list but no embedded TOC.  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: "Every SKILL.md must contain these exact section headers: ## Overview ## Prerequisites ## Instructions ## Output ## Error Handling ## Examples ## Resources"  
**What the code does**: Has Output, Error Handling, Examples, Resources but Checklist under Instructions (not separate ## Checklist after Examples).  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-tdd-enforcement/SKILL.md  
**Location**: ## Instructions section  
**Spec rule violated**: "Must have a `## Checklist` section (8th section, after Examples)"  
**What the code does**: Checklist subsection under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: "Every SKILL.md must contain these exact section headers: ## Overview ## Prerequisites ## Instructions ## Output ## Error Handling ## Examples ## Resources"  
**What the code does**: Missing ## Output (has table under it? No explicit); Checklist under Instructions; Examples absent? Wait, no Examples section. Resources present.  
**What the code does**: Sections: Overview, Prereq, Instructions (numbered, Checklist inside), Output table?, Reference Docs?, Error Handling, Resources, Examples code. Mismatched order, no exact match.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: "Must have a `## Checklist` section (8th section, after Examples)"  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2 exact sections  
**What the code does**: Has Checklist under Instructions; Reference Documents before Error Handling; Resources after Examples? Order wrong.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-thread-management/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5 Checklist position  
**What the code does**: Under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-merge/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**What the code does**: Under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**What the code does**: Under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-git-worktree-operations/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**What the code does**: Under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-release-management/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**What the code does**: Under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: No ## Output (table under?); Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-issue-operations/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**What the code does**: Under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-multilanguage-pr-review/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-pr-workflow/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-ci-failure-patterns/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-code-review-patterns/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/SKILL.md  
**Location**: Main body sections  
**Spec rule violated**: Rule 2  
**What the code does**: Checklist under Instructions.  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-projects-sync/SKILL.md  
**Location**: ## Instructions  
**Spec rule violated**: Rule 5  
**Severity**: HIGH  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-kanban-orchestration/references/board-queries.md  
**Location**: ## Table of Contents  
**Spec rule violated**: "All reference .md files must have a `## Table of Contents` section in the first 50 lines Each TOC entry must be an anchor link: `- [Section Name](#section-name)`"  
**What the code does**: Has ## Table of Contents, but entries like "- 7.1 Full Board State - Get complete board..." are plain text, not `- [Full Board State](#full-board-state)`; links to other files like See [board-queries-part1-basic.md].  
**Severity**: MEDIUM  

**File**: /tmp/ai-maestro-integrator-agent/skills/amia-github-integration/references/script-multi-user-identity-part