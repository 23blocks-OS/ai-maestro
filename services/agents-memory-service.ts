/**
 * Agents Memory Service
 *
 * Pure business logic extracted from app/api/agents/[id]/memory/** routes.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes become thin wrappers that call these functions.
 *
 * Covers:
 *   GET    /api/agents/:id/memory                  -> getMemory
 *   POST   /api/agents/:id/memory                  -> initializeMemory
 *   GET    /api/agents/:id/memory/consolidate       -> getConsolidationStatus
 *   POST   /api/agents/:id/memory/consolidate       -> triggerConsolidation
 *   PATCH  /api/agents/:id/memory/consolidate       -> manageConsolidation
 *   GET    /api/agents/:id/memory/long-term         -> queryLongTermMemories
 *   DELETE /api/agents/:id/memory/long-term         -> deleteLongTermMemory
 *   PATCH  /api/agents/:id/memory/long-term         -> updateLongTermMemory
 *   GET    /api/agents/:id/search                   -> searchConversations
 *   POST   /api/agents/:id/search                   -> ingestConversations
 *   POST   /api/agents/:id/index-delta              -> runDeltaIndex
 *   GET    /api/agents/:id/tracking                 -> getTracking
 *   POST   /api/agents/:id/tracking                 -> initializeTracking
 *   GET    /api/agents/:id/metrics                  -> getMetrics
 *   PATCH  /api/agents/:id/metrics                  -> updateMetrics
 */

import * as fs from 'fs'
import * as path from 'path'
import os from 'os'
import { agentRegistry } from '@/lib/agent'
import {
  initializeSimpleSchema,
  recordSession,
  recordProject,
  recordConversation,
  getSessions,
  getProjects,
  getConversations
} from '@/lib/cozo-schema-simple'
import { initializeRagSchema } from '@/lib/cozo-schema-rag'
import { getAgent as getRegistryAgent, getAgentBySession, updateAgentMetrics, incrementAgentMetric, getAgent as getAgentFromFileRegistry } from '@/lib/agent-registry'
import { getSelfHost } from '@/lib/hosts-config'
import { hybridSearch, semanticSearch, searchByTerm, searchBySymbol } from '@/lib/rag/search'
import { runIndexDelta } from '@/lib/index-delta'
import {
  initializeTrackingSchema,
  upsertAgent,
  createSession as createTrackingSession,
  upsertProject,
  createClaudeSession,
  getAgentFullContext,
  getAgentWorkHistory
} from '@/lib/cozo-schema'
import { consolidateMemories, promoteMemories, pruneShortTermMemory } from '@/lib/memory/consolidate'
import type { PreparedConversation, ConversationMessage } from '@/lib/memory/types'
import {
  searchMemories,
  getMemoriesByType,
  getFacts,
  getPreferences,
  getPatterns,
  getDecisions,
  getInsights,
  getStats,
  getRecentMemories,
  getMostReinforcedMemories,
  buildMemoryContext,
  getMemoryById
} from '@/lib/memory/search'
import type { MemoryCategory } from '@/lib/cozo-schema-memory'
import { escapeForCozo } from '@/lib/cozo-utils'
import { embedTexts } from '@/lib/rag/embeddings'
import type { UpdateAgentMetricsRequest } from '@/types/agent'

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Trigger delta indexing in the background (non-blocking)
 */
async function triggerBackgroundDeltaIndexing(agentId: string): Promise<void> {
  console.log(`[Memory Service] Triggering background delta indexing for agent ${agentId}`)

  try {
    const selfHost = getSelfHost()
    const response = await fetch(`${selfHost.url}/api/agents/${agentId}/index-delta`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    })

    if (!response.ok) {
      console.error(`[Memory Service] Delta indexing returned status ${response.status}`)
      return
    }

    const result = await response.json()
    if (result.success && result.total_messages_processed > 0) {
      console.log(`[Memory Service] Delta indexed ${result.total_messages_processed} messages`)
    } else {
      console.log(`[Memory Service] No new messages to index`)
    }
  } catch (error) {
    console.error('[Memory Service] Failed to trigger delta indexing:', error)
  }
}

/**
 * Load and prepare conversations for consolidation
 */
async function prepareConversations(
  agentDb: Awaited<ReturnType<typeof agentRegistry.getAgent>>['getDatabase'],
  limit: number = 50
): Promise<PreparedConversation[]> {
  const prepared: PreparedConversation[] = []

  const projectsResult = await (await agentDb()).run(`
    ?[project_path, project_name, claude_dir] :=
      *projects{project_path, project_name, claude_dir}
  `)

  for (const projectRow of projectsResult.rows) {
    const projectPath = projectRow[0] as string
    const claudeDir = projectRow[2] as string

    if (!claudeDir || !fs.existsSync(claudeDir)) {
      continue
    }

    const convosResult = await getConversations(await agentDb(), projectPath)

    for (const convoRow of convosResult.rows) {
      const jsonlFile = convoRow[0] as string
      const firstMessageAt = convoRow[5] as number | null
      const lastMessageAt = convoRow[6] as number | null

      if (!fs.existsSync(jsonlFile)) {
        continue
      }

      try {
        const fileContent = fs.readFileSync(jsonlFile, 'utf-8')
        const lines = fileContent.split('\n').filter(line => line.trim())

        const messages: ConversationMessage[] = []

        for (const line of lines) {
          try {
            const parsed = JSON.parse(line)

            if (!parsed.type || !['user', 'assistant'].includes(parsed.type)) {
              continue
            }

            let content = ''
            if (parsed.message?.content) {
              if (typeof parsed.message.content === 'string') {
                content = parsed.message.content
              } else if (Array.isArray(parsed.message.content)) {
                content = parsed.message.content
                  .filter((block: { type: string }) => block.type === 'text')
                  .map((block: { text: string }) => block.text || '')
                  .join('\n')
              }
            }

            if (!content.trim()) {
              continue
            }

            messages.push({
              role: parsed.type as 'user' | 'assistant',
              content: content.trim(),
              timestamp: parsed.timestamp ? new Date(parsed.timestamp).getTime() : undefined,
              tool_use: parsed.type === 'assistant' && parsed.message?.content?.some?.(
                (block: { type: string }) => block.type === 'tool_use'
              )
            })
          } catch {
            // Skip malformed lines
          }
        }

        if (messages.length > 0) {
          prepared.push({
            file_path: jsonlFile,
            project_path: projectPath,
            messages,
            message_count: messages.length,
            first_message_at: firstMessageAt || undefined,
            last_message_at: lastMessageAt || undefined
          })
        }

        if (prepared.length >= limit) {
          break
        }
      } catch (err) {
        console.error(`[Memory Service] Error processing ${jsonlFile}:`, err)
      }
    }

    if (prepared.length >= limit) {
      break
    }
  }

  return prepared
}

// ===========================================================================
// PUBLIC API — Memory (GET/POST /api/agents/:id/memory)
// ===========================================================================

export async function getMemory(agentId: string): Promise<ServiceResult<any>> {
  try {
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    const sessions = await getSessions(agentDb, agentId)
    const projects = await getProjects(agentDb)

    const projectsWithConversations = []
    for (const project of (projects.rows || [])) {
      const projectPath = project[0]
      const conversations = await getConversations(agentDb, projectPath)
      projectsWithConversations.push({
        project: project,
        conversations: conversations.rows || []
      })
    }

    return {
      data: {
        success: true,
        agent_id: agentId,
        sessions: sessions.rows || [],
        projects: projectsWithConversations
      },
      status: 200
    }
  } catch (error) {
    console.error('[Memory Service] getMemory Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function initializeMemory(
  agentId: string,
  body: { populateFromSessions?: boolean; force?: boolean }
): Promise<ServiceResult<any>> {
  try {
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    await initializeSimpleSchema(agentDb)
    await initializeRagSchema(agentDb)

    if (body.populateFromSessions) {
      if (!body.force) {
        const existingProjects = await getProjects(agentDb)
        if (existingProjects.rows && existingProjects.rows.length > 0) {
          console.log(`[Memory Service] Database already populated with ${existingProjects.rows.length} projects. Skipping.`)
          return {
            data: {
              success: true,
              agent_id: agentId,
              message: 'Memory schema initialized (already populated)',
              skipped_population: true
            },
            status: 200
          }
        }
      } else {
        console.log(`[Memory Service] Force flag set - re-populating database`)
      }

      console.log('[Memory Service] Populating from tmux sessions and historical conversations...')

      const selfHost = getSelfHost()
      const sessionsResponse = await fetch(`${selfHost.url}/api/sessions`)
      const sessionsData = await sessionsResponse.json()

      const agentSessionIds = new Set<string>()
      const projectPaths = new Set<string>()

      const registryAgent = getRegistryAgent(agentId) || getAgentBySession(agentId)
      if (registryAgent) {
        const sessionWd = registryAgent.workingDirectory ||
                          registryAgent.sessions?.[0]?.workingDirectory
        const preferenceWd = registryAgent.preferences?.defaultWorkingDirectory
        if (sessionWd) {
          projectPaths.add(sessionWd)
        }
        if (preferenceWd && preferenceWd !== sessionWd) {
          projectPaths.add(preferenceWd)
        }
      }

      for (const session of sessionsData.sessions || []) {
        if (session.agentId === agentId) {
          agentSessionIds.add(session.id)

          await recordSession(agentDb, {
            session_id: session.id,
            session_name: session.name,
            agent_id: agentId,
            working_directory: session.workingDirectory,
            started_at: new Date(session.createdAt).getTime(),
            status: session.status
          })

          if (session.workingDirectory) {
            projectPaths.add(session.workingDirectory)
          }
        }
      }

      const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')

      if (fs.existsSync(claudeProjectsDir)) {
        const findJsonlFiles = (dir: string): string[] => {
          const files: string[] = []
          try {
            const items = fs.readdirSync(dir)
            for (const item of items) {
              const itemPath = path.join(dir, item)
              try {
                const stats = fs.statSync(itemPath)
                if (stats.isDirectory()) {
                  files.push(...findJsonlFiles(itemPath))
                } else if (item.endsWith('.jsonl')) {
                  files.push(itemPath)
                }
              } catch {
                // Skip
              }
            }
          } catch (err) {
            console.error(`[Memory Service] Error reading directory ${dir}:`, err)
          }
          return files
        }

        const allJsonlFiles = findJsonlFiles(claudeProjectsDir)

        for (const jsonlPath of allJsonlFiles) {
          try {
            const fileContent = fs.readFileSync(jsonlPath, 'utf-8')
            const allLines = fileContent.split('\n').filter(line => line.trim())

            let sessionId: string | null = null
            let cwd: string | null = null
            let firstUserMessage: string | null = null
            let gitBranch: string | null = null
            let claudeVersion: string | null = null
            let firstMessageAt: number | null = null
            let lastMessageAt: number | null = null
            const modelSet = new Set<string>()

            const metadataLines = allLines.slice(0, 50)
            for (const line of metadataLines) {
              try {
                const message = JSON.parse(line)
                if (message.sessionId && !sessionId) sessionId = message.sessionId
                if (message.cwd && !cwd) cwd = message.cwd
                if (message.gitBranch && !gitBranch) gitBranch = message.gitBranch
                if (message.version && !claudeVersion) claudeVersion = message.version
                if (message.timestamp) {
                  const ts = new Date(message.timestamp).getTime()
                  if (!firstMessageAt || ts < firstMessageAt) firstMessageAt = ts
                }
                if (message.type === 'user' && message.message?.content && !firstUserMessage) {
                  firstUserMessage = message.message.content.substring(0, 100)
                }
                if (message.type === 'assistant' && message.message?.model) {
                  const model = message.message.model
                  if (model.includes('sonnet')) modelSet.add('Sonnet 4.5')
                  else if (model.includes('haiku')) modelSet.add('Haiku 4.5')
                  else if (model.includes('opus')) modelSet.add('Opus 4.5')
                }
              } catch {
                // Skip
              }
            }

            for (let i = allLines.length - 1; i >= Math.max(0, allLines.length - 20); i--) {
              try {
                const message = JSON.parse(allLines[i])
                if (message.timestamp) {
                  lastMessageAt = new Date(message.timestamp).getTime()
                  break
                }
              } catch {
                // Skip
              }
            }

            const belongsToAgent =
              (sessionId && agentSessionIds.has(sessionId)) ||
              (cwd && projectPaths.has(cwd))

            if (belongsToAgent && cwd) {
              const messageCount = allLines.length
              const modelNames = Array.from(modelSet).join(', ')
              const projectName = cwd.split('/').pop() || 'unknown'
              const conversationsDir = path.dirname(jsonlPath)

              await recordProject(agentDb, {
                project_path: cwd,
                project_name: projectName,
                claude_dir: conversationsDir
              })

              await recordConversation(agentDb, {
                jsonl_file: jsonlPath,
                project_path: cwd,
                session_id: sessionId || 'unknown',
                message_count: messageCount,
                first_message_at: firstMessageAt || undefined,
                last_message_at: lastMessageAt || undefined,
                first_user_message: firstUserMessage || undefined,
                model_names: modelNames || undefined,
                git_branch: gitBranch || undefined,
                claude_version: claudeVersion || undefined
              })
            }
          } catch (err) {
            console.error(`[Memory Service] Error processing ${jsonlPath}:`, err)
          }
        }
      }
    }

    return {
      data: {
        success: true,
        agent_id: agentId,
        message: 'Memory initialized' + (body.populateFromSessions ? ' and populated from sessions' : '')
      },
      status: 200
    }
  } catch (error) {
    console.error('[Memory Service] initializeMemory Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

// ===========================================================================
// PUBLIC API — Consolidation (GET/POST/PATCH /api/agents/:id/memory/consolidate)
// ===========================================================================

export async function getConsolidationStatus(agentId: string): Promise<ServiceResult<any>> {
  try {
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    const runsResult = await agentDb.run(`
      ?[run_id, started_at, completed_at, status, conversations_processed,
        memories_created, memories_reinforced, memories_linked, llm_provider, error] :=
        *consolidation_runs{run_id, agent_id, started_at, completed_at, status,
          conversations_processed, memories_created, memories_reinforced, memories_linked,
          llm_provider, error},
        agent_id = '${agentId}'

      :order -started_at
      :limit 20
    `)

    const memoryStats = await agentDb.run(`
      ?[category, count(memory_id)] :=
        *memories{memory_id, agent_id, category},
        agent_id = '${agentId}'
    `)

    const byCategory: Record<string, number> = {}
    for (const row of memoryStats.rows) {
      byCategory[row[0] as string] = row[1] as number
    }

    const subconscious = agent.getSubconscious()
    const consolidationStatus = subconscious?.getStatus().consolidation || null

    return {
      data: {
        success: true,
        agent_id: agentId,
        consolidation: consolidationStatus,
        memory_stats: {
          by_category: byCategory,
          total: Object.values(byCategory).reduce((a, b) => a + b, 0)
        },
        recent_runs: runsResult.rows.map((row: unknown[]) => ({
          run_id: row[0],
          started_at: row[1],
          completed_at: row[2],
          status: row[3],
          conversations_processed: row[4],
          memories_created: row[5],
          memories_reinforced: row[6],
          memories_linked: row[7],
          llm_provider: row[8],
          error: row[9]
        }))
      },
      status: 200
    }
  } catch (error) {
    console.error('[Memory Service] getConsolidationStatus Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function triggerConsolidation(
  agentId: string,
  options: { dryRun?: boolean; provider?: string; maxConversations?: number }
): Promise<ServiceResult<any>> {
  try {
    const dryRun = options.dryRun || false
    const provider = (options.provider || 'auto') as 'ollama' | 'claude' | 'auto'
    const maxConversations = options.maxConversations || 50

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    const conversations = await prepareConversations(
      async () => agentDb,
      maxConversations
    )

    if (conversations.length === 0) {
      return {
        data: {
          success: true,
          status: 'no_data',
          agent_id: agentId,
          message: 'No conversations found to consolidate',
          conversations_processed: 0,
          memories_created: 0,
          memories_reinforced: 0,
          memories_linked: 0
        },
        status: 200
      }
    }

    const result = await consolidateMemories(agentDb, agentId, conversations, {
      dryRun,
      provider,
      maxConversations
    })

    return {
      data: {
        success: result.status !== 'failed',
        ...result
      },
      status: 200
    }
  } catch (error) {
    console.error('[Memory Service] triggerConsolidation Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function manageConsolidation(
  agentId: string,
  body: { action: string; minReinforcements?: number; minAgeDays?: number; retentionDays?: number; dryRun?: boolean }
): Promise<ServiceResult<any>> {
  try {
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    switch (body.action) {
      case 'promote': {
        const result = await promoteMemories(agentDb, agentId, {
          minReinforcements: body.minReinforcements,
          minAgeDays: body.minAgeDays,
          dryRun: body.dryRun
        })
        return {
          data: { success: true, action: 'promote', ...result },
          status: 200
        }
      }

      case 'prune': {
        const result = await pruneShortTermMemory(agentDb, agentId, {
          retentionDays: body.retentionDays,
          dryRun: body.dryRun
        })
        return {
          data: { success: true, action: 'prune', ...result },
          status: 200
        }
      }

      default:
        return {
          error: `Unknown action: ${body.action}`,
          status: 400
        }
    }
  } catch (error) {
    console.error('[Memory Service] manageConsolidation Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

// ===========================================================================
// PUBLIC API — Long-Term Memory (GET/DELETE/PATCH /api/agents/:id/memory/long-term)
// ===========================================================================

export async function queryLongTermMemories(
  agentId: string,
  params: {
    query?: string | null
    category?: MemoryCategory | null
    limit?: number
    includeRelated?: boolean
    minConfidence?: number
    tier?: 'warm' | 'long' | null
    view?: string | null
    memoryId?: string | null
    maxTokens?: number
  }
): Promise<ServiceResult<any>> {
  try {
    const {
      query, category, limit = 20, includeRelated = false,
      minConfidence = 0, tier, view, memoryId, maxTokens = 2000
    } = params

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    if (view === 'stats') {
      const stats = await getStats(agentDb, agentId)
      return { data: { success: true, agent_id: agentId, stats }, status: 200 }
    }

    if (view === 'recent') {
      const memories = await getRecentMemories(agentDb, agentId, limit)
      return { data: { success: true, agent_id: agentId, memories, count: memories.length }, status: 200 }
    }

    if (view === 'reinforced') {
      const memories = await getMostReinforcedMemories(agentDb, agentId, limit)
      return { data: { success: true, agent_id: agentId, memories, count: memories.length }, status: 200 }
    }

    if (view === 'graph') {
      const memoriesResult = await agentDb.run(`
        ?[memory_id, category, tier, content, confidence, reinforcement_count] :=
          *memories{memory_id, agent_id, category, tier, content, confidence, reinforcement_count},
          agent_id = ${escapeForCozo(agentId)}
        :limit ${limit}
      `)

      const linksResult = await agentDb.run(`
        ?[from_memory_id, to_memory_id, relationship] :=
          *memory_links{from_memory_id, to_memory_id, relationship},
          *memories{memory_id: from_memory_id, agent_id},
          agent_id = ${escapeForCozo(agentId)}
      `)

      const nodes = memoriesResult.rows.map((row: unknown[]) => ({
        id: row[0] as string,
        category: row[1] as string,
        tier: row[2] as string,
        content: row[3] as string,
        confidence: row[4] as number,
        reinforcement_count: row[5] as number
      }))

      const links = linksResult.rows.map((row: unknown[]) => ({
        source: row[0] as string,
        target: row[1] as string,
        relationship: row[2] as string
      }))

      return { data: { success: true, agent_id: agentId, graph: { nodes, links }, count: nodes.length }, status: 200 }
    }

    if (view === 'context' && query) {
      const context = await buildMemoryContext(agentDb, agentId, query, {
        maxTokens,
        includeCategories: category ? [category] : undefined
      })
      return { data: { success: true, agent_id: agentId, context, query }, status: 200 }
    }

    if (memoryId) {
      const memory = await getMemoryById(agentDb, memoryId)
      if (!memory) {
        return { error: 'Memory not found', status: 404 }
      }
      return { data: { success: true, agent_id: agentId, memory }, status: 200 }
    }

    if (category && !query) {
      let memories
      switch (category) {
        case 'fact': memories = await getFacts(agentDb, agentId, limit); break
        case 'preference': memories = await getPreferences(agentDb, agentId, limit); break
        case 'pattern': memories = await getPatterns(agentDb, agentId, limit); break
        case 'decision': memories = await getDecisions(agentDb, agentId, limit); break
        case 'insight': memories = await getInsights(agentDb, agentId, limit); break
        default: memories = await getMemoriesByType(agentDb, agentId, category, { limit, includeRelated })
      }
      return { data: { success: true, agent_id: agentId, category, memories, count: memories.length }, status: 200 }
    }

    if (query) {
      const memories = await searchMemories(agentDb, agentId, query, {
        limit,
        includeRelated,
        categories: category ? [category] : undefined,
        minConfidence,
        tier: tier || undefined
      })
      return { data: { success: true, agent_id: agentId, query, memories, count: memories.length }, status: 200 }
    }

    const memories = await getRecentMemories(agentDb, agentId, limit)
    return { data: { success: true, agent_id: agentId, memories, count: memories.length }, status: 200 }
  } catch (error) {
    console.error('[Memory Service] queryLongTermMemories Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function deleteLongTermMemory(agentId: string, memoryId: string): Promise<ServiceResult<any>> {
  try {
    if (!memoryId) {
      return { error: 'Memory ID is required', status: 400 }
    }

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    const memory = await getMemoryById(agentDb, memoryId)
    if (!memory) {
      return { error: 'Memory not found', status: 404 }
    }

    if (memory.agent_id !== agentId) {
      return { error: 'Memory does not belong to this agent', status: 403 }
    }

    await agentDb.run(`?[memory_id] <- [['${memoryId}']] :delete memories`)
    await agentDb.run(`?[memory_id] <- [['${memoryId}']] :delete memory_vec`)
    await agentDb.run(`
      ?[from_memory_id, to_memory_id] :=
        *memory_links{from_memory_id, to_memory_id},
        from_memory_id = '${memoryId}'
      :delete memory_links
    `)
    await agentDb.run(`
      ?[from_memory_id, to_memory_id] :=
        *memory_links{from_memory_id, to_memory_id},
        to_memory_id = '${memoryId}'
      :delete memory_links
    `)

    return { data: { success: true, deleted: memoryId }, status: 200 }
  } catch (error) {
    console.error('[Memory Service] deleteLongTermMemory Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function updateLongTermMemory(
  agentId: string,
  body: { id: string; content?: string; category?: string; context?: string }
): Promise<ServiceResult<any>> {
  try {
    const { id: memoryId, content, category, context } = body

    if (!memoryId) {
      return { error: 'Memory ID is required', status: 400 }
    }

    if (!content && !category && context === undefined) {
      return { error: 'At least one field (content, category, context) must be provided', status: 400 }
    }

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    const memory = await getMemoryById(agentDb, memoryId)
    if (!memory) {
      return { error: 'Memory not found', status: 404 }
    }

    if (memory.agent_id !== agentId) {
      return { error: 'Memory does not belong to this agent', status: 403 }
    }

    const newContent = content || memory.content
    const newCategory = category || memory.category
    const newContext = context !== undefined ? context : memory.context

    await agentDb.run(`
      ?[memory_id, agent_id, tier, system, category, content, context, source_conversations,
        source_message_ids, confidence, created_at, last_reinforced_at, reinforcement_count,
        access_count, last_accessed_at, promoted_at] :=
        *memories{memory_id, agent_id, tier, system, category: _, content: _, context: _,
          source_conversations, source_message_ids, confidence, created_at, last_reinforced_at,
          reinforcement_count, access_count, last_accessed_at, promoted_at},
        memory_id = ${escapeForCozo(memoryId)},
        category = ${escapeForCozo(newCategory)},
        content = ${escapeForCozo(newContent)},
        context = ${newContext ? escapeForCozo(newContext) : 'null'}

      :put memories {
        memory_id, agent_id, tier, system, category, content, context, source_conversations,
        source_message_ids, confidence, created_at, last_reinforced_at, reinforcement_count,
        access_count, last_accessed_at, promoted_at
      }
    `)

    if (content && content !== memory.content) {
      const embeddings = await embedTexts([content])
      const embeddingArray = Array.from(embeddings[0])

      await agentDb.run(`
        ?[memory_id, vec] <- [[${escapeForCozo(memoryId)}, vec(${JSON.stringify(embeddingArray)})]]
        :put memory_vec { memory_id, vec }
      `)
    }

    const updatedMemory = await getMemoryById(agentDb, memoryId)

    return { data: { success: true, memory: updatedMemory }, status: 200 }
  } catch (error) {
    console.error('[Memory Service] updateLongTermMemory Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

// ===========================================================================
// PUBLIC API — Search (GET/POST /api/agents/:id/search)
// ===========================================================================

export async function searchConversations(
  agentId: string,
  params: {
    query: string
    mode?: string
    limit?: number
    minScore?: number
    roleFilter?: 'user' | 'assistant' | 'system' | null
    conversationFile?: string
    startTs?: number
    endTs?: number
    useRrf?: boolean
    bm25Weight?: number
    semanticWeight?: number
  }
): Promise<ServiceResult<any>> {
  try {
    const {
      query, mode = 'hybrid', limit = 10, minScore = 0,
      roleFilter, conversationFile, startTs, endTs,
      useRrf = true, bm25Weight = 0.4, semanticWeight = 0.6
    } = params

    if (!query) {
      return { error: 'Missing required parameter: q (query)', status: 400 }
    }

    if (!['hybrid', 'semantic', 'term', 'symbol'].includes(mode)) {
      return { error: 'Invalid mode. Must be: hybrid, semantic, term, or symbol', status: 400 }
    }

    // Trigger delta indexing before search
    triggerBackgroundDeltaIndexing(agentId).catch((err) => {
      console.error('[Memory Service] Background delta indexing failed:', err)
    })

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    let results: Awaited<ReturnType<typeof hybridSearch>> = []

    if (mode === 'hybrid') {
      results = await hybridSearch(agentDb, query, {
        limit,
        minScore,
        useRrf,
        bm25Weight,
        semanticWeight,
        roleFilter: roleFilter || undefined,
        conversationFile: conversationFile || undefined,
        timeRange: startTs && endTs ? { start: startTs, end: endTs } : undefined
      })
    } else if (mode === 'semantic') {
      results = await semanticSearch(agentDb, query, limit, conversationFile)
    } else if (mode === 'term') {
      results = await searchByTerm(agentDb, query, limit, conversationFile)
    } else if (mode === 'symbol') {
      results = await searchBySymbol(agentDb, query, limit, conversationFile)
    }

    return {
      data: { success: true, agent_id: agentId, query, mode, results, count: results.length },
      status: 200
    }
  } catch (error) {
    console.error('[Memory Service] searchConversations Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function ingestConversations(
  agentId: string,
  body: { conversationFiles: string[]; batchSize?: number }
): Promise<ServiceResult<any>> {
  try {
    const { conversationFiles, batchSize = 10 } = body

    if (!conversationFiles || !Array.isArray(conversationFiles)) {
      return { error: 'Missing or invalid conversationFiles array', status: 400 }
    }

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    const { ingestAllConversations } = await import('@/lib/rag/ingest')

    const stats = await ingestAllConversations(agentDb, conversationFiles, {
      batchSize,
      onProgress: (fileIdx, totalFiles, currentStats) => {
        console.log(`[Memory Service] Progress: ${fileIdx}/${totalFiles} files (${currentStats.processedMessages} messages)`)
      }
    })

    return {
      data: { success: true, agent_id: agentId, stats },
      status: 200
    }
  } catch (error) {
    console.error('[Memory Service] ingestConversations Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

// ===========================================================================
// PUBLIC API — Delta Index (POST /api/agents/:id/index-delta)
// ===========================================================================

export async function runDeltaIndex(
  agentId: string,
  options: { dryRun?: boolean; batchSize?: number }
): Promise<ServiceResult<any>> {
  const dryRun = options.dryRun || false
  const batchSize = options.batchSize || 10

  const result = await runIndexDelta(agentId, { dryRun, batchSize })

  return {
    data: result,
    status: result.success ? 200 : 500
  }
}

// ===========================================================================
// PUBLIC API — Tracking (GET/POST /api/agents/:id/tracking)
// ===========================================================================

export async function getTracking(agentId: string): Promise<ServiceResult<any>> {
  try {
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    const context = await getAgentFullContext(agentDb, agentId)
    const history = await getAgentWorkHistory(agentDb, agentId)

    return {
      data: { success: true, agent_id: agentId, context, history },
      status: 200
    }
  } catch (error) {
    console.error('[Memory Service] getTracking Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

export async function initializeTracking(
  agentId: string,
  body: { addSampleData?: boolean }
): Promise<ServiceResult<any>> {
  try {
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    await initializeTrackingSchema(agentDb)

    if (body.addSampleData) {
      await upsertAgent(agentDb, {
        agent_id: agentId,
        name: agentId,
        type: 'local',
        model: 'sonnet'
      })

      await createTrackingSession(agentDb, {
        session_id: `${agentId}-session-1`,
        agent_id: agentId,
        session_name: agentId,
        project_path: `/Users/juanpelaez/projects/example-project`,
        log_file: `~/.aimaestro/agents/${agentId}/logs/session-1.log`
      })

      const projectId = 'example-project-id'
      await upsertProject(agentDb, {
        project_id: projectId,
        agent_id: agentId,
        project_path: '/Users/juanpelaez/projects/example-project',
        project_name: 'example-project'
      })

      await createClaudeSession(agentDb, {
        claude_session_id: 'claude-session-1',
        agent_id: agentId,
        project_id: projectId,
        ai_maestro_session_id: `${agentId}-session-1`,
        jsonl_file: '~/.claude/projects/example-project/8ae3f2.jsonl',
        session_type: 'main'
      })

      await createClaudeSession(agentDb, {
        claude_session_id: 'claude-session-2',
        agent_id: agentId,
        project_id: projectId,
        ai_maestro_session_id: `${agentId}-session-1`,
        jsonl_file: '~/.claude/projects/example-project/7bc2a1.jsonl',
        session_type: 'sidechain'
      })
    }

    return {
      data: {
        success: true,
        agent_id: agentId,
        message: 'Tracking schema initialized' + (body.addSampleData ? ' with sample data' : '')
      },
      status: 200
    }
  } catch (error) {
    console.error('[Memory Service] initializeTracking Error:', error)
    return {
      error: error instanceof Error ? error.message : 'Unknown error',
      status: 500
    }
  }
}

// ===========================================================================
// PUBLIC API — Metrics (GET/PATCH /api/agents/:id/metrics)
// ===========================================================================

export function getMetrics(agentId: string): ServiceResult<any> {
  try {
    const agent = getAgentFromFileRegistry(agentId)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }
    return { data: { metrics: agent.metrics || {} }, status: 200 }
  } catch (error) {
    console.error('Failed to get agent metrics:', error)
    return { error: 'Failed to get agent metrics', status: 500 }
  }
}

export function updateMetrics(
  agentId: string,
  body: { action?: string; metric?: string; amount?: number; [key: string]: any }
): ServiceResult<any> {
  try {
    const { action, metric, amount, ...metrics } = body

    if (action === 'increment' && metric) {
      const success = incrementAgentMetric(agentId, metric as any, amount || 1)
      if (!success) {
        return { error: 'Agent not found', status: 404 }
      }
      const agent = getAgentFromFileRegistry(agentId)
      return { data: { metrics: agent?.metrics }, status: 200 }
    }

    const agent = updateAgentMetrics(agentId, metrics as UpdateAgentMetricsRequest)
    if (!agent) {
      return { error: 'Agent not found', status: 404 }
    }

    return { data: { metrics: agent.metrics }, status: 200 }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update metrics'
    console.error('Failed to update agent metrics:', error)
    return { error: message, status: 400 }
  }
}
