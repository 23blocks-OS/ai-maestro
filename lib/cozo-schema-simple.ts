/**
 * SIMPLIFIED CozoDB Schema for AI Maestro Agent Memory
 *
 * Purpose: Store metadata that points to actual files on disk
 * Agents have no memory between sessions - this DB IS their memory
 */

import { AgentDatabase } from './cozo-db'

/**
 * Initialize minimal tracking schema
 */
export async function initializeSimpleSchema(agentDb: AgentDatabase): Promise<void> {
  console.log('[SCHEMA] Initializing simple agent memory schema...')

  // 1. Sessions - when the agent worked (points to tmux session data)
  try {
    await agentDb.run(`
      :create sessions {
        session_id: String
        =>
        session_name: String,
        agent_id: String,
        working_directory: String?,
        started_at: Int,
        ended_at: Int?,
        status: String
      }
    `)
    console.log('[SCHEMA] ✓ Created sessions table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA] ℹ sessions table already exists')
    } else {
      throw error
    }
  }

  // 2. Projects - what the agent worked on (points to Claude project dirs)
  try {
    await agentDb.run(`
      :create projects {
        project_path: String
        =>
        project_name: String,
        claude_dir: String?,
        first_seen: Int,
        last_seen: Int
      }
    `)
    console.log('[SCHEMA] ✓ Created projects table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA] ℹ projects table already exists')
    } else {
      throw error
    }
  }

  // 3. Conversations - Claude conversation files (points to .jsonl files)
  try {
    await agentDb.run(`
      :create conversations {
        jsonl_file: String
        =>
        project_path: String,
        session_id: String?,
        first_message_at: Int?,
        last_message_at: Int?,
        message_count: Int
      }
    `)
    console.log('[SCHEMA] ✓ Created conversations table')
  } catch (error: any) {
    if (error.code === 'eval::stored_relation_conflict') {
      console.log('[SCHEMA] ℹ conversations table already exists')
    } else {
      throw error
    }
  }

  console.log('[SCHEMA] ✅ Simple memory schema initialized')
}

/**
 * Record a session (from tmux)
 */
export async function recordSession(agentDb: AgentDatabase, session: {
  session_id: string
  session_name: string
  agent_id: string
  working_directory?: string
  started_at: number
  status?: string
}): Promise<void> {
  await agentDb.run(`
    ?[session_id, session_name, agent_id, working_directory, started_at, ended_at, status] <- [[
      '${session.session_id}',
      '${session.session_name}',
      '${session.agent_id}',
      ${session.working_directory ? `'${session.working_directory}'` : 'null'},
      ${session.started_at},
      null,
      '${session.status || 'active'}'
    ]]
    :put sessions
  `)
}

/**
 * Record a project (from file system scan)
 */
export async function recordProject(agentDb: AgentDatabase, project: {
  project_path: string
  project_name: string
  claude_dir?: string
}): Promise<void> {
  const now = Date.now()

  await agentDb.run(`
    ?[project_path, project_name, claude_dir, first_seen, last_seen] <- [[
      '${project.project_path}',
      '${project.project_name}',
      ${project.claude_dir ? `'${project.claude_dir}'` : 'null'},
      ${now},
      ${now}
    ]]
    :put projects
  `)
}

/**
 * Record a conversation file (from .claude directory scan)
 */
export async function recordConversation(agentDb: AgentDatabase, conversation: {
  jsonl_file: string
  project_path: string
  session_id?: string
  message_count?: number
}): Promise<void> {
  await agentDb.run(`
    ?[jsonl_file, project_path, session_id, first_message_at, last_message_at, message_count] <- [[
      '${conversation.jsonl_file}',
      '${conversation.project_path}',
      ${conversation.session_id ? `'${conversation.session_id}'` : 'null'},
      null,
      null,
      ${conversation.message_count || 0}
    ]]
    :put conversations
  `)
}

/**
 * Get all sessions for this agent
 */
export async function getSessions(agentDb: AgentDatabase, agentId: string) {
  return await agentDb.run(`
    ?[session_id, session_name, working_directory, started_at, ended_at, status] :=
      *sessions{session_id, session_name, agent_id, working_directory, started_at, ended_at, status},
      agent_id = '${agentId}'

    :order -started_at
  `)
}

/**
 * Get all projects
 */
export async function getProjects(agentDb: AgentDatabase) {
  return await agentDb.run(`
    ?[project_path, project_name, claude_dir, first_seen, last_seen] :=
      *projects{
        project_path, project_name, claude_dir,
        first_seen, last_seen
      }

    :order -last_seen
  `)
}

/**
 * Get conversations for a project
 */
export async function getConversations(agentDb: AgentDatabase, projectPath: string) {
  return await agentDb.run(`
    ?[jsonl_file, session_id, first_message_at, last_message_at, message_count] :=
      *conversations{
        jsonl_file, project_path, session_id,
        first_message_at, last_message_at, message_count
      },
      project_path = '${projectPath}'

    :order -last_message_at
  `)
}
