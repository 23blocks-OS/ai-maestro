# Code Check Report

- **File**: `/Users/emanuelesabetta/Code/EMASOFT-INTEGRATOR-AGENT/ai-maestro-integrator-agent/scripts/amia_github_lifecycle_projects.py`
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

The user wants me to analyze a Python script from the "AI Maestro Integrator Agent" (AMIA). Let me extract the requested information from the provided file.

Let me go through each item:

1. **GITHUB PROJECTS V2 GRAPHQL**: 
   - `get_project_id` - queries for projectV2 by number
   - `get_project_field_id` - queries for project fields (specifically SingleSelect fields like Status)
   - `get_project_item_id` - queries for project items linked to an issue
   - `move_issue_in_project` - mutation to update project item field value

2. **KANBAN COLUMNS**:
   - Uses "Status" field (hardcoded in `get_project_field_id` and `move_issue_in_project`)
   - Status values are dynamic - fetched from project field options

3. **CARD OPERATIONS**:
   - Cards are moved via `updateProjectV2ItemFieldValue` mutation
   - Uses `get_project_item_id` to find the item
   - Sets `singleSelectOptionId` for the Status field

4. **QUALITY GATE CHECKS**:
   - Not directly in this file - this file handles project/kanban operations

5. **API ENDPOINTS**:
   - Uses `gh api graphql` command
   - No direct calls to AI Maestro API (localhost:23000)

6. **SYNC DIRECTION**:
   - This file manages GitHub Projects V2 - it syncs from local (issue numbers, status changes) to GitHub (project columns)

Let me provide a comprehensive analysis.
# Analysis of `amia_github_lifecycle_projects.py`

## 1. GITHUB PROJECTS V2 GRAPHQL

### Query: Get Project ID (line 63-75)
```graphql
query($owner: String!, $repo: String!, $number: Int!) {
  repository(owner: $owner, name: $repo) {
    projectV2(number: $number) {
      id
    }
  }
}
```
- Returns: `projectV2.id`

### Query: Get Project Field ID and Options (line 85-107)
```graphql
query($projectId: ID!) {
  node(id: $projectId) {
    ... on ProjectV2 {
      fields(first: 20) {
        nodes {
          ... on ProjectV2SingleSelectField {
            id
            name
            options {
              id
              name
            }
          }
        }
      }
    }
  }
}
```
- Returns: Field ID and `{option_name: option_id}` mapping
- Specifically queries for `ProjectV2SingleSelectField` types

### Query: Get Project Item ID (line 119-140)
```graphql
query($owner: String!, $repo: String!, $issueNumber: Int!) {
  repository(owner: $owner, name: $repo) {
    issue(number: $issueNumber) {
      projectItems(first: 10) {
        nodes {
          id
          project {
            id
          }
        }
      }
    }
  }
}
```
- Returns: `projectItems.nodes[].id` for matching project

### Mutation: Update Project Item Field Value (line 200-218)
```graphql
mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $valueId: String!) {
  updateProjectV2ItemFieldValue(input: {
    projectId: $projectId
    itemId: $itemId
    fieldId: $fieldId
    value: { singleSelectOptionId: $valueId }
  }) {
    projectV2Item {
      id
    }
  }
}
```
- Updates a single-select field (Status) on a project card

---

## 2. KANBAN COLUMNS

- **Field Name**: `"Status"` (hardcoded at line 112 and line 175)
- **Column Values**: Dynamically fetched from project field options — **not hardcoded**
- The script queries available options at runtime via `get_project_field_id()` (line 111-116)
- Status matching is case-insensitive (line 181-184)

---

## 3. CARD OPERATIONS

### Card Creation
- **Not implemented** in this file — cards must exist already in the project

### Card Movement
- **Function**: `move_issue_in_project()` (line 163-214)
- **Process**:
  1. Get project ID via `get_project_id()` (line 170)
  2. Get Status field ID and options via `get_project_field_id()` (line 175)
  3. Find matching status option ID (line 179-184)
  4. Get project item ID via `get_project_item_id()` (line 191)
  5. Execute `updateProjectV2ItemFieldValue` mutation (line 205-214)

### Metadata Set
- Only the **Status** field is updated via `singleSelectOptionId`

---

## 4. QUALITY GATE CHECKS

- **None** in this file
- This file handles only project/kanban operations, not PR quality gates
- Quality gate logic would be in a different module

---

## 5. API ENDPOINTS

- **GitHub CLI GraphQL API**: `gh api graphql`
- **No direct AI Maestro API calls** (localhost:23000)
- All commands use `run_gh_command()` from `amia_github_lifecycle_core`

---

## 6. SYNC DIRECTION

**Local → GitHub**

- Takes local parameters (`issue_number`, `project_number`, `status`)
- Updates GitHub Projects V2 column via GraphQL mutation
- Also handles PR→Issue linking via `link_pr_to_issue()` (line 27-57), which updates PR body locally then pushes to GitHub

---

## Summary Table

| Item | Details |
|------|---------|
| **GraphQL Queries** | 3 queries (project ID, field ID, item ID) + 1 mutation |
| **Kanban Field** | `"Status"` (hardcoded) |
| **Column Values** | Dynamic from project configuration |
| **Card Operations** | Move only (via `updateProjectV2ItemFieldValue`) |
| **Quality Gates** | None |
| **AI Maestro API** | None |
| **Sync Direction** | Local → GitHub |