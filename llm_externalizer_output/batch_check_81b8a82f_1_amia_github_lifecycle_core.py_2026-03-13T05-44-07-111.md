# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-INTEGRATOR-AGENT/ai-maestro-integrator-agent/scripts/amia_github_lifecycle_core.py`
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

The user wants me to analyze the provided Python script and extract specific information about GitHub Projects V2, kanban columns, card operations, quality gates, API endpoints, and sync direction.

Let me analyze the file:

1. **GITHUB PROJECTS V2 GRAPHQL**: Looking at the code, I don't see any GraphQL queries or mutations in this file. This appears to be a core utilities module with data classes and helper functions, but no GraphQL operations.

2. **KANBAN COLUMNS**: There's no mention of kanban columns in this file. It's focused on:
   - Data classes (IssueMetadata, DesignDocument, ValidationResult)
   - Frontmatter parsing and validation
   - Document validation functions

3. **CARD OPERATIONS**: No card operations in this file.

4. **QUALITY GATE CHECKS**: There's no quality gate checks in this file. It validates frontmatter (YAML metadata in markdown files), not PR quality gates.

5. **API ENDPOINTS**: No direct calls to AI Maestro API (localhost:23000) in this file.

6. **SYNC DIRECTION**: No sync operations in this file.

This file (`amia_github_lifecycle_core.py`) appears to be a utility module that:
- Defines data classes for issues and design documents
- Provides frontmatter parsing and validation
- Handles GitHub CLI commands (basic wrapper)

It's NOT the file that handles GitHub Projects V2 or the actual lifecycle automation - it seems to be a supporting utility module.

Let me provide a clear,## Analysis of `amia_github_lifecycle_core.py`

This file is a **core utility structured response based on the analysis. module** that provides data structures and helper functions, but it does **NOT** contain:

- GitHub Projects V2 GraphQL operations
- Kanban column management
- Card operations
- Quality gate checks
- AI Maestro API calls

---

### 1. GITHUB PROJECTS V2 GRAPHQL
**None found.** This file only wraps the `gh` CLI for basic repo operations:
- `run_gh_command()` (lines 90-102) - generic gh CLI wrapper
- `check_gh_auth()` (lines 104-106) - checks auth status via `gh auth status`
- `get_repo_info()` (lines 108-113) - gets owner/name via `gh repo view --json owner,name`

No GraphQL queries or mutations are present.

---

### 2. KANBAN COLUMNS
**None referenced.** This file validates document frontmatter, not kanban columns.

Document statuses (not kanban columns) are defined at lines 60-66:
```python
VALID_STATUSES: set[str] = {
    "draft",
    "review",
    "approved",
    "implemented",
    "deprecated",
    "superseded",
}
```

---

### 3. CARD OPERATIONS
**None present.** No card creation, movement, or updates.

---

### 4. QUALITY GATE CHECKS
**None present.** The `validate_frontmatter()` function (lines 206-287) validates **markdown document metadata**, not PR quality gates:
- Checks required frontmatter fields (uuid, title, type, status)
- Validates UUID format (pattern at lines 68-71)
- Validates document type and status values

---

### 5. API ENDPOINTS
**None found.** No calls to AI Maestro API (localhost:23000).

---

### 6. SYNC DIRECTION
**None.** This file does not perform any synchronization. It provides utilities for:
- Parsing design documents from local filesystem
- Validating frontmatter
- Running basic `gh` CLI commands

---

### Summary

This file (`amia_github_lifecycle_core.py`) is a **supporting utility module** that handles:
- Data classes for issues and design documents
- YAML frontmatter parsing (lines 115-186)
- Frontmatter validation (lines 206-287)
- Basic `gh` CLI wrapper functions

To find GitHub Projects V2 GraphQL, kanban columns, card operations, and quality gates, you would need to examine **other files** in the AMIA suite that handle those specific functionalities.