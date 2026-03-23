# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-INTEGRATOR-AGENT/ai-maestro-integrator-agent/scripts/amia_github_pr_gate.py`
- **Task**: You are analyzing Python scripts from the "AI Maestro Integrator Agent" (AMIA). These manage GitHub Projects V2 kanban and PR quality gates.

For each script, extract:
1. GITHUB PROJECTS V2 GRAPHQL: All GraphQL queries and mutations used. Project field IDs, column IDs, card operations.
2. KANBAN COLUMNS: What columns are referenced? Hardcoded column names? Status field values?
3. CARD OPERATIONS: How are cards created, moved, updated? What metadata is set?
4. QUALITY GATE CHECKS: What checks must pass before a PR can be merged? Test results, linting, etc.
5. API ENDPOINTS: Any direct calls to AI Maestro API (localhost:23000)?
6. SYNC DIRECTION: Does this sync from GitHub→local, local→GitHub, or bidirectional?

Extract exact GraphQL queries, column names, and field structures.
- **Model**: `minimax/minimax-m2.5`

---

The user wants me to analyze the Python script `amia_github_pr_gate.py` and extract specific information about:

1. GITHUB PROJECTS V2 GRAPHQL: All GraphQL queries and mutations used
2. KANBAN COLUMNS: What columns are referenced
3. CARD OPERATIONS: How cards are created, moved, updated
4. QUALITY GATE CHECKS: What checks must pass before PR can merge
5. API ENDPOINTS: Any direct calls to AI Maestro API
6. SYNC DIRECTION: Does this sync from GitHub→local, local→GitHub, or bidirectional?

Let me analyze this file:

**1. GITHUB PROJECTS V2 GRAPHQL:**
Looking at the code, I don't see any GraphQL queries being used. The script uses the `gh` CLI instead of making direct GraphQL calls. The PR info is retrieved using `gh pr view --json ...` which uses the GitHub CLI's built-in JSON output.

**2. KANBAN COLUMNS:**
There are no kanban columns referenced in this script. This script is about PR gates, not about GitHub Projects V2.

**3. CARD OPERATIONS:**
No card operations in this script. It's about PR management.

**4. QUALITY GATE CHECKS:**
The script imports gate checks from `amia_github_pr_gate_checks`:
- `check_draft_gate` - checks if PR is not a draft
- `check_mergeable_gate` - checks for merge conflicts
- `check_tests_gate` - checks if all CI checks passing
- `check_reviews_gate` - checks for required approvals
- `check_spec_gate` - checks if feature PRs linked to approved spec
- `check_linked_issues_gate` - checks linked issues

The gates are defined in `run_all_gates` function (lines 119-137).


The script doesn't interact with any AI Maestro API endpoints—it relies solely on the `gh` CLI for GitHub operations. Since this script focuses on PR quality gates rather than project synchronization, there's no sync direction to consider. The script retrieves PR data through the GitHub CLI and validates it against defined quality gates.
Looking at the provided file `amia_github_pr_gate.py`, I need to analyze it according to the task requirements. Let me provide a detailed extraction:

---

## Analysis of `amia_github_pr_gate.py`

### 1. GITHUB PROJECTS V2 GRAPHQL
**None.** This script does NOT use GraphQL queries. It uses the `gh` CLI (GitHub CLI) instead for all GitHub operations.

The PR data is retrieved via `gh pr view` with JSON output (lines 60-73):
```python
cmd = [
    "pr",
    "view",
    str(pr_number),
    "--json",
    "number,title,body,state,isDraft,labels,author,reviewRequests,"
    "reviews,statusCheckRollup,mergeable,headRefName,baseRefName",
]
```

### 2. KANBAN COLUMNS
**None.** This script does NOT reference any GitHub Projects V2 kanban columns. It is focused on PR quality gates, not project board management.

### 3. CARD OPERATIONS
**None.** No card creation, movement, or updates in this script.

### 4. QUALITY GATE CHECKS
The script enforces the following gates (defined in `run_all_gates`, lines 119-137):

| Gate | Function | Check |
|------|----------|-------|
| `draft` | `check_draft_gate(pr)` | PR is not a draft |
| `mergeable` | `check_mergeable_gate(pr)` | No merge conflicts |
| `tests` | `check_tests_gate(pr)` | All CI checks passing (statusCheckRollup conclusion == "SUCCESS") |
| `reviews` | `check_reviews_gate(pr, min_approvals)` | Required approvals present |
| `spec` | `check_spec_gate(pr, project_root)` | Feature PRs linked to approved spec |
| `issues` | `check_linked_issues_gate(pr)` | Linked to issues (recommended) |

The checks are imported from `amia_github_pr_gate_checks` module (line 24-31):
```python
from amia_github_pr_gate_checks import (
    GateResult,
    PRInfo,
    check_draft_gate,
    check_linked_issues_gate,
    check_mergeable_gate,
    check_reviews_gate,
    check_spec_gate,
    check_tests_gate,
)
```

### 5. API ENDPOINTS
**None.** No direct calls to AI Maestro API (localhost:23000). All operations use the `gh` CLI:
- `gh pr view` - get PR info
- `gh pr edit` - add labels
- `gh pr comment` - add comments

### 6. SYNC DIRECTION
**Not applicable.** This script does NOT sync with GitHub Projects. It is a **unidirectional** tool that reads PR data from GitHub and performs quality gate checks locally. It does not write back to GitHub Projects V2.

---

## Summary

This script (`amia_github_pr_gate.py`) is **NOT** related to GitHub Projects V2 kanban management. It is a **PR quality gate enforcer** that:
- Reads PR metadata via `gh` CLI
- Validates against 6 quality gates (draft, mergeable, tests, reviews, spec, issues)
- Can add labels (`blocked`, `gates-passed`) and comments to PRs
- Does NOT use GraphQL, does NOT manage kanban columns, does NOT interact with AI Maestro API

For GitHub Projects V2 GraphQL operations, you would need to look at other scripts in the AMIA system.