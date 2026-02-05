/**
 * Phase 5 Schema Extension for AI Maestro Agent Memory
 *
 * Extends existing schema with:
 * - Transcripts (stored conversation transcripts for export/playback)
 * - Playback State (persistent playback position and speed)
 * - Export Jobs (background job tracking for transcript exports)
 */

import { AgentDatabase } from './cozo-db'
import { escapeForCozo } from './cozo-utils'

/**
 * Initialize Phase 5 extensions to existing agent memory schema
 */
export async function initializePhase5Schema(agentDb: AgentDatabase): Promise<void> {
  console.log('[SCHEMA-PHASE5] Initializing Phase 5 extensions...')

  const createTableIfNotExists = async (tableName: string, schema: string) => {
    try {
      await agentDb.run(schema)
      console.log(`[SCHEMA-PHASE5] ✓ Created table: ${tableName}`)
    } catch (error: any) {
      if (error.code === 'eval::stored_relation_conflict') {
        console.log(`[SCHEMA-PHASE5] ℹ Table ${tableName} already exists`)
      } else {
        console.error(`[SCHEMA-PHASE5] ✗ Failed to create ${tableName}:`, error)
        throw error
      }
    }
  }

  // 1. Transcripts table - Store exported transcripts
  await createTableIfNotExists('transcripts', `
    :create transcripts {
      transcript_id: String
      =>
      agent_id: String,
      session_id: String,
      start_time: Int,
      end_time: Int,
      message_count: Int,
      file_path: String,
      format: String,
      created_at: Int,
      updated_at: Int
    }
  `)

  // 2. Playback state - Persistent playback position and speed
  await createTableIfNotExists('playback_state', `
    :create playback_state {
      agent_id: String,
      session_id: String
      =>
      is_playing: Bool,
      current_position: Int,
      playback_speed: Float,
      updated_at: Int
    }
  `)

  // 3. Export jobs - Track background export tasks
  await createTableIfNotExists('export_jobs', `
    :create export_jobs {
      job_id: String
      =>
      agent_id: String,
      session_id: String,
      export_type: String,
      status: String,
      progress: Float,
      file_path: String?,
      created_at: Int,
      completed_at: Int?,
      error: String?
    }
  `)

  console.log('[SCHEMA-PHASE5] ✅ Phase 5 extensions initialized')
}

/**
 * Create a new transcript record
 */
export async function createTranscript(
  agentDb: AgentDatabase,
  transcript: {
    transcript_id: string
    agent_id: string
    session_id: string
    start_time: number
    end_time: number
    message_count: number
    file_path: string
    format: 'json' | 'markdown' | 'plaintext' | 'csv'
  }
): Promise<void> {
  const now = Date.now()

  await agentDb.run(`
    ?[transcript_id, agent_id, session_id, start_time, end_time,
       message_count, file_path, format, created_at, updated_at] <- [[
      ${escapeForCozo(transcript.transcript_id)},
      ${escapeForCozo(transcript.agent_id)},
      ${escapeForCozo(transcript.session_id)},
      ${transcript.start_time},
      ${transcript.end_time},
      ${transcript.message_count},
      ${escapeForCozo(transcript.file_path)},
      ${escapeForCozo(transcript.format)},
      ${now},
      ${now}
    ]]
    :put transcripts
  `)
}

/**
 * Update a transcript
 */
export async function updateTranscript(
  agentDb: AgentDatabase,
  transcriptId: string,
  updates: {
    end_time?: number
    message_count?: number
    file_path?: string
  }
): Promise<void> {
  const now = Date.now()
  const fields: string[] = ['updated_at']
  const values: string[] = [`${now}`]

  if (updates.end_time !== undefined) {
    fields.push('end_time')
    values.push(`${updates.end_time}`)
  }
  if (updates.message_count !== undefined) {
    fields.push('message_count')
    values.push(`${updates.message_count}`)
  }
  if (updates.file_path !== undefined) {
    fields.push('file_path')
    values.push(escapeForCozo(updates.file_path))
  }

  await agentDb.run(`
    ?[transcript_id, ${fields.join(', ')}] <- [[
      ${escapeForCozo(transcriptId)},
      ${values.join(', ')}
    ]]
    :update transcripts
  `)
}

/**
 * Get transcripts for an agent
 */
export async function getTranscripts(
  agentDb: AgentDatabase,
  agentId: string,
  sessionId?: string
): Promise<Array<{
  transcript_id: string
  session_id: string
  start_time: number
  end_time: number
  message_count: number
  file_path: string
  format: string
  created_at: number
  updated_at: number
}>> {
  const sessionFilter = sessionId ? `, session_id = ${escapeForCozo(sessionId)}` : ''

  const result = await agentDb.run(`
    ?[transcript_id, session_id, start_time, end_time, message_count,
       file_path, format, created_at, updated_at] :=
      *transcripts{transcript_id, session_id, start_time, end_time,
        message_count, file_path, format, created_at, updated_at},
      agent_id = ${escapeForCozo(agentId)}
      ${sessionFilter}
    :order -created_at
  `)

  return result.rows.map((row: unknown[]) => ({
    transcript_id: row[0] as string,
    session_id: row[1] as string,
    start_time: row[2] as number,
    end_time: row[3] as number,
    message_count: row[4] as number,
    file_path: row[5] as string,
    format: row[6] as string,
    created_at: row[7] as number,
    updated_at: row[8] as number
  }))
}

/**
 * Get a specific transcript
 */
export async function getTranscript(
  agentDb: AgentDatabase,
  transcriptId: string
): Promise<{
  transcript_id: string
  agent_id: string
  session_id: string
  start_time: number
  end_time: number
  message_count: number
  file_path: string
  format: string
  created_at: number
  updated_at: number
} | null> {
  const result = await agentDb.run(`
    ?[transcript_id, agent_id, session_id, start_time, end_time,
       message_count, file_path, format, created_at, updated_at] :=
      *transcripts{transcript_id, agent_id, session_id, start_time, end_time,
        message_count, file_path, format, created_at, updated_at},
      transcript_id = ${escapeForCozo(transcriptId)}
  `)

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    transcript_id: row[0] as string,
    agent_id: row[1] as string,
    session_id: row[2] as string,
    start_time: row[3] as number,
    end_time: row[4] as number,
    message_count: row[5] as number,
    file_path: row[6] as string,
    format: row[7] as string,
    created_at: row[8] as number,
    updated_at: row[9] as number
  }
}

/**
 * Delete a transcript
 */
export async function deleteTranscript(
  agentDb: AgentDatabase,
  transcriptId: string
): Promise<void> {
  await agentDb.run(`
    ?[transcript_id] := *transcripts{transcript_id},
      transcript_id = ${escapeForCozo(transcriptId)}
    :delete transcripts
  `)
}

/**
 * Update or create playback state
 */
export async function upsertPlaybackState(
  agentDb: AgentDatabase,
  state: {
    agent_id: string
    session_id: string
    is_playing: boolean
    current_position: number
    playback_speed: number
  }
): Promise<void> {
  const now = Date.now()

  await agentDb.run(`
    ?[agent_id, session_id, is_playing, current_position,
       playback_speed, updated_at] <- [[
      ${escapeForCozo(state.agent_id)},
      ${escapeForCozo(state.session_id)},
      ${state.is_playing},
      ${state.current_position},
      ${state.playback_speed},
      ${now}
    ]]
    :put playback_state
  `)
}

/**
 * Get playback state for an agent/session
 */
export async function getPlaybackState(
  agentDb: AgentDatabase,
  agentId: string,
  sessionId?: string
): Promise<{
  agent_id: string
  session_id: string | null
  is_playing: boolean
  current_position: number
  playback_speed: number
  updated_at: number
} | null> {
  const sessionFilter = sessionId
    ? `, session_id = ${escapeForCozo(sessionId)}`
    : ''

  const result = await agentDb.run(`
    ?[agent_id, session_id, is_playing, current_position,
       playback_speed, updated_at] :=
      *playback_state{agent_id, session_id, is_playing,
        current_position, playback_speed, updated_at},
      agent_id = ${escapeForCozo(agentId)}
      ${sessionFilter}
  `)

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    agent_id: row[0] as string,
    session_id: row[1] as string | null,
    is_playing: row[2] as boolean,
    current_position: row[3] as number,
    playback_speed: row[4] as number,
    updated_at: row[5] as number
  }
}

/**
 * Create a new export job
 */
export async function createExportJob(
  agentDb: AgentDatabase,
  job: {
    job_id: string
    agent_id: string
    session_id: string
    export_type: 'json' | 'markdown' | 'plaintext' | 'csv'
  }
): Promise<void> {
  const now = Date.now()

  await agentDb.run(`
    ?[job_id, agent_id, session_id, export_type, status,
       progress, created_at] <- [[
      ${escapeForCozo(job.job_id)},
      ${escapeForCozo(job.agent_id)},
      ${escapeForCozo(job.session_id)},
      ${escapeForCozo(job.export_type)},
      'pending',
      0.0,
      ${now}
    ]]
    :put export_jobs
  `)
}

/**
 * Update export job progress
 */
export async function updateExportJob(
  agentDb: AgentDatabase,
  jobId: string,
  updates: {
    status?: 'pending' | 'processing' | 'completed' | 'failed'
    progress?: number
    file_path?: string
    error?: string
  }
): Promise<void> {
  const now = Date.now()
  const fields: string[] = []
  const values: string[] = []

  if (updates.status !== undefined) {
    fields.push('status')
    values.push(escapeForCozo(updates.status))
    if (updates.status === 'completed' || updates.status === 'failed') {
      fields.push('completed_at')
      values.push(`${now}`)
    }
  }
  if (updates.progress !== undefined) {
    fields.push('progress')
    values.push(`${updates.progress}`)
  }
  if (updates.file_path !== undefined) {
    fields.push('file_path')
    values.push(escapeForCozo(updates.file_path))
  }
  if (updates.error !== undefined) {
    fields.push('error')
    values.push(escapeForCozo(updates.error))
  }

  if (fields.length === 0) return

  await agentDb.run(`
    ?[job_id, ${fields.join(', ')}] <- [[
      ${escapeForCozo(jobId)},
      ${values.join(', ')}
    ]]
    :update export_jobs
  `)
}

/**
 * Get export job
 */
export async function getExportJob(
  agentDb: AgentDatabase,
  jobId: string
): Promise<{
  job_id: string
  agent_id: string
  session_id: string
  export_type: string
  status: string
  progress: number
  file_path: string | null
  created_at: number
  completed_at: number | null
  error: string | null
} | null> {
  const result = await agentDb.run(`
    ?[job_id, agent_id, session_id, export_type, status,
       progress, file_path, created_at, completed_at, error] :=
      *export_jobs{job_id, agent_id, session_id, export_type, status,
        progress, file_path, created_at, completed_at, error},
      job_id = ${escapeForCozo(jobId)}
  `)

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    job_id: row[0] as string,
    agent_id: row[1] as string,
    session_id: row[2] as string,
    export_type: row[3] as string,
    status: row[4] as string,
    progress: row[5] as number,
    file_path: row[6] as string | null,
    created_at: row[7] as number,
    completed_at: row[8] as number | null,
    error: row[9] as string | null
  }
}

/**
 * Get export jobs for an agent
 */
export async function getExportJobs(
  agentDb: AgentDatabase,
  agentId: string,
  sessionId?: string
): Promise<Array<{
  job_id: string
  session_id: string
  export_type: string
  status: string
  progress: number
  file_path: string | null
  created_at: number
  completed_at: number | null
  error: string | null
}>> {
  const sessionFilter = sessionId ? `, session_id = ${escapeForCozo(sessionId)}` : ''

  const result = await agentDb.run(`
    ?[job_id, session_id, export_type, status, progress,
       file_path, created_at, completed_at, error] :=
      *export_jobs{job_id, session_id, export_type, status,
        progress, file_path, created_at, completed_at, error},
      agent_id = ${escapeForCozo(agentId)}
      ${sessionFilter}
    :order -created_at
  `)

  return result.rows.map((row: unknown[]) => ({
    job_id: row[0] as string,
    session_id: row[1] as string,
    export_type: row[2] as string,
    status: row[3] as string,
    progress: row[4] as number,
    file_path: row[5] as string | null,
    created_at: row[6] as number,
    completed_at: row[7] as number | null,
    error: row[8] as string | null
  }))
}
