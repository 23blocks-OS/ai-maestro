/**
 * GitHub Projects v2 — GraphQL operations via `gh api graphql`
 *
 * AI Maestro kanban acts as a browser/GUI for GitHub Projects v2.
 * GitHub is the sole source of truth. All task CRUD proxies through here.
 *
 * Auth: Uses `gh` CLI's existing authentication (no token management needed).
 * Caching: Field IDs cached 1h, task lists cached 10s (configurable).
 */

import { execSync, spawnSync } from 'child_process'
import type { Task, TaskWithDeps } from '@/types/task'
import type { KanbanColumnConfig } from '@/types/team'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface GitHubProjectConfig {
  owner: string
  repo: string
  number: number
}

interface ProjectFieldOption {
  id: string
  name: string
}

interface ProjectField {
  id: string
  name: string
  options?: ProjectFieldOption[]
}

interface CachedProjectMeta {
  projectId: string
  statusField: ProjectField
  priorityField: ProjectField | null
  agentField: ProjectField | null // TEXT field named "Agent" for agent assignment
  extraFields: ProjectField[] // All other single-select/text fields (Platform, etc.)
  cachedAt: number // Date.now()
}

interface CachedTaskList {
  tasks: Task[]
  cachedAt: number
}

interface ProjectItem {
  id: string // PVTI_... node ID (used as task ID in AI Maestro)
  content: {
    __typename: string
    number?: number
    title?: string
    body?: string
    url?: string
    state?: string
    createdAt?: string
    updatedAt?: string
    closedAt?: string
    labels?: { nodes: { name: string }[] }
    assignees?: { nodes: { login: string }[] }
    // Linked PRs (from issue timeline — closing references)
    timelineItems?: {
      nodes: {
        __typename: string
        source?: { url?: string; state?: string }
      }[]
    }
  } | null
  fieldValues: {
    nodes: {
      __typename: string
      field?: { name: string }
      name?: string   // SingleSelectFieldValue
      text?: string   // TextFieldValue
    }[]
  }
}

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const FIELD_CACHE_TTL = 60 * 60 * 1000 // 1 hour
const TASK_CACHE_TTL = 10 * 1000        // 10 seconds

// Keyed by `${owner}/${repo}/${number}`
const metaCache = new Map<string, CachedProjectMeta>()
const taskCache = new Map<string, CachedTaskList>()

function cacheKey(cfg: GitHubProjectConfig): string {
  return `${cfg.owner}/${cfg.repo}/${cfg.number}`
}

function invalidateTaskCache(cfg: GitHubProjectConfig): void {
  taskCache.delete(cacheKey(cfg))
}

// ---------------------------------------------------------------------------
// gh CLI wrapper
// ---------------------------------------------------------------------------

function ghGraphQL(query: string, variables: Record<string, unknown> = {}): unknown {
  // Build the argument list as an array so that no shell interpretation occurs.
  // spawnSync passes each element directly to execve, avoiding any quoting or
  // escaping issues — including JSON values that contain quotes, backslashes, or
  // single quotes.
  const args = ['api', 'graphql', '-f', `query=${query}`]
  for (const [key, val] of Object.entries(variables)) {
    if (typeof val === 'number' || typeof val === 'boolean') {
      // -F tells gh to interpret the value as a typed field (number/boolean)
      args.push('-F', `${key}=${val}`)
    } else if (Array.isArray(val) || (typeof val === 'object' && val !== null)) {
      // Arrays and objects must be serialised to JSON and passed as literal
      // strings via -f (not -F), so gh does not attempt type coercion.
      args.push('-f', `${key}=${JSON.stringify(val)}`)
    } else {
      args.push('-f', `${key}=${String(val)}`)
    }
  }

  const proc = spawnSync('gh', args, {
    encoding: 'utf-8',
    timeout: 15000,
    stdio: ['pipe', 'pipe', 'pipe'],
  })

  if (proc.error) throw proc.error
  if (proc.status !== 0) {
    throw new Error(`gh api graphql failed (exit ${proc.status}): ${proc.stderr}`)
  }

  return JSON.parse(proc.stdout)
}

/**
 * Check if `gh` CLI is installed and authenticated.
 * Returns null on success, error message on failure.
 */
export function checkGhAuth(): string | null {
  try {
    execSync('gh auth status', { encoding: 'utf-8', timeout: 5000, stdio: ['pipe', 'pipe', 'pipe'] })
    return null
  } catch {
    return 'GitHub CLI (gh) not installed or not authenticated. Run `gh auth login` first.'
  }
}

// ---------------------------------------------------------------------------
// Project Metadata (cached 1h)
// ---------------------------------------------------------------------------

async function getProjectMeta(cfg: GitHubProjectConfig): Promise<CachedProjectMeta> {
  const key = cacheKey(cfg)
  const cached = metaCache.get(key)
  if (cached && Date.now() - cached.cachedAt < FIELD_CACHE_TTL) {
    return cached
  }

  // Try organization first, then user — GitHub GraphQL errors (not null) if the
  // owner type doesn't match, so we can't combine both in one query.
  const projectQuery = (ownerType: 'organization' | 'user') => `
    query($owner: String!, $number: Int!) {
      ${ownerType}(login: $owner) {
        projectV2(number: $number) {
          id
          fields(first: 30) {
            nodes {
              ... on ProjectV2SingleSelectField {
                id
                name
                options { id name }
              }
              ... on ProjectV2Field {
                id
                name
              }
            }
          }
        }
      }
    }
  `

  type ProjectQueryResult = {
    data: Record<string, { projectV2: { id: string; fields: { nodes: ProjectField[] } } | null } | undefined>
  }

  let project: { id: string; fields: { nodes: ProjectField[] } } | null = null

  // Try organization first (most common for Projects V2)
  for (const ownerType of ['organization', 'user'] as const) {
    try {
      const result = ghGraphQL(projectQuery(ownerType), { owner: cfg.owner, number: cfg.number }) as ProjectQueryResult
      project = result.data?.[ownerType]?.projectV2 ?? null
      if (project) break
    } catch {
      // Owner type mismatch — try the other one
    }
  }
  if (!project) {
    throw new Error(`Project #${cfg.number} not found for ${cfg.owner}`)
  }

  const statusField = project.fields.nodes.find(
    f => f.name === 'Status' && f.options
  )
  if (!statusField) {
    throw new Error(`Status field not found in project #${cfg.number}`)
  }

  const priorityField = project.fields.nodes.find(
    f => f.name === 'Priority' && f.options
  ) || null

  // Agent TEXT field — no options means it's a plain text field, not single-select
  const agentField = project.fields.nodes.find(
    f => f.name === 'Agent' && !f.options
  ) || null

  // Collect all other fields (Platform, Effort, etc.) excluding Status, Priority, Agent
  const reservedNames = new Set(['Status', 'Priority', 'Agent'])
  const extraFields = project.fields.nodes.filter(
    f => f.name && !reservedNames.has(f.name)
  )

  const meta: CachedProjectMeta = {
    projectId: project.id,
    statusField,
    priorityField,
    agentField,
    extraFields,
    cachedAt: Date.now(),
  }
  metaCache.set(key, meta)
  return meta
}

// ---------------------------------------------------------------------------
// Read: List project items as Task[]
// ---------------------------------------------------------------------------

function mapProjectItemToTask(
  item: ProjectItem,
  teamId: string,
  statusField: ProjectField,
  priorityField: ProjectField | null,
): Task | null {
  // Skip items without content (deleted issues, etc.)
  if (!item.content || !item.content.title) return null

  // ── Extract project field values (Status, Priority, custom text fields) ──
  let status = 'backlog'
  let priority: number | undefined
  const customFields: Record<string, string> = {} // e.g. Platform
  let assigneeFromAgentField: string | null = null // Agent TEXT field on GitHub Project
  const fieldValues = item.fieldValues?.nodes || []

  for (const fv of fieldValues) {
    const fieldName = fv.field?.name
    if (!fieldName) continue

    if (fieldName === 'Status' && fv.name) {
      // Convert "In Progress" → "in_progress", "To Do" → "to_do", etc.
      status = fv.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_|_$/g, '')
    } else if (fieldName === 'Priority' && fv.name) {
      const pMap: Record<string, number> = {
        'critical': 0, 'urgent': 0,
        'high': 1, 'medium': 2, 'low': 3,
      }
      priority = pMap[fv.name.toLowerCase()] ?? 2
    } else if (fieldName === 'Agent' && fv.text) {
      // Agent TEXT field — used as fallback for assigneeAgentId
      assigneeFromAgentField = fv.text.trim() || null
    } else if (fv.name) {
      // Any other single-select field → store in customFields
      customFields[fieldName] = fv.name
    } else if (fv.text) {
      // Text field → store in customFields
      customFields[fieldName] = fv.text
    }
  }

  // ── Parse labels with AMOA prefix taxonomy ──
  const allLabels = item.content.labels?.nodes?.map(l => l.name) || []
  const bareTypeLabels = ['bug', 'feature', 'enhancement', 'chore', 'epic', 'docs']

  let taskType: string | undefined
  let assigneeFromLabel: string | null = null
  let previousStatus: string | undefined
  const blockedBy: string[] = []
  const displayLabels: string[] = []

  for (const label of allLabels) {
    const lower = label.toLowerCase()

    if (lower.startsWith('type:')) {
      // type:bug, type:feature, type:epic → taskType
      taskType = label.slice(5).trim()
    } else if (lower.startsWith('assign:')) {
      // assign:<agent-name> → assigneeAgentId (AMOA convention)
      assigneeFromLabel = label.slice(7).trim()
    } else if (lower.startsWith('status:blocked-from:')) {
      // status:blocked-from:<column> → previousStatus for Blocked→restore flow
      previousStatus = label.slice(20).trim()
    } else if (lower.startsWith('blocked-by:') || lower.startsWith('depends:')) {
      // blocked-by:#42 or depends:#42 → dependency reference (issue number)
      const ref = label.replace(/^(blocked-by|depends):/i, '').trim()
      if (ref) blockedBy.push(ref)
    } else if (bareTypeLabels.includes(lower)) {
      // Bare type labels (bug, feature, etc.) — fallback if no type: prefix
      if (!taskType) taskType = lower
    } else if (lower === 'blocked') {
      // "blocked" label indicates this task is blocked (status override)
      if (!previousStatus && status !== 'blocked') {
        previousStatus = status // save current status for restore
      }
    } else {
      // All other labels: keep for display (includes status:*, priority:*, component:*, etc.)
      displayLabels.push(label)
    }
  }

  // ── Extract assignee: prefer assign: label > Agent text field > GitHub assignee ──
  const githubAssignee = item.content.assignees?.nodes?.[0]?.login || null
  const assigneeAgentId = assigneeFromLabel || assigneeFromAgentField || githubAssignee

  // ── Extract PR URL from linked PRs (timeline events) ──
  let prUrl: string | undefined
  const timelineNodes = item.content.timelineItems?.nodes || []
  for (const event of timelineNodes) {
    if (event.source?.url && event.source.url.includes('/pull/')) {
      prUrl = event.source.url
      break // take the first linked PR
    }
  }

  // ── Parse acceptance criteria from issue body (AMOA convention) ──
  // Format: lines starting with "- [ ]" or "- [x]" under "## Acceptance Criteria"
  let acceptanceCriteria: string[] | undefined
  let handoffDoc: string | undefined
  const body = item.content.body || ''
  if (body) {
    // Parse acceptance criteria section
    const acMatch = body.match(/##\s*Acceptance\s+Criteria\s*\n([\s\S]*?)(?=\n##|\n---|$)/i)
    if (acMatch) {
      const lines = acMatch[1].split('\n')
        .map(l => l.replace(/^\s*-\s*\[[ x]\]\s*/, '').trim())
        .filter(l => l.length > 0)
      if (lines.length > 0) acceptanceCriteria = lines
    }

    // Parse handoff doc reference
    const handoffMatch = body.match(/(?:handoff|handoff[- ]doc(?:ument)?)\s*:\s*(.+)/i)
    if (handoffMatch) handoffDoc = handoffMatch[1].trim()

    // Parse blockedBy from issue body references: "Blocked by #42", "Depends on #13"
    const depMatches = body.matchAll(/(?:blocked\s+by|depends\s+on)\s+#(\d+)/gi)
    for (const m of depMatches) {
      const ref = `#${m[1]}`
      if (!blockedBy.includes(ref)) blockedBy.push(ref)
    }
  }

  // ── Timestamps from GitHub ──
  const createdAt = item.content.createdAt || new Date().toISOString()
  const updatedAt = item.content.updatedAt || createdAt
  const completedAt = item.content.closedAt || undefined

  // ── Priority: prefer from project field, fallback from priority:* label ──
  if (priority === undefined) {
    const priorityLabel = allLabels.find(l => l.toLowerCase().startsWith('priority:'))
    if (priorityLabel) {
      const pMap: Record<string, number> = {
        'critical': 0, 'urgent': 0, 'p0': 0,
        'high': 1, 'p1': 1,
        'medium': 2, 'p2': 2,
        'low': 3, 'p3': 3,
      }
      priority = pMap[priorityLabel.slice(9).trim().toLowerCase()] ?? 2
    }
  }

  // Append custom project fields as labels (e.g., "Platform:macOS", "Agent:backend")
  // so they're visible in the kanban UI without changing the Task type
  for (const [fieldName, fieldValue] of Object.entries(customFields)) {
    displayLabels.push(`${fieldName}:${fieldValue}`)
  }

  return {
    id: item.id, // GitHub Project item node_id as task ID
    teamId,
    subject: item.content.title,
    description: body || undefined,
    status,
    assigneeAgentId,
    blockedBy,
    priority,
    labels: displayLabels,
    taskType,
    externalRef: item.content.url || undefined,
    externalProjectRef: item.id, // Project item node ID (PVTI_...)
    previousStatus,
    acceptanceCriteria,
    handoffDoc,
    prUrl,
    startedAt: status === 'in_progress' ? updatedAt : undefined,
    completedAt,
    createdAt,
    updatedAt,
  }
}

export async function listTasks(
  cfg: GitHubProjectConfig,
  teamId: string,
): Promise<Task[]> {
  const key = cacheKey(cfg)
  const cached = taskCache.get(key)
  if (cached && Date.now() - cached.cachedAt < TASK_CACHE_TTL) {
    return cached.tasks
  }

  const meta = await getProjectMeta(cfg)

  // Paginate through all project items
  const allItems: ProjectItem[] = []
  let hasNextPage = true
  let cursor: string | null = null

  while (hasNextPage) {
    const afterClause = cursor ? `, after: "${cursor}"` : ''
    const query = `
      query($projectId: ID!) {
        node(id: $projectId) {
          ... on ProjectV2 {
            items(first: 100${afterClause}) {
              pageInfo { hasNextPage endCursor }
              nodes {
                id
                content {
                  __typename
                  ... on Issue {
                    number
                    title
                    body
                    url
                    state
                    createdAt
                    updatedAt
                    closedAt
                    labels(first: 30) { nodes { name } }
                    assignees(first: 5) { nodes { login } }
                    timelineItems(first: 10, itemTypes: [CROSS_REFERENCED_EVENT]) {
                      nodes {
                        __typename
                        ... on CrossReferencedEvent {
                          source { ... on PullRequest { url state } }
                        }
                      }
                    }
                  }
                  ... on DraftIssue {
                    title
                    body
                    createdAt
                    updatedAt
                  }
                  ... on PullRequest {
                    number
                    title
                    body
                    url
                    state
                    createdAt
                    updatedAt
                    closedAt
                    labels(first: 30) { nodes { name } }
                    assignees(first: 5) { nodes { login } }
                  }
                }
                fieldValues(first: 20) {
                  nodes {
                    __typename
                    ... on ProjectV2ItemFieldSingleSelectValue {
                      field { ... on ProjectV2SingleSelectField { name } }
                      name
                    }
                    ... on ProjectV2ItemFieldTextValue {
                      field { ... on ProjectV2Field { name } }
                      text
                    }
                  }
                }
              }
            }
          }
        }
      }
    `

    const result = ghGraphQL(query, { projectId: meta.projectId }) as {
      data: {
        node: {
          items: {
            pageInfo: { hasNextPage: boolean; endCursor: string }
            nodes: ProjectItem[]
          }
        }
      }
    }

    const items = result.data?.node?.items
    if (!items) break

    allItems.push(...items.nodes)
    hasNextPage = items.pageInfo.hasNextPage
    cursor = items.pageInfo.endCursor
  }

  const tasks = allItems
    .map(item => mapProjectItemToTask(item, teamId, meta.statusField, meta.priorityField))
    .filter((t): t is Task => t !== null)

  taskCache.set(key, { tasks, cachedAt: Date.now() })
  return tasks
}

// ---------------------------------------------------------------------------
// Read: Get kanban columns from GitHub Project Status field
// ---------------------------------------------------------------------------

export async function getKanbanColumns(
  cfg: GitHubProjectConfig,
): Promise<KanbanColumnConfig[]> {
  const meta = await getProjectMeta(cfg)

  // Map GitHub Status options to KanbanColumnConfig
  const colorPalette = [
    'bg-gray-500', 'bg-gray-400', 'bg-blue-400', 'bg-purple-400',
    'bg-amber-400', 'bg-cyan-400', 'bg-emerald-400', 'bg-red-400',
    'bg-pink-400', 'bg-indigo-400',
  ]

  return (meta.statusField.options || []).map((opt, i) => ({
    id: opt.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, ''),
    label: opt.name,
    color: colorPalette[i % colorPalette.length],
  }))
}

// ---------------------------------------------------------------------------
// Write: Create task (issue + project item)
// ---------------------------------------------------------------------------

export async function createTask(
  cfg: GitHubProjectConfig,
  teamId: string,
  data: {
    subject: string
    description?: string
    status?: string
    priority?: number
    labels?: string[]
    assigneeLogin?: string
    taskType?: string
    blockedBy?: string[]
    acceptanceCriteria?: string[]
    prUrl?: string
  },
): Promise<Task> {
  const meta = await getProjectMeta(cfg)

  // 1. Create GitHub issue
  // Build label list including type: prefix for taskType
  const issueLabels = [...(data.labels || [])]
  if (data.taskType && !issueLabels.some(l => l.toLowerCase().startsWith('type:'))) {
    issueLabels.push(`type:${data.taskType}`)
  }
  if (data.blockedBy?.length) {
    for (const ref of data.blockedBy) {
      issueLabels.push(`blocked-by:${ref}`)
    }
  }
  // Shell-safe: use single-quote escaping for all user-provided values
  const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
  const labelArgs = issueLabels.map(l => `--label ${sq(l)}`).join(' ')
  const assigneeArg = data.assigneeLogin ? `--assignee ${sq(data.assigneeLogin)}` : ''
  const bodyArg = data.description ? `--body ${sq(data.description)}` : ''

  const issueJson = execSync(
    `gh issue create -R ${sq(`${cfg.owner}/${cfg.repo}`)} ` +
    `--title ${sq(data.subject)} ` +
    `${bodyArg} ${labelArgs} ${assigneeArg} --json number,url,nodeId`,
    { encoding: 'utf-8', timeout: 15000 },
  )
  const issue = JSON.parse(issueJson) as { number: number; url: string; nodeId: string }

  // 2. Add issue to project
  const addQuery = `
    mutation($projectId: ID!, $contentId: ID!) {
      addProjectV2ItemById(input: { projectId: $projectId, contentId: $contentId }) {
        item { id }
      }
    }
  `
  const addResult = ghGraphQL(addQuery, {
    projectId: meta.projectId,
    contentId: issue.nodeId,
  }) as { data: { addProjectV2ItemById: { item: { id: string } } } }

  const itemId = addResult.data.addProjectV2ItemById.item.id

  // 3. Set Status field if specified
  if (data.status && meta.statusField.options) {
    // Use the same normalization as mapProjectItemToTask: lowercase, replace non-alnum with _, trim underscores
    const option = meta.statusField.options.find(
      o => o.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === data.status
    )
    if (option) {
      await setFieldValue(meta.projectId, itemId, meta.statusField.id, option.id)
    }
  }

  // 4. Set Priority field if specified
  if (data.priority !== undefined && meta.priorityField?.options) {
    const pNames: Record<number, string> = { 0: 'Critical', 1: 'High', 2: 'Medium', 3: 'Low' }
    const pName = pNames[data.priority] || 'Medium'
    const option = meta.priorityField.options.find(
      o => o.name.toLowerCase() === pName.toLowerCase()
    )
    if (option) {
      await setFieldValue(meta.projectId, itemId, meta.priorityField.id, option.id)
    }
  }

  // 5. Set Agent TEXT field if assignee is specified and field exists on the project
  if (meta.agentField && data.assigneeLogin) {
    try {
      await setTextFieldValue(meta.projectId, itemId, meta.agentField.id, data.assigneeLogin)
    } catch (e) {
      console.error('[ghProject] Failed to set Agent field:', e)
    }
  }

  invalidateTaskCache(cfg)

  const now = new Date().toISOString()
  return {
    id: itemId,
    teamId,
    subject: data.subject,
    description: data.description,
    status: data.status || 'backlog',
    assigneeAgentId: data.assigneeLogin || null,
    blockedBy: data.blockedBy || [],
    priority: data.priority,
    labels: data.labels,
    taskType: data.taskType,
    externalRef: issue.url,
    externalProjectRef: itemId,
    acceptanceCriteria: data.acceptanceCriteria,
    prUrl: data.prUrl,
    createdAt: now,
    updatedAt: now,
  }
}

// ---------------------------------------------------------------------------
// Write: Update task (project item fields + issue)
// ---------------------------------------------------------------------------

export async function updateTask(
  cfg: GitHubProjectConfig,
  teamId: string,
  itemId: string, // GitHub Project item node_id
  updates: {
    subject?: string
    description?: string
    status?: string
    priority?: number
    labels?: string[]
    assigneeLogin?: string | null
    taskType?: string
    blockedBy?: string[]
    acceptanceCriteria?: string[]
    prUrl?: string
    previousStatus?: string
  },
): Promise<Task | null> {
  const meta = await getProjectMeta(cfg)

  // Find the issue number from the item (need to query it)
  const issueNumber = await getIssueNumberForItem(meta.projectId, itemId)

  // Update Status field
  if (updates.status !== undefined && meta.statusField.options) {
    // Use the same normalization as mapProjectItemToTask: lowercase, replace non-alnum with _, trim underscores
    const option = meta.statusField.options.find(
      o => o.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === updates.status
    )
    if (option) {
      await setFieldValue(meta.projectId, itemId, meta.statusField.id, option.id)
    }
  }

  // Update Priority field
  if (updates.priority !== undefined && meta.priorityField?.options) {
    const pNames: Record<number, string> = { 0: 'Critical', 1: 'High', 2: 'Medium', 3: 'Low' }
    const pName = pNames[updates.priority] || 'Medium'
    const option = meta.priorityField.options.find(
      o => o.name.toLowerCase() === pName.toLowerCase()
    )
    if (option) {
      await setFieldValue(meta.projectId, itemId, meta.priorityField.id, option.id)
    }
  }

  // Update Agent TEXT field when assignee changes
  if (updates.assigneeLogin !== undefined && meta.agentField) {
    try {
      // Clear the field if assignee is null, otherwise set the agent name
      await setTextFieldValue(
        meta.projectId, itemId, meta.agentField.id,
        updates.assigneeLogin || '',
      )
    } catch (e) {
      console.error('[ghProject] Failed to update Agent field:', e)
    }
  }

  // Update issue fields (title, body, labels, assignees) via gh CLI
  // Shell-safe: use single-quote escaping for all user-provided values
  const sq = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
  const repo = sq(`${cfg.owner}/${cfg.repo}`)

  if (issueNumber) {
    const editArgs: string[] = []
    if (updates.subject) editArgs.push(`--title ${sq(updates.subject)}`)
    if (updates.description) editArgs.push(`--body ${sq(updates.description)}`)

    if (editArgs.length > 0) {
      try {
        execSync(
          `gh issue edit ${issueNumber} -R ${repo} ${editArgs.join(' ')}`,
          { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] },
        )
      } catch (e) {
        console.error(`Failed to update issue #${issueNumber}:`, e)
      }
    }

    // Remove stale prefix labels before adding new ones to prevent accumulation
    // (e.g. changing taskType from "bug" to "feature" should remove old "type:bug")
    const removeLabels: string[] = []
    if (updates.taskType) removeLabels.push('type:')
    if (updates.blockedBy !== undefined) removeLabels.push('blocked-by:', 'depends:')
    if (updates.previousStatus) removeLabels.push('status:blocked-from:')

    if (removeLabels.length > 0) {
      // Fetch current labels and remove stale prefix matches
      try {
        const labelsJson = execSync(
          `gh issue view ${issueNumber} -R ${repo} --json labels --jq '.labels[].name'`,
          { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] },
        )
        const currentLabels = labelsJson.trim().split('\n').filter(Boolean)
        const toRemove = currentLabels.filter(l =>
          removeLabels.some(prefix => l.toLowerCase().startsWith(prefix))
        )
        if (toRemove.length > 0) {
          const rmFlags = toRemove.map(l => `--remove-label ${sq(l)}`).join(' ')
          execSync(
            `gh issue edit ${issueNumber} -R ${repo} ${rmFlags}`,
            { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] },
          )
        }
      } catch {
        // Non-fatal: stale label removal is best-effort
      }
    }

    // Add labels for taskType and blockedBy when specified
    const addLabels: string[] = []
    if (updates.taskType) addLabels.push(`type:${updates.taskType}`)
    if (updates.blockedBy?.length) {
      for (const ref of updates.blockedBy) addLabels.push(`blocked-by:${ref}`)
    }
    if (updates.previousStatus) addLabels.push(`status:blocked-from:${updates.previousStatus}`)

    if (addLabels.length > 0) {
      const labelFlags = addLabels.map(l => `--add-label ${sq(l)}`).join(' ')
      try {
        execSync(
          `gh issue edit ${issueNumber} -R ${repo} ${labelFlags}`,
          { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] },
        )
      } catch (e) {
        console.error(`Failed to add labels to issue #${issueNumber}:`, e)
      }
    }

    // Apply user-specified labels
    if (updates.labels?.length) {
      const labelFlags = updates.labels.map(l => `--add-label ${sq(l)}`).join(' ')
      try {
        execSync(
          `gh issue edit ${issueNumber} -R ${repo} ${labelFlags}`,
          { encoding: 'utf-8', timeout: 15000, stdio: ['pipe', 'pipe', 'pipe'] },
        )
      } catch (e) {
        console.error(`Failed to update labels on issue #${issueNumber}:`, e)
      }
    }
  }

  invalidateTaskCache(cfg)

  // Return fresh task data
  const tasks = await listTasks(cfg, teamId)
  return tasks.find(t => t.id === itemId) || null
}

// ---------------------------------------------------------------------------
// Write: Delete task (remove from project, optionally close issue)
// ---------------------------------------------------------------------------

export async function deleteTask(
  cfg: GitHubProjectConfig,
  itemId: string,
  closeIssue = false,
): Promise<boolean> {
  const meta = await getProjectMeta(cfg)

  // Get issue number before removing from project
  let issueNumber: number | null = null
  if (closeIssue) {
    issueNumber = await getIssueNumberForItem(meta.projectId, itemId)
  }

  // Remove from project
  const query = `
    mutation($projectId: ID!, $itemId: ID!) {
      deleteProjectV2Item(input: { projectId: $projectId, itemId: $itemId }) {
        deletedItemId
      }
    }
  `
  try {
    ghGraphQL(query, { projectId: meta.projectId, itemId })
  } catch (e) {
    console.error(`Failed to delete project item ${itemId}:`, e)
    return false
  }

  // Optionally close the issue
  if (closeIssue && issueNumber) {
    const sqd = (s: string) => `'${s.replace(/'/g, "'\\''")}'`
    try {
      execSync(
        `gh issue close ${issueNumber} -R ${sqd(`${cfg.owner}/${cfg.repo}`)} --comment 'Removed from project kanban'`,
        { encoding: 'utf-8', timeout: 10000, stdio: ['pipe', 'pipe', 'pipe'] },
      )
    } catch {
      // Non-fatal: item removed from project even if close fails
    }
  }

  invalidateTaskCache(cfg)
  return true
}

// ---------------------------------------------------------------------------
// Write: Update kanban columns (Status field options)
// ---------------------------------------------------------------------------

export async function updateKanbanColumns(
  cfg: GitHubProjectConfig,
  columns: KanbanColumnConfig[],
): Promise<void> {
  const meta = await getProjectMeta(cfg)
  const existingOptions = meta.statusField.options || []

  // GitHub GraphQL does not support bulk-replacing single-select options via updateProjectV2Field.
  // The correct approach is to use the dedicated per-option mutations:
  //   - updateProjectV2SingleSelectFieldOption  (rename an existing option)
  //   - createProjectV2SingleSelectFieldOption  (add a new option)
  //   - deleteProjectV2SingleSelectFieldOption  (remove an option that is no longer present)

  const mutations: Promise<unknown>[] = []

  for (const col of columns) {
    // Match existing option by normalized id or exact label
    const existing = existingOptions.find(
      o =>
        o.name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') === col.id ||
        o.name === col.label,
    )

    if (existing) {
      // Rename if the label changed
      if (existing.name !== col.label) {
        const updateOptionQuery = `
          mutation($fieldId: ID!, $optionId: ID!, $name: String!) {
            updateProjectV2SingleSelectFieldOption(input: {
              fieldId: $fieldId
              optionId: $optionId
              name: $name
            }) {
              projectV2SingleSelectFieldOption { id name }
            }
          }
        `
        mutations.push(
          Promise.resolve(ghGraphQL(updateOptionQuery, {
            fieldId: meta.statusField.id,
            optionId: existing.id,
            name: col.label,
          })),
        )
      }
    } else {
      // Create a new option
      const createOptionQuery = `
        mutation($fieldId: ID!, $name: String!) {
          createProjectV2SingleSelectFieldOption(input: {
            fieldId: $fieldId
            name: $name
          }) {
            projectV2SingleSelectFieldOption { id name }
          }
        }
      `
      mutations.push(
        Promise.resolve(ghGraphQL(createOptionQuery, {
          fieldId: meta.statusField.id,
          name: col.label,
        })),
      )
    }
  }

  // Delete options that are no longer present in the new column list
  for (const existingOpt of existingOptions) {
    const normalizedExistingId = existingOpt.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_|_$/g, '')
    const isStillPresent =
      columns.some(
        c =>
          c.id === normalizedExistingId ||
          c.label === existingOpt.name,
      )

    if (!isStillPresent) {
      const deleteOptionQuery = `
        mutation($fieldId: ID!, $optionId: ID!) {
          deleteProjectV2SingleSelectFieldOption(input: {
            fieldId: $fieldId
            optionId: $optionId
          }) {
            deletedOptionId
          }
        }
      `
      mutations.push(
        ghGraphQL(deleteOptionQuery, {
          fieldId: meta.statusField.id,
          optionId: existingOpt.id,
        }) as Promise<unknown>,
      )
    }
  }

  await Promise.all(mutations)

  // Invalidate meta cache so new options are picked up
  metaCache.delete(cacheKey(cfg))
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function setFieldValue(
  projectId: string,
  itemId: string,
  fieldId: string,
  optionId: string,
): Promise<void> {
  const query = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $optionId: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { singleSelectOptionId: $optionId }
      }) {
        projectV2Item { id }
      }
    }
  `
  ghGraphQL(query, { projectId, itemId, fieldId, optionId })
}

/** Set a TEXT field value on a GitHub Project V2 item (e.g. the Agent field). */
async function setTextFieldValue(
  projectId: string,
  itemId: string,
  fieldId: string,
  text: string,
): Promise<void> {
  const query = `
    mutation($projectId: ID!, $itemId: ID!, $fieldId: ID!, $text: String!) {
      updateProjectV2ItemFieldValue(input: {
        projectId: $projectId
        itemId: $itemId
        fieldId: $fieldId
        value: { text: $text }
      }) {
        projectV2Item { id }
      }
    }
  `
  ghGraphQL(query, { projectId, itemId, fieldId, text })
}

async function getIssueNumberForItem(
  _projectId: string,
  itemId: string,
): Promise<number | null> {
  // Query the project item directly by node ID — works regardless of project size
  const query = `
    query($itemId: ID!) {
      node(id: $itemId) {
        ... on ProjectV2Item {
          content {
            ... on Issue { number }
            ... on PullRequest { number }
          }
        }
      }
    }
  `

  try {
    const result = ghGraphQL(query, { itemId }) as {
      data: { node: { content: { number?: number } | null } | null }
    }
    return result.data?.node?.content?.number || null
  } catch {
    return null
  }
}

// ---------------------------------------------------------------------------
// Resolve deps (adds computed fields for UI compatibility)
// ---------------------------------------------------------------------------

export function resolveTaskDeps(tasks: Task[]): TaskWithDeps[] {
  // Build a map from issue references (#N) and item IDs to task IDs
  // so blockedBy references (which may be issue numbers) can resolve
  const refToTaskId = new Map<string, string>()
  for (const t of tasks) {
    // Map item ID directly
    refToTaskId.set(t.id, t.id)
    // Map #N references from externalRef URL → extract issue number
    if (t.externalRef) {
      const m = t.externalRef.match(/\/issues\/(\d+)$/)
      if (m) refToTaskId.set(`#${m[1]}`, t.id)
    }
  }

  // Resolve blockedBy references to actual task IDs
  const resolvedTasks = tasks.map(task => {
    const resolvedBlockedBy = task.blockedBy
      .map(ref => refToTaskId.get(ref) || ref)
      .filter(id => tasks.some(t => t.id === id)) // only keep valid task IDs

    return { ...task, blockedBy: resolvedBlockedBy }
  })

  // Build reverse map: taskId → list of task IDs it blocks
  const blocksMap = new Map<string, string[]>()
  for (const t of resolvedTasks) {
    for (const depId of t.blockedBy) {
      const existing = blocksMap.get(depId) || []
      existing.push(t.id)
      blocksMap.set(depId, existing)
    }
  }

  // Compute isBlocked: true if any blockedBy task is NOT completed
  const completedStatuses = new Set(['completed', 'done', 'closed'])
  return resolvedTasks.map(task => ({
    ...task,
    blocks: blocksMap.get(task.id) || [],
    isBlocked: task.blockedBy.length > 0 && task.blockedBy.some(depId => {
      const dep = resolvedTasks.find(t => t.id === depId)
      return dep ? !completedStatuses.has(dep.status) : false
    }),
    assigneeName: task.assigneeAgentId || undefined,
  }))
}

// ---------------------------------------------------------------------------
// Utility: Force-refresh all caches for a project
// ---------------------------------------------------------------------------

export function refreshCache(cfg: GitHubProjectConfig): void {
  const key = cacheKey(cfg)
  metaCache.delete(key)
  taskCache.delete(key)
}
