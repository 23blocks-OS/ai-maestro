/**
 * GitHub CLI Wrapper — all `gh` command interactions for AI Maestro
 *
 * Provides typed wrappers around the GitHub CLI (`gh`) for:
 * - Auth management (status, identity switching)
 * - Repository CRUD (list, create, clone, branch protection)
 * - GitHub Projects v2 (list, create, configure, validate)
 * - Kanban operations (items: add, move, archive, list)
 * - Pull request operations (create, list, review, merge)
 *
 * PREREQUISITE: `gh auth refresh -s project` for project operations.
 * All functions throw on `gh` CLI errors — callers handle error responses.
 */

import { execSync } from 'child_process'

// ============================================================================
// Types
// ============================================================================

export interface GhAuthStatus {
  username: string
  scopes: string[]
  active: boolean
  protocol: string
}

export interface GhRepo {
  name: string
  url: string
  description: string
  isPrivate: boolean
  defaultBranch: string
}

export interface GhProject {
  number: number
  title: string
  url: string
  shortDescription?: string
  closed: boolean
}

export interface GhProjectDetail extends GhProject {
  id: string // GraphQL node ID
  fields: GhProjectField[]
  items: { totalCount: number }
}

export interface GhProjectField {
  id: string
  name: string
  type: string // TEXT, SINGLE_SELECT, NUMBER, DATE, ITERATION
  options?: { id: string; name: string }[]
}

export interface GhProjectItem {
  id: string
  title: string
  status?: string
  assignee?: string
  repository?: string
  type: string // ISSUE, PULL_REQUEST, DRAFT_ISSUE
  url?: string
}

export interface GhIssue {
  number: number
  url: string
  title: string
}

export interface GhPR {
  number: number
  title: string
  author: string
  state: string
  url: string
}

export interface GhProjectValidation {
  valid: boolean
  owner: string
  number: number
  title?: string
  error?: string
}

export interface CreateRepoOptions {
  org?: string
  isPrivate?: boolean
  description?: string
  addReadme?: boolean
}

export interface KanbanFieldIds {
  statusFieldId: string
  priorityFieldId?: string
  assigneeFieldId?: string
  repositoryFieldId?: string
  taskTypeFieldId?: string
  statusOptions: Record<string, string> // column name -> option ID
}

// ============================================================================
// Helpers
// ============================================================================

/** Sanitize a value for safe shell interpolation — reject shell metacharacters + length limit */
function shellSafe(value: string): string {
  if (value.length > 2000) {
    throw new Error(`Input too long (${value.length} chars, max 2000)`)
  }
  if (/[;&|`$(){}!#'"\\<>*?\[\]\n\r~]/.test(value)) {
    throw new Error(`Unsafe shell characters in value: "${value.substring(0, 50)}"`)
  }
  return value
}

/** Run a gh CLI command and return stdout as string. Throws on non-zero exit. */
function gh(args: string, cwd?: string): string {
  const opts: { encoding: 'utf-8'; cwd?: string; timeout: number } = {
    encoding: 'utf-8',
    timeout: 30_000, // 30s timeout for CLI commands
  }
  if (cwd) {
    shellSafe(cwd) // Validate cwd has no shell metacharacters
    opts.cwd = cwd
  }
  return execSync(`gh ${args}`, opts).trim()
}

/** Run a gh CLI command, parse JSON output. Throws on non-zero exit or invalid JSON. */
function ghJson<T>(args: string, cwd?: string): T {
  const raw = gh(args, cwd)
  return JSON.parse(raw) as T
}

/** Run a gh API call via `gh api`. Returns parsed JSON. */
function ghApi<T>(endpoint: string, method = 'GET', body?: Record<string, unknown>): T {
  shellSafe(endpoint)
  shellSafe(method)
  let cmd = `api "${endpoint}"`
  if (method !== 'GET') cmd += ` -X ${method}`
  if (body) {
    // Pass body fields as -f flags for simple values
    for (const [key, value] of Object.entries(body)) {
      shellSafe(key)
      if (typeof value === 'string') {
        shellSafe(value)
        cmd += ` -f ${key}="${value}"`
      } else if (typeof value === 'boolean' || typeof value === 'number') {
        cmd += ` -F ${key}=${value}`
      }
    }
  }
  return ghJson<T>(cmd)
}

/** Run a GraphQL mutation via gh api graphql. Passes variables safely via --input stdin. */
function ghGraphQL<T>(query: string, variables: Record<string, unknown> = {}): T {
  // Build the JSON payload and pass via stdin to avoid shell injection
  const payload = JSON.stringify({ query, variables })
  const raw = execSync('gh api graphql --input -', {
    encoding: 'utf-8',
    timeout: 30_000,
    input: payload,
  }).trim()
  const parsed = JSON.parse(raw) as { data: T; errors?: Array<{ message: string }> }
  if (parsed.errors?.length) {
    throw new Error(`GraphQL error: ${parsed.errors.map(e => e.message).join(', ')}`)
  }
  return parsed.data
}

// ============================================================================
// 1. Auth Management
// ============================================================================

/** Get current GitHub auth status for all accounts */
export function getAuthStatus(): GhAuthStatus[] {
  // gh auth status outputs to stderr, parse it
  try {
    const raw = execSync('gh auth status 2>&1', { encoding: 'utf-8', timeout: 10_000 }).trim()
    const accounts: GhAuthStatus[] = []
    let current: Partial<GhAuthStatus> | null = null

    for (const line of raw.split('\n')) {
      const accountMatch = line.match(/Logged in to github\.com account (\S+)/)
      if (accountMatch) {
        if (current?.username) accounts.push(current as GhAuthStatus)
        current = { username: accountMatch[1], scopes: [], active: false, protocol: 'https' }
      }
      if (current) {
        const activeMatch = line.match(/Active account:\s*(true|false)/)
        if (activeMatch) current.active = activeMatch[1] === 'true'
        const protocolMatch = line.match(/Git operations protocol:\s*(\S+)/)
        if (protocolMatch) current.protocol = protocolMatch[1]
        const scopeMatch = line.match(/Token scopes:\s*'(.+)'/)
        if (scopeMatch) current.scopes = scopeMatch[1].split(/'\s*,\s*'/).filter(Boolean)
      }
    }
    if (current?.username) accounts.push(current as GhAuthStatus)
    return accounts
  } catch {
    return []
  }
}

/** Get the currently active GitHub username */
export function getActiveUsername(): string | null {
  const accounts = getAuthStatus()
  return accounts.find(a => a.active)?.username ?? null
}

/** List all authenticated GitHub identities */
export function listIdentities(): string[] {
  return getAuthStatus().map(a => a.username)
}

/** Switch active GitHub identity */
export function switchIdentity(username: string): void {
  shellSafe(username)
  gh(`auth switch --user ${username}`)
}

/** Ensure a specific identity is active. Throws if not authenticated. */
export function ensureIdentity(username: string): void {
  shellSafe(username)
  const current = getActiveUsername()
  if (current === username) return
  const identities = listIdentities()
  if (!identities.includes(username)) {
    throw new Error(`GitHub account '${username}' is not authenticated. Run: gh auth login`)
  }
  switchIdentity(username)
}

/** Check if the required scopes are present for project operations */
export function hasProjectScope(): boolean {
  const accounts = getAuthStatus()
  const active = accounts.find(a => a.active)
  if (!active) return false
  // Need either 'project' or 'read:project' scope
  return active.scopes.some(s => s === 'project' || s === 'read:project')
}

// ============================================================================
// 2. Repository Operations
// ============================================================================

/** List repositories for owner (user or org). Defaults to authenticated user. */
export function listRepos(owner?: string): GhRepo[] {
  if (owner) shellSafe(owner)
  const ownerArg = owner ? ` ${owner}` : ''
  const items = ghJson<Array<{
    name: string
    url: string
    description: string | null
    isPrivate: boolean
    defaultBranchRef: { name: string } | null
  }>>(`repo list${ownerArg} --json name,url,description,isPrivate,defaultBranchRef --limit 200`)
  return items.map(r => ({
    name: r.name,
    url: r.url,
    description: r.description ?? '',
    isPrivate: r.isPrivate,
    defaultBranch: r.defaultBranchRef?.name ?? 'main',
  }))
}

/** Create a new GitHub repository */
export function createRepo(name: string, opts: CreateRepoOptions = {}): GhRepo {
  shellSafe(name)
  if (opts.org) shellSafe(opts.org)
  if (opts.description) shellSafe(opts.description)
  const fullName = opts.org ? `${opts.org}/${name}` : name
  let cmd = `repo create ${fullName}`
  cmd += opts.isPrivate ? ' --private' : ' --public'
  if (opts.description) cmd += ` --description "${opts.description}"`
  if (opts.addReadme) cmd += ' --add-readme'
  cmd += ' --clone=false'
  cmd += ' --json name,url,description,isPrivate,defaultBranchRef'

  const result = ghJson<{
    name: string
    url: string
    description: string | null
    isPrivate: boolean
    defaultBranchRef: { name: string } | null
  }>(cmd)

  return {
    name: result.name,
    url: result.url,
    description: result.description ?? '',
    isPrivate: result.isPrivate,
    defaultBranch: result.defaultBranchRef?.name ?? 'main',
  }
}

/** List organizations the authenticated user belongs to */
export function listOrgs(): string[] {
  try {
    const raw = gh('api /user/orgs --jq ".[].login"')
    return raw.split('\n').filter(Boolean)
  } catch {
    return []
  }
}

/** Clone a repository to a target directory */
export function cloneRepo(url: string, targetDir: string): string {
  shellSafe(url)
  shellSafe(targetDir)
  gh(`repo clone "${url}" "${targetDir}"`)
  return targetDir
}

/** Set branch protection rules on the default branch */
export function setBranchProtection(owner: string, repo: string, branch: string): void {
  shellSafe(owner)
  shellSafe(repo)
  shellSafe(branch)
  // Require PR reviews and status checks — use JSON body via stdin
  // because ghApi -f/-F flags cannot express nested objects or null values
  const body = JSON.stringify({
    required_pull_request_reviews: { required_approving_review_count: 1 },
    enforce_admins: true,
    required_status_checks: null,
    restrictions: null,
  })
  execSync(`gh api /repos/${owner}/${repo}/branches/${branch}/protection -X PUT --input -`, {
    encoding: 'utf-8',
    timeout: 30_000,
    input: body,
  })
}

// ============================================================================
// 3. GitHub Projects v2 Operations
// ============================================================================

/** List GitHub Projects for an owner (user or org) */
export function listProjects(owner: string): GhProject[] {
  shellSafe(owner)
  const items = ghJson<Array<{
    number: number
    title: string
    url: string
    shortDescription: string | null
    closed: boolean
  }>>(`project list --owner "${owner}" --format json`)
  return items.map(p => ({
    number: p.number,
    title: p.title,
    url: p.url,
    shortDescription: p.shortDescription ?? undefined,
    closed: p.closed,
  }))
}

/** Create a new GitHub Project */
export function createProject(owner: string, title: string): { number: number; url: string } {
  shellSafe(owner)
  shellSafe(title)
  const result = ghJson<{ number: number; url: string }>(
    `project create --owner "${owner}" --title "${title}" --format json`
  )
  return { number: result.number, url: result.url }
}

/** Get project details including fields via GraphQL (CLI --format json doesn't include field nodes) */
export function getProject(owner: string, number: number): GhProjectDetail {
  shellSafe(owner)
  // Step 1: Basic info from CLI
  const basic = ghJson<{
    number: number
    title: string
    url: string
    shortDescription: string | null
    closed: boolean
    id: string
    fields: { totalCount: number }
    items: { totalCount: number }
  }>(`project view ${number} --owner "${owner}" --format json`)

  // Step 2: Field details via GraphQL (CLI doesn't expose field nodes)
  const query = `query($owner: String!, $number: Int!) {
    user(login: $owner) {
      projectV2(number: $number) {
        fields(first: 20) {
          nodes {
            ... on ProjectV2Field { id name dataType }
            ... on ProjectV2SingleSelectField { id name dataType options { id name } }
            ... on ProjectV2IterationField { id name dataType }
          }
        }
      }
    }
    organization(login: $owner) {
      projectV2(number: $number) {
        fields(first: 20) {
          nodes {
            ... on ProjectV2Field { id name dataType }
            ... on ProjectV2SingleSelectField { id name dataType options { id name } }
            ... on ProjectV2IterationField { id name dataType }
          }
        }
      }
    }
  }`

  let fields: GhProjectField[] = []
  try {
    const data = ghGraphQL<{
      user: { projectV2: { fields: { nodes: Array<{ id: string; name: string; dataType: string; options?: Array<{ id: string; name: string }> }> } } } | null
      organization: { projectV2: { fields: { nodes: Array<{ id: string; name: string; dataType: string; options?: Array<{ id: string; name: string }> }> } } } | null
    }>(query, { owner, number })

    // Use whichever resolved (user or org)
    const fieldNodes = data.user?.projectV2?.fields?.nodes ?? data.organization?.projectV2?.fields?.nodes ?? []
    fields = fieldNodes.map(f => ({
      id: f.id,
      name: f.name,
      type: f.dataType,
      options: f.options,
    }))
  } catch {
    // GraphQL failed — return empty fields (non-fatal)
    console.warn(`[github-cli] Failed to fetch field details for project ${owner}/${number} via GraphQL`)
  }

  return {
    number: basic.number,
    title: basic.title,
    url: basic.url,
    shortDescription: basic.shortDescription ?? undefined,
    closed: basic.closed,
    id: basic.id,
    fields,
    items: basic.items,
  }
}

/** Validate a GitHub Project URL and return parsed info */
export function validateProjectUrl(url: string): GhProjectValidation {
  // Parse: https://github.com/orgs/<owner>/projects/<number>
  //    or: https://github.com/users/<owner>/projects/<number>
  const match = url.match(/github\.com\/(?:orgs|users)\/([^/]+)\/projects\/(\d+)/)
  if (!match) {
    return { valid: false, owner: '', number: 0, error: 'Invalid project URL format' }
  }
  const owner = match[1]
  shellSafe(owner)
  const number = parseInt(match[2], 10)
  try {
    const project = getProject(owner, number)
    return { valid: true, owner, number, title: project.title }
  } catch (error) {
    return {
      valid: false,
      owner,
      number,
      error: `Project not accessible: ${(error as Error).message}`,
    }
  }
}

/** List all items in a GitHub Project */
export function listProjectItems(owner: string, number: number): GhProjectItem[] {
  shellSafe(owner)
  const items = ghJson<Array<{
    id: string
    title: string
    status: string | null
    assignees: string[] | null
    repository: string | null
    type: string
    content: { url: string } | null
  }>>(`project item-list ${number} --owner "${owner}" --format json --limit 500`)
  return items.map(i => ({
    id: i.id,
    title: i.title,
    status: i.status ?? undefined,
    assignee: i.assignees?.[0] ?? undefined,
    repository: i.repository ?? undefined,
    type: i.type,
    url: i.content?.url ?? undefined,
  }))
}

/** Extract unique repository URLs from project items */
export function extractReposFromItems(items: GhProjectItem[]): string[] {
  const repos = new Set<string>()
  for (const item of items) {
    if (item.repository) repos.add(item.repository)
  }
  return [...repos]
}

// ============================================================================
// 4. Project Template Configuration
// ============================================================================

/** Standard AI Maestro kanban columns */
const STANDARD_COLUMNS = ['Backlog', 'To Do', 'In Progress', 'Review', 'Done']

/** Standard AI Maestro custom fields */
const STANDARD_FIELDS = [
  { name: 'Priority', type: 'SINGLE_SELECT', options: ['Critical', 'High', 'Medium', 'Low'] },
  { name: 'Assignee', type: 'TEXT' },
  { name: 'Repository', type: 'TEXT' },
  { name: 'Task Type', type: 'SINGLE_SELECT', options: ['Feature', 'Bug', 'Refactor', 'Docs', 'Test', 'Infra'] },
]

/** Create a custom field on a project */
export function createProjectField(
  owner: string,
  number: number,
  name: string,
  dataType: string,
  options?: string[]

): string {
  shellSafe(owner)
  shellSafe(name)
  // gh project field-create doesn't support options directly — need GraphQL for SINGLE_SELECT
  if (dataType === 'SINGLE_SELECT' && options?.length) {
    // Create via GraphQL
    const project = getProject(owner, number)
    const mutation = `
      mutation($projectId: ID!, $name: String!, $dataType: ProjectV2CustomFieldType!) {
        createProjectV2Field(input: {
          projectId: $projectId
          dataType: $dataType
          name: $name
        }) {
          projectV2Field { ... on ProjectV2SingleSelectField { id } }
        }
      }
    `
    const result = ghGraphQL<{
      createProjectV2Field: { projectV2Field: { id: string } }
    }>(mutation, { projectId: project.id, name, dataType })

    const fieldId = result.createProjectV2Field.projectV2Field.id

    // Add options to the field
    for (const optionName of options) {
      const optMutation = `
        mutation($projectId: ID!, $fieldId: ID!, $name: String!) {
          createProjectV2FieldOption(input: {
            projectId: $projectId
            fieldId: $fieldId
            name: $name
          }) { projectV2SingleSelectField { id } }
        }
      `
      ghGraphQL(optMutation, { projectId: project.id, fieldId, name: optionName })
    }
    return fieldId
  }

  // Simple field via CLI (TEXT, NUMBER, DATE, ITERATION)
  shellSafe(dataType)
  gh(`project field-create ${number} --owner "${owner}" --name "${name}" --data-type ${dataType.toLowerCase()}`)
  // Re-fetch project to get the field ID (CLI doesn't return it in parseable format)
  const updatedProject = getProject(owner, number)
  const newField = updatedProject.fields.find(f => f.name === name)
  return newField?.id || ''
}

/**
 * Configure a project with the standard AI Maestro kanban template.
 * Creates Status field options (5 columns) + 4 custom fields.
 * Returns field IDs for use in card operations.
 */
export function configureProjectTemplate(
  owner: string,
  number: number
): KanbanFieldIds {
  shellSafe(owner)
  const project = getProject(owner, number)

  // Find the Status field (built-in on every project)
  const statusField = project.fields.find(f => f.name === 'Status')
  if (!statusField) {
    throw new Error('Status field not found on project — unexpected GitHub Projects state')
  }

  // Check which standard columns already exist
  const existingOptions = new Set(statusField.options?.map(o => o.name) ?? [])
  const statusOptions: Record<string, string> = {}

  // Map existing options
  for (const opt of statusField.options ?? []) {
    statusOptions[opt.name] = opt.id
  }

  // Add missing columns via GraphQL
  for (const col of STANDARD_COLUMNS) {
    if (!existingOptions.has(col)) {
      const mutation = `
        mutation($projectId: ID!, $fieldId: ID!, $name: String!) {
          createProjectV2FieldOption(input: {
            projectId: $projectId
            fieldId: $fieldId
            name: $name
          }) {
            projectV2SingleSelectField {
              options { id name }
            }
          }
        }
      `
      const result = ghGraphQL<{
        createProjectV2FieldOption: {
          projectV2SingleSelectField: { options: Array<{ id: string; name: string }> }
        }
      }>(mutation, { projectId: project.id, fieldId: statusField.id, name: col })
      // Find the newly created option
      const newOpt = result.createProjectV2FieldOption.projectV2SingleSelectField.options.find(
        o => o.name === col
      )
      if (newOpt) statusOptions[col] = newOpt.id
    }
  }

  // Create custom fields (skip if already exist)
  const existingFieldNames = new Set(project.fields.map(f => f.name))
  const fieldIds: KanbanFieldIds = {
    statusFieldId: statusField.id,
    statusOptions,
  }

  for (const fieldDef of STANDARD_FIELDS) {
    if (existingFieldNames.has(fieldDef.name)) {
      // Already exists — grab its ID
      const existing = project.fields.find(f => f.name === fieldDef.name)
      if (existing) {
        switch (fieldDef.name) {
          case 'Priority': fieldIds.priorityFieldId = existing.id; break
          case 'Assignee': fieldIds.assigneeFieldId = existing.id; break
          case 'Repository': fieldIds.repositoryFieldId = existing.id; break
          case 'Task Type': fieldIds.taskTypeFieldId = existing.id; break
        }
      }
      continue
    }
    const fieldId = createProjectField(owner, number, fieldDef.name, fieldDef.type, fieldDef.options)
    switch (fieldDef.name) {
      case 'Priority': fieldIds.priorityFieldId = fieldId; break
      case 'Assignee': fieldIds.assigneeFieldId = fieldId; break
      case 'Repository': fieldIds.repositoryFieldId = fieldId; break
      case 'Task Type': fieldIds.taskTypeFieldId = fieldId; break
    }
  }

  return fieldIds
}

// ============================================================================
// 5. Kanban Operations (for Orchestrator scripts)
// ============================================================================

/** Add an issue or PR to a GitHub Project. Returns the project item ID. */
export function addProjectItem(owner: string, number: number, issueUrl: string): string {
  shellSafe(owner)
  shellSafe(issueUrl)
  const result = ghJson<{ id: string }>(
    `project item-add ${number} --owner "${owner}" --url "${issueUrl}" --format json`
  )
  return result.id
}

/** Move a project item to a new status column via GraphQL */
export function moveProjectItem(
  owner: string,
  projectNumber: number,
  itemId: string,
  statusValue: string,
  fieldIds: KanbanFieldIds
): void {
  shellSafe(owner)
  const optionId = fieldIds.statusOptions[statusValue]
  if (!optionId) {
    throw new Error(`Unknown status column: '${statusValue}'. Valid: ${Object.keys(fieldIds.statusOptions).join(', ')}`)
  }

  const project = getProject(owner, projectNumber)

  const mutation = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }) { projectV2Item { id } }
    }
  `
  ghGraphQL(mutation, {
    projectId: project.id,
    itemId,
    fieldId: fieldIds.statusFieldId,
    optionId,
  })
}

/** Archive a project item */
export function archiveProjectItem(owner: string, number: number, itemId: string): void {
  shellSafe(owner)
  shellSafe(itemId)
  gh(`project item-archive ${number} --owner "${owner}" --id "${itemId}"`)
}

// ============================================================================
// 6. Issue Operations
// ============================================================================

/** Create a GitHub issue */
export function createIssue(
  owner: string,
  repo: string,
  title: string,
  body: string,
  labels?: string[]
): GhIssue {
  shellSafe(owner)
  shellSafe(repo)
  shellSafe(title)
  shellSafe(body)
  let cmd = `issue create -R "${owner}/${repo}" --title "${title}" --body "${body}"`
  if (labels?.length) {
    for (const label of labels) shellSafe(label)
    cmd += ` --label "${labels.join(',')}"`
  }
  cmd += ' --json number,url,title'
  return ghJson<GhIssue>(cmd)
}

/** Link an issue to a project (add as project item) */
export function linkIssueToProject(owner: string, projectNumber: number, issueUrl: string): string {
  return addProjectItem(owner, projectNumber, issueUrl)
}

// ============================================================================
// 7. PR Operations (for agent scripts)
// ============================================================================

/** Create a pull request from the current branch */
export function createPR(
  repoDir: string,
  title: string,
  body: string,
  base?: string
): { number: number; url: string } {
  shellSafe(repoDir)
  shellSafe(title)
  shellSafe(body)
  let cmd = `pr create --title "${title}" --body "${body}"`
  if (base) {
    shellSafe(base)
    cmd += ` --base "${base}"`
  }
  cmd += ' --json number,url'
  return ghJson<{ number: number; url: string }>(cmd, repoDir)
}

/** List pull requests for a repository */
export function listPRs(owner: string, repo: string, state?: 'open' | 'closed' | 'merged'): GhPR[] {
  shellSafe(owner)
  shellSafe(repo)
  let cmd = `pr list -R "${owner}/${repo}" --json number,title,author,state,url`
  if (state) cmd += ` --state ${state}`
  const items = ghJson<Array<{
    number: number
    title: string
    author: { login: string }
    state: string
    url: string
  }>>(cmd)
  return items.map(p => ({
    number: p.number,
    title: p.title,
    author: p.author.login,
    state: p.state,
    url: p.url,
  }))
}

/** Review a pull request */
export function reviewPR(
  owner: string,
  repo: string,
  number: number,
  action: 'approve' | 'request-changes' | 'comment',
  body?: string
): void {
  shellSafe(owner)
  shellSafe(repo)
  shellSafe(action)
  if (body) shellSafe(body)
  let cmd = `pr review ${number} -R "${owner}/${repo}" --${action}`
  if (body) cmd += ` --body "${body}"`
  gh(cmd)
}

/** Merge a pull request */
export function mergePR(
  owner: string,
  repo: string,
  number: number,
  method: 'squash' | 'merge' | 'rebase' = 'squash'
): void {
  shellSafe(owner)
  shellSafe(repo)
  shellSafe(method)
  gh(`pr merge ${number} -R "${owner}/${repo}" --${method}`)
}

// ============================================================================
// 8. PR + Issue Template Generation
// ============================================================================

/** Standard AI Maestro PR template content */
export const PR_TEMPLATE = `## Task Reference
- Issue: #
- Project Card:

## Changes
-

## Testing
- [ ] Tests pass locally
- [ ] No new warnings/errors

## Checklist
- [ ] Branch is up to date with main
- [ ] Code follows project conventions
- [ ] Commit messages follow conventional commits
`

/** Standard AI Maestro issue template content */
export const ISSUE_TEMPLATE = `---
name: Task
about: Development task from AI Maestro kanban
labels: ai-maestro-task
---

## Description

## Acceptance Criteria
- [ ]

## Design Reference

## Assigned To
Agent:
Priority:
`
