import { NextRequest, NextResponse } from 'next/server'
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
import { getAgent as getRegistryAgent, getAgentBySession } from '@/lib/agent-registry'
import * as fs from 'fs'
import * as path from 'path'

/**
 * GET /api/agents/:id/memory
 * Get agent's memory (sessions and projects)
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Get sessions and projects
    const sessions = await getSessions(agentDb, agentId)
    const projects = await getProjects(agentDb)

    // Get conversations for each project
    const projectsWithConversations = []
    for (const project of (projects.rows || [])) {
      const projectPath = project[0] // First column is project_path
      const conversations = await getConversations(agentDb, projectPath)
      projectsWithConversations.push({
        project: project,
        conversations: conversations.rows || []
      })
    }

    // NOTE: Agent's subconscious now handles background indexing automatically
    // No need to manually trigger - each agent maintains its own memory

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      sessions: sessions.rows || [],
      projects: projectsWithConversations
    })
  } catch (error) {
    console.error('[Memory API] GET Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}

/**
 * Trigger delta indexing in the background (non-blocking)
 */
async function triggerBackgroundDeltaIndexing(agentId: string): Promise<void> {
  console.log(`[Memory API] Triggering background delta indexing for agent ${agentId}`)

  try {
    // Call the delta indexing endpoint
    const response = await fetch(`http://localhost:23000/api/agents/${agentId}/index-delta`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    })

    if (!response.ok) {
      console.error(`[Memory API] Delta indexing returned status ${response.status}`)
      return
    }

    const result = await response.json()
    if (result.success && result.total_messages_processed > 0) {
      console.log(`[Memory API] ✅ Delta indexed ${result.total_messages_processed} messages`)
    } else {
      console.log(`[Memory API] No new messages to index`)
    }
  } catch (error) {
    console.error('[Memory API] Failed to trigger delta indexing:', error)
  }
}

/**
 * POST /api/agents/:id/memory
 * Initialize schema and optionally populate from current tmux sessions
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: agentId } = await params
    const body = await request.json().catch(() => ({}))

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // Initialize schema (simple + RAG extensions)
    await initializeSimpleSchema(agentDb)
    await initializeRagSchema(agentDb)

    // If requested, populate from current tmux sessions AND historical conversations
    if (body.populateFromSessions) {
      // Check if database is already populated to avoid expensive rescanning
      // Unless force=true is specified
      if (!body.force) {
        const existingProjects = await getProjects(agentDb)
        if (existingProjects.rows && existingProjects.rows.length > 0) {
          console.log(`[Memory API] Database already populated with ${existingProjects.rows.length} projects. Skipping population scan. Use force=true to re-populate.`)
          // NOTE: Don't close agentDb - it's owned by the agent and stays open
          return NextResponse.json({
            success: true,
            agent_id: agentId,
            message: 'Memory schema initialized (already populated)',
            skipped_population: true
          })
        }
      } else {
        console.log(`[Memory API] Force flag set - re-populating database`)
      }

      console.log('[Memory API] Populating from tmux sessions and historical conversations...')

      // Fetch current sessions
      const sessionsResponse = await fetch('http://localhost:23000/api/sessions')
      const sessionsData = await sessionsResponse.json()

      // Track which sessions belong to this agent
      const agentSessionIds = new Set<string>()
      const projectPaths = new Set<string>()

      // IMPORTANT: Get agent's stored workingDirectory from the file-based registry
      // This ensures we match conversations even when no active session exists
      const registryAgent = getRegistryAgent(agentId) || getAgentBySession(agentId)
      if (registryAgent) {
        const sessionWd = registryAgent.tools?.session?.workingDirectory
        const preferenceWd = registryAgent.preferences?.defaultWorkingDirectory
        if (sessionWd) {
          projectPaths.add(sessionWd)
          console.log(`[Memory API] Added workingDirectory from registry session: ${sessionWd}`)
        }
        if (preferenceWd && preferenceWd !== sessionWd) {
          projectPaths.add(preferenceWd)
          console.log(`[Memory API] Added workingDirectory from registry preferences: ${preferenceWd}`)
        }
      }

      // Record sessions that belong to this agent
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

      console.log(`[Memory API] Found ${agentSessionIds.size} active sessions for agent ${agentId}`)

      // NOW: Scan ALL conversation files in ~/.claude/projects/ to find historical conversations
      const claudeProjectsDir = path.join(require('os').homedir(), '.claude', 'projects')

      if (fs.existsSync(claudeProjectsDir)) {
        console.log(`[Memory API] Scanning ${claudeProjectsDir} for all historical conversations...`)

        // Recursively find all .jsonl files
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
              } catch (err) {
                // Skip files we can't read
              }
            }
          } catch (err) {
            console.error(`[Memory API] Error reading directory ${dir}:`, err)
          }
          return files
        }

        const allJsonlFiles = findJsonlFiles(claudeProjectsDir)
        console.log(`[Memory API] Found ${allJsonlFiles.length} total conversation files`)

        // Process each conversation file
        for (const jsonlPath of allJsonlFiles) {
          try {
            // Read file content
            const fileContent = fs.readFileSync(jsonlPath, 'utf-8')
            const allLines = fileContent.split('\n').filter(line => line.trim())

            // Parse ALL messages to extract comprehensive metadata
            let sessionId: string | null = null
            let cwd: string | null = null
            let firstUserMessage: string | null = null
            let gitBranch: string | null = null
            let claudeVersion: string | null = null
            let firstMessageAt: number | null = null
            let lastMessageAt: number | null = null
            const modelSet = new Set<string>()

            // Process first 50 lines for metadata (more thorough)
            const metadataLines = allLines.slice(0, 50)
            for (const line of metadataLines) {
              try {
                const message = JSON.parse(line)

                // Extract basic metadata
                if (message.sessionId && !sessionId) sessionId = message.sessionId
                if (message.cwd && !cwd) cwd = message.cwd
                if (message.gitBranch && !gitBranch) gitBranch = message.gitBranch
                if (message.version && !claudeVersion) claudeVersion = message.version

                // Extract timestamps
                if (message.timestamp) {
                  const ts = new Date(message.timestamp).getTime()
                  if (!firstMessageAt || ts < firstMessageAt) firstMessageAt = ts
                }

                // Extract first user message content
                if (message.type === 'user' && message.message?.content && !firstUserMessage) {
                  const content = message.message.content
                  // Truncate to first 100 chars
                  firstUserMessage = content.substring(0, 100)
                }

                // Extract model names from assistant messages
                if (message.type === 'assistant' && message.message?.model) {
                  // Simplify model name (e.g., "claude-sonnet-4-5-20250929" -> "Sonnet 4.5")
                  const model = message.message.model
                  if (model.includes('sonnet')) modelSet.add('Sonnet 4.5')
                  else if (model.includes('haiku')) modelSet.add('Haiku 4.5')
                  else if (model.includes('opus')) modelSet.add('Opus 4.5')
                }
              } catch (parseErr) {
                // Skip malformed lines
              }
            }

            // Extract last message timestamp from end of file
            for (let i = allLines.length - 1; i >= Math.max(0, allLines.length - 20); i--) {
              try {
                const message = JSON.parse(allLines[i])
                if (message.timestamp) {
                  lastMessageAt = new Date(message.timestamp).getTime()
                  break
                }
              } catch (parseErr) {
                // Skip
              }
            }

            // Check if this conversation belongs to this agent's sessions OR projects
            const belongsToAgent =
              (sessionId && agentSessionIds.has(sessionId)) ||
              (cwd && projectPaths.has(cwd))

            if (belongsToAgent && cwd) {
              const messageCount = allLines.length
              const modelNames = Array.from(modelSet).join(', ')

              // Extract project info
              const projectName = cwd.split('/').pop() || 'unknown'
              const conversationsDir = path.dirname(jsonlPath)

              // Record project
              await recordProject(agentDb, {
                project_path: cwd,
                project_name: projectName,
                claude_dir: conversationsDir
              })

              // Record conversation with rich metadata
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

              console.log(`[Memory API] ✓ Recorded conversation: ${path.basename(jsonlPath)} (${messageCount} messages, ${modelNames || 'unknown models'}, project: ${projectName})`)
            }
          } catch (err) {
            console.error(`[Memory API] Error processing ${jsonlPath}:`, err)
          }
        }
      }

      console.log('[Memory API] ✅ Populated from sessions and historical conversations')
    }

    // NOTE: Agent's subconscious is already running and will maintain memory automatically

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      message: 'Memory initialized' + (body.populateFromSessions ? ' and populated from sessions' : '')
    })
  } catch (error) {
    console.error('[Memory API] POST Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      },
      { status: 500 }
    )
  }
}
