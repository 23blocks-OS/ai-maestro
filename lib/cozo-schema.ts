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
        console.log(`[SCHEMA] ℹ Table ${tableName} already exists, skipping`)
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

  // Build the data row with proper null handling
  const dataRow = [
    `'${agent.agent_id}'`,
    `'${agent.name}'`,
    `'${agent.type}'`,
    `'active'`,
    `'${agent.model || 'sonnet'}'`,
    agent.working_directory ? `'${agent.working_directory}'` : 'null',
    agent.config_file ? `'${agent.config_file}'` : 'null',
    agent.metadata_file ? `'${agent.metadata_file}'` : 'null',
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

  // Build the data row with proper null handling
  const dataRow = [
    `'${session.session_id}'`,
    `'${session.agent_id}'`,
    `'${session.session_name}'`,
    `'active'`,
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
      ['${session.agent_id}', '${session.session_id}', ${now}, ${now}, 1]
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

  // Build the data row with proper null handling
  const dataRow = [
    `'${project.project_id}'`,
    `'${project.agent_id}'`,
    `'${project.project_path}'`,
    `'${project.project_name}'`,
    project.claude_config_dir ? `'${project.claude_config_dir}'` : 'null',
    project.claude_settings ? `'${project.claude_settings}'` : 'null',
    project.claude_md ? `'${project.claude_md}'` : 'null',
    'true', // is_active
    project.language ? `'${project.language}'` : 'null',
    project.framework ? `'${project.framework}'` : 'null',
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

  // Build the data row with proper null handling
  const dataRow = [
    `'${session.claude_session_id}'`,
    `'${session.agent_id}'`,
    session.ai_maestro_session_id ? `'${session.ai_maestro_session_id}'` : 'null',
    `'${session.project_id}'`,
    `'${session.jsonl_file}'`,
    'null', // sidechain_files
    `'${session.session_type}'`,
    `'active'`,
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
 * Query: Get agent with all current context
 */
export async function getAgentFullContext(agentDb: AgentDatabase, agentId: string) {
  const query = `
    # Get agent info
    agent[agent_id, name, working_directory, current_session_id, current_project_path,
          total_sessions, total_projects] :=
      *agents{agent_id, name, working_directory, current_session_id, current_project_path,
             total_sessions, total_projects},
      agent_id = '${agentId}'

    # Get current session
    current_session[session_id, session_name, project_path, started_at] :=
      agent[agent_id, _, _, current_session_id, _, _, _],
      *sessions{session_id, session_name, project_path, started_at},
      session_id = current_session_id

    # Get all sessions for this agent
    all_sessions[session_id, session_name, status, started_at] :=
      agent[agent_id, _, _, _, _, _, _],
      *sessions{session_id, agent_id: query_agent_id, session_name, status, started_at},
      query_agent_id = agent_id

    # Get all projects for this agent
    all_projects[project_id, project_name, project_path, last_seen] :=
      agent[agent_id, _, _, _, _, _, _],
      *projects{project_id, agent_id: query_agent_id, project_name, project_path, last_seen},
      query_agent_id = agent_id

    # Return combined results
    ?[type, data] <- [
      ['agent', agent],
      ['current_session', current_session],
      ['all_sessions', all_sessions],
      ['all_projects', all_projects]
    ]
  `

  return await agentDb.run(query)
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
      project_id = '${projectId}'

    :order -last_message_at
  `

  return await agentDb.run(query)
}

/**
 * Query: Get agent's complete work history
 */
export async function getAgentWorkHistory(agentDb: AgentDatabase, agentId: string) {
  const query = `
    # Sessions with their projects and Claude sessions
    ?[session_name, project_name, claude_session_count, total_messages,
      started_at, ended_at, status] :=
      *sessions{
        session_id, agent_id: sess_agent_id, session_name, project_path,
        started_at, ended_at, status, total_messages
      },
      sess_agent_id = '${agentId}',
      *projects{project_id, project_path, project_name},
      *claude_sessions{
        project_id, ai_maestro_session_id: session_id
      },
      claude_session_count = count(claude_session_id)

    :order -started_at
  `

  return await agentDb.run(query)
}
