/**
 * CozoDB Schema for AI Maestro Agent Tracking
 *
 * This schema tracks the complete hierarchy:
 * Agent → Sessions → Projects → Claude Sessions
 *
 * Every entity includes pointers to actual files/directories
 * for raw data access.
 */

import { AgentDatabase } from './cozo-db'
import { escapeForCozo } from './cozo-utils'
import { schemaDebug } from './schema-log'

/**
 * Initialize all tracking tables in the agent database
 */
export async function initializeTrackingSchema(agentDb: AgentDatabase): Promise<void> {
  console.log('[SCHEMA] Initializing agent tracking schema...')

  // Helper to create table if it doesn't exist
  const createTableIfNotExists = async (tableName: string, schema: string) => {
    try {
      await agentDb.run(schema)
      console.log(`[SCHEMA] ✓ Created table: ${tableName}`)
    } catch (error: any) {
      if (error.code === 'eval::stored_relation_conflict') {
        schemaDebug(`[SCHEMA] ℹ Table ${tableName} already exists, skipping`)
      } else {
        console.error(`[SCHEMA] ✗ Failed to create ${tableName}:`, error)
        throw error
      }
    }
  }

  // 1. Agents table - AI Maestro agent metadata
  await createTableIfNotExists('agents', `
    :create agents {
      agent_id: String
      =>
      name: String,
      type: String,              # 'local' | 'cloud' | 'container'
      status: String,            # 'active' | 'inactive' | 'archived'
      model: String,             # Claude model (sonnet, opus, haiku)

      # File pointers (nullable until we discover them)
      working_directory: String?,
      config_file: String?,       # Path to agent config JSON
      metadata_file: String?,     # Path to additional metadata

      # Timestamps
      created_at: Int,
      updated_at: Int,
      last_active_at: Int,

      # Current state
      current_session_id: String?,     # Currently active session
      current_project_path: String?,   # Currently active project

      # Statistics
      total_sessions: Int,
      total_projects: Int,
      total_conversations: Int
    }
  `)

  // 2. Sessions table - AI Maestro tmux sessions
  await createTableIfNotExists('sessions', `
    :create sessions {
      session_id: String
      =>
      agent_id: String,          # Parent agent
      session_name: String,      # tmux session name
      status: String,            # 'active' | 'detached' | 'ended'

      # File pointers
      log_file: String?,         # Path to session log file
      notes_file: String?,       # Path to session notes

      # Project info
      project_path: String?,     # Claude project directory
      project_name: String?,     # Human-readable project name

      # Timestamps
      started_at: Int,
      ended_at: Int?,
      last_active_at: Int,
      duration_seconds: Int,     # Total active time

      # Statistics
      total_claude_sessions: Int,
      total_messages: Int,
      total_tokens: Int
    }
  `)

  // 3. Projects table - Claude Code projects
  await createTableIfNotExists('projects', `
    :create projects {
      project_id: String
      =>
      agent_id: String,          # Parent agent
      project_path: String,      # Full path to project directory
      project_name: String,      # Directory name

      # File pointers (discovered later)
      claude_config_dir: String?, # Path to .claude/ directory
      claude_settings: String?,   # Path to settings.local.json
      claude_md: String?,         # Path to CLAUDE.md

      # Project metadata
      is_active: Bool,
      language: String?,          # Primary language (detected)
      framework: String?,         # Detected framework

      # Timestamps
      first_seen: Int,
      last_seen: Int,
      last_modified: Int?,

      # Statistics
      total_sessions: Int,       # How many AI Maestro sessions worked here
      total_claude_sessions: Int,
      total_messages: Int
    }
  `)

  // 4. Claude sessions table - Individual conversation files
  await createTableIfNotExists('claude_sessions', `
    :create claude_sessions {
      claude_session_id: String
      =>
      agent_id: String,            # Parent agent
      ai_maestro_session_id: String?, # Parent AI Maestro session
      project_id: String,          # Parent project

      # File pointers
      jsonl_file: String,          # Path to conversation JSONL
      sidechain_files: String?,    # JSON array of sidechain paths

      # Session metadata
      session_type: String,        # 'main' | 'sidechain'
      status: String,              # 'active' | 'completed' | 'abandoned'

      # Conversation metadata
      first_message_at: Int?,
      last_message_at: Int?,
      message_count: Int,

      # Token usage
      input_tokens: Int,
      output_tokens: Int,
      total_tokens: Int,

      # Content summary
      first_user_message: String?, # First message for quick reference
      last_assistant_message: String?,
      topics: String?              # JSON array of extracted topics
    }
  `)

  // 5. Session relationships - Links between AI Maestro sessions and projects
  await createTableIfNotExists('session_projects', `
    :create session_projects {
      session_id: String,
      project_id: String
      =>
      agent_id: String,

      # When this session worked on this project
      started_at: Int,
      ended_at: Int?,
      is_current: Bool,

      # Activity metrics
      messages_in_project: Int,
      tokens_in_project: Int,
      files_modified: Int
    }
  `)

  console.log('[SCHEMA] ✅ Agent tracking schema initialized')
}

/**
 * Helper: Insert or update agent record
 */
export async function upsertAgent(agentDb: AgentDatabase, agent: {
  agent_id: string
  name: string
  type: 'local' | 'cloud' | 'container'
  model?: string
  working_directory?: string
  config_file?: string
  metadata_file?: string
}): Promise<void> {
  const now = Date.now()

  // Build the data row with proper escaping
  const dataRow = [
    escapeForCozo(agent.agent_id),
    escapeForCozo(agent.name),
    escapeForCozo(agent.type),
    escapeForCozo('active'),
    escapeForCozo(agent.model || 'sonnet'),
    escapeForCozo(agent.working_directory),
    escapeForCozo(agent.config_file),
    escapeForCozo(agent.metadata_file),
    `${now}`,
    `${now}`,
    `${now}`,
    'null', // current_session_id
    'null', // current_project_path
    '0', // total_sessions
    '0', // total_projects
    '0'  // total_conversations
  ].join(', ')

  await agentDb.run(`
    ?[agent_id, name, type, status, model, working_directory, config_file,
      metadata_file, created_at, updated_at, last_active_at,
      current_session_id, current_project_path,
      total_sessions, total_projects, total_conversations] <- [
      [${dataRow}]
    ]
    :put agents
  `)
}

/**
 * Helper: Record a new AI Maestro session
 */
export async function createSession(agentDb: AgentDatabase, session: {
  session_id: string
  agent_id: string
  session_name: string
  project_path?: string
  log_file?: string
}): Promise<void> {
  const now = Date.now()

  // Build the data row with proper escaping
  const dataRow = [
    escapeForCozo(session.session_id),
    escapeForCozo(session.agent_id),
    escapeForCozo(session.session_name),
    escapeForCozo('active'),
    'null', // log_file
    'null', // notes_file
    'null', // project_path
    'null', // project_name
    `${now}`,
    'null', // ended_at
    `${now}`,
    '0', // duration_seconds
    '0', // total_claude_sessions
    '0', // total_messages
    '0'  // total_tokens
  ].join(', ')

  await agentDb.run(`
    ?[session_id, agent_id, session_name, status, log_file, notes_file,
      project_path, project_name, started_at, ended_at, last_active_at,
      duration_seconds, total_claude_sessions, total_messages, total_tokens] <- [
      [${dataRow}]
    ]
    :put sessions
  `)

  // Update agent's current session
  await agentDb.run(`
    ?[agent_id, current_session_id, updated_at, last_active_at, total_sessions] <- [
      [${escapeForCozo(session.agent_id)}, ${escapeForCozo(session.session_id)}, ${now}, ${now}, 1]
    ]
    :update agents
  `)
}

/**
 * Helper: Record or update a Claude project
 */
export async function upsertProject(agentDb: AgentDatabase, project: {
  project_id: string
  agent_id: string
  project_path: string
  project_name: string
  claude_config_dir?: string
  claude_settings?: string
  claude_md?: string
  language?: string
  framework?: string
}): Promise<void> {
  const now = Date.now()

  // Build the data row with proper escaping
  const dataRow = [
    escapeForCozo(project.project_id),
    escapeForCozo(project.agent_id),
    escapeForCozo(project.project_path),
    escapeForCozo(project.project_name),
    escapeForCozo(project.claude_config_dir),
    escapeForCozo(project.claude_settings),
    escapeForCozo(project.claude_md),
    'true', // is_active
    escapeForCozo(project.language),
    escapeForCozo(project.framework),
    `${now}`,
    `${now}`,
    'null', // last_modified (nullable)
    '0', // total_sessions
    '0', // total_claude_sessions
    '0'  // total_messages
  ].join(', ')

  await agentDb.run(`
    ?[project_id, agent_id, project_path, project_name, claude_config_dir,
      claude_settings, claude_md, is_active, language, framework,
      first_seen, last_seen, last_modified,
      total_sessions, total_claude_sessions, total_messages] <- [
      [${dataRow}]
    ]
    :put projects
  `)
}

/**
 * Helper: Record a Claude conversation session
 */
export async function createClaudeSession(agentDb: AgentDatabase, session: {
  claude_session_id: string
  agent_id: string
  project_id: string
  ai_maestro_session_id?: string
  jsonl_file: string
  session_type: 'main' | 'sidechain'
}): Promise<void> {
  const now = Date.now()

  // Build the data row with proper escaping
  const dataRow = [
    escapeForCozo(session.claude_session_id),
    escapeForCozo(session.agent_id),
    escapeForCozo(session.ai_maestro_session_id),
    escapeForCozo(session.project_id),
    escapeForCozo(session.jsonl_file),
    'null', // sidechain_files
    escapeForCozo(session.session_type),
    escapeForCozo('active'),
    'null', // first_message_at
    'null', // last_message_at
    '0', // message_count
    '0', // input_tokens
    '0', // output_tokens
    '0', // total_tokens
    'null', // first_user_message
    'null', // last_assistant_message
    'null'  // topics
  ].join(', ')

  await agentDb.run(`
    ?[claude_session_id, agent_id, ai_maestro_session_id, project_id,
      jsonl_file, sidechain_files, session_type, status,
      first_message_at, last_message_at, message_count,
      input_tokens, output_tokens, total_tokens,
      first_user_message, last_assistant_message, topics] <- [
      [${dataRow}]
    ]
    :put claude_sessions
  `)
}

/**
 * Columns each tracking relation must have for the tracking queries to run.
 *
 * Real agent databases usually have `sessions` and `projects` from the
 * simple schema (lib/cozo-schema-simple.ts) with different columns, and no
 * `agents` relation at all. initializeTrackingSchema skips a relation that
 * already exists, so a name check alone is not enough: the columns decide.
 */
const TRACKING_REQUIRED_COLUMNS: Record<string, string[]> = {
  agents: ['agent_id', 'name', 'working_directory', 'current_session_id',
    'current_project_path', 'total_sessions', 'total_projects'],
  sessions: ['session_id', 'agent_id', 'session_name', 'project_path',
    'started_at', 'ended_at', 'status', 'total_messages'],
  projects: ['project_id', 'agent_id', 'project_path', 'project_name', 'last_seen'],
  claude_sessions: ['claude_session_id', 'ai_maestro_session_id', 'project_id'],
}

type CozoResult = { headers?: string[]; rows?: unknown[][] }

/** Turn a Cozo result into one object per row, keyed by header. */
function rowsToObjects(result: CozoResult): Record<string, unknown>[] {
  const headers = result?.headers || []
  return (result?.rows || []).map(row => {
    const obj: Record<string, unknown> = {}
    headers.forEach((h, i) => { obj[h] = row[i] })
    return obj
  })
}

/** Column names of every stored relation, keyed by relation name. */
async function relationColumns(agentDb: AgentDatabase): Promise<Map<string, Set<string>>> {
  const out = new Map<string, Set<string>>()
  const relations = await agentDb.run('::relations')
  for (const row of relations?.rows || []) {
    const name = String(row[0])
    const cols = await agentDb.run(`::columns ${name}`)
    out.set(name, new Set((cols?.rows || []).map((r: unknown[]) => String(r[0]))))
  }
  return out
}

function hasColumns(columns: Map<string, Set<string>>, relation: string, needed: string[]): boolean {
  const have = columns.get(relation)
  return !!have && needed.every(c => have.has(c))
}

/**
 * True when every tracking relation exists with the columns the tracking
 * queries read. False on a database that never ran initializeTrackingSchema,
 * or where the simple schema's `sessions`/`projects` occupy those names.
 */
export async function hasTrackingSchema(agentDb: AgentDatabase): Promise<boolean> {
  const columns = await relationColumns(agentDb)
  return Object.entries(TRACKING_REQUIRED_COLUMNS)
    .every(([relation, needed]) => hasColumns(columns, relation, needed))
}

/**
 * Projects recorded in the agent's `projects` relation, most recent first.
 * Works with both the tracking schema (filtered by agent_id) and the simple
 * schema (one database per agent, no agent_id column). Returns [] when the
 * relation is missing or has neither shape.
 */
export async function getTrackedProjects(agentDb: AgentDatabase, agentId: string) {
  const columns = await relationColumns(agentDb)
  if (!hasColumns(columns, 'projects', ['project_path', 'project_name', 'last_seen'])) return []

  const projectCols = columns.get('projects')!
  const query = projectCols.has('agent_id') && projectCols.has('project_id')
    ? `?[project_id, project_name, project_path, last_seen] :=
         *projects{project_id, agent_id, project_name, project_path, last_seen},
         agent_id = ${escapeForCozo(agentId)}
       :order -last_seen`
    : `?[project_name, project_path, last_seen] :=
         *projects{project_name, project_path, last_seen}
       :order -last_seen`

  return rowsToObjects(await agentDb.run(query))
}

/**
 * Query: Get agent with all current context.
 *
 * Four separate queries, one per result set. Cozo cannot put rule names in a
 * constant list (a `<-` fact list naming rules fails with
 * eval::not_constant), which is what this function used to do.
 * Requires the tracking schema; check hasTrackingSchema first.
 */
export async function getAgentFullContext(agentDb: AgentDatabase, agentId: string) {
  const id = escapeForCozo(agentId)

  const agent = rowsToObjects(await agentDb.run(`
    ?[agent_id, name, working_directory, current_session_id, current_project_path,
      total_sessions, total_projects] :=
      *agents{agent_id, name, working_directory, current_session_id, current_project_path,
              total_sessions, total_projects},
      agent_id = ${id}
  `))

  const currentSession = rowsToObjects(await agentDb.run(`
    ?[session_id, session_name, project_path, started_at] :=
      *agents{agent_id, current_session_id},
      agent_id = ${id},
      *sessions{session_id, session_name, project_path, started_at},
      session_id = current_session_id
  `))

  const allSessions = rowsToObjects(await agentDb.run(`
    ?[session_id, session_name, status, started_at] :=
      *sessions{session_id, agent_id, session_name, status, started_at},
      agent_id = ${id}
    :order -started_at
  `))

  const allProjects = rowsToObjects(await agentDb.run(`
    ?[project_id, project_name, project_path, last_seen] :=
      *projects{project_id, agent_id, project_name, project_path, last_seen},
      agent_id = ${id}
    :order -last_seen
  `))

  return {
    agent: agent[0] ?? null,
    current_session: currentSession[0] ?? null,
    all_sessions: allSessions,
    all_projects: allProjects,
  }
}

/**
 * Query: Get all Claude sessions for a project
 */
export async function getProjectClaudeSessions(agentDb: AgentDatabase, projectId: string) {
  const query = `
    ?[claude_session_id, jsonl_file, session_type, status, message_count,
      first_message_at, last_message_at, total_tokens] :=
      *claude_sessions{
        claude_session_id, project_id, jsonl_file, session_type, status,
        message_count, first_message_at, last_message_at, total_tokens
      },
      project_id = ${escapeForCozo(projectId)}

    :order -last_message_at
  `

  return await agentDb.run(query)
}

/**
 * Query: Get agent's complete work history, one row per AI Maestro session,
 * newest first.
 *
 * Aggregates live in a rule head (`count(...)` in the body is not valid Cozo).
 * Sessions with no Claude sessions get a count of 0, and sessions whose
 * project_path matches no project get a null project_name, instead of being
 * dropped by the join.
 * Requires the tracking schema; check hasTrackingSchema first.
 */
export async function getAgentWorkHistory(agentDb: AgentDatabase, agentId: string) {
  const query = `
    cs_count[session_id, count(claude_session_id)] :=
      *claude_sessions{claude_session_id, ai_maestro_session_id: session_id}

    session_cs[session_id, n] := cs_count[session_id, n]
    session_cs[session_id, n] :=
      *sessions{session_id}, not cs_count[session_id, _], n = 0

    session_project[session_id, project_name] :=
      *sessions{session_id, project_path}, *projects{project_path, project_name}
    session_project[session_id, project_name] :=
      *sessions{session_id, project_path}, not *projects{project_path}, project_name = null

    ?[session_id, session_name, project_name, claude_session_count, total_messages,
      started_at, ended_at, status] :=
      *sessions{session_id, agent_id, session_name, started_at, ended_at, status, total_messages},
      agent_id = ${escapeForCozo(agentId)},
      session_project[session_id, project_name],
      session_cs[session_id, claude_session_count]

    :order -started_at
  `

  return rowsToObjects(await agentDb.run(query))
}
