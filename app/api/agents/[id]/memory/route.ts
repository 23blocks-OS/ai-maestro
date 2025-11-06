import { NextRequest, NextResponse } from 'next/server'
import { createAgentDatabase } from '@/lib/cozo-db'
import {
  initializeSimpleSchema,
  recordSession,
  recordProject,
  recordConversation,
  getSessions,
  getProjects,
  getConversations
} from '@/lib/cozo-schema-simple'
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

    const agentDb = await createAgentDatabase({ agentId })

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

    await agentDb.close()

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

    const agentDb = await createAgentDatabase({ agentId })

    // Initialize schema
    await initializeSimpleSchema(agentDb)

    // If requested, populate from current tmux sessions AND historical conversations
    if (body.populateFromSessions) {
      console.log('[Memory API] Populating from tmux sessions and historical conversations...')

      // Fetch current sessions
      const sessionsResponse = await fetch('http://localhost:23000/api/sessions')
      const sessionsData = await sessionsResponse.json()

      // Track which sessions belong to this agent
      const agentSessionIds = new Set<string>()
      const projectPaths = new Set<string>()

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
            // Read first 20 lines to extract metadata (sessionId, cwd)
            const fileContent = fs.readFileSync(jsonlPath, 'utf-8')
            const lines = fileContent.split('\n').slice(0, 20)

            // Parse first few messages to extract metadata
            let sessionId: string | null = null
            let cwd: string | null = null

            for (const line of lines) {
              if (!line.trim()) continue
              try {
                const message = JSON.parse(line)
                if (message.sessionId) sessionId = message.sessionId
                if (message.cwd) cwd = message.cwd
                if (sessionId && cwd) break
              } catch (parseErr) {
                // Skip malformed lines
              }
            }

            // Check if this conversation belongs to this agent's sessions OR projects
            const belongsToAgent =
              (sessionId && agentSessionIds.has(sessionId)) ||
              (cwd && projectPaths.has(cwd))

            if (belongsToAgent && cwd) {
              // Count total messages in the file
              let messageCount = 0
              try {
                const content = fs.readFileSync(jsonlPath, 'utf-8')
                messageCount = content.split('\n').filter(line => line.trim()).length
              } catch (err) {
                console.error(`[Memory API] Error counting messages in ${jsonlPath}:`, err)
              }

              // Extract project info
              const projectName = cwd.split('/').pop() || 'unknown'
              const encodedPath = cwd.replace(/\//g, '-')
              const conversationsDir = path.dirname(jsonlPath)

              // Record project
              await recordProject(agentDb, {
                project_path: cwd,
                project_name: projectName,
                claude_dir: conversationsDir
              })

              // Record conversation
              await recordConversation(agentDb, {
                jsonl_file: jsonlPath,
                project_path: cwd,
                session_id: sessionId || 'unknown',
                message_count: messageCount
              })

              console.log(`[Memory API] ✓ Recorded conversation: ${path.basename(jsonlPath)} (${messageCount} messages, project: ${projectName})`)
            }
          } catch (err) {
            console.error(`[Memory API] Error processing ${jsonlPath}:`, err)
          }
        }
      }

      console.log('[Memory API] ✅ Populated from sessions and historical conversations')
    }

    await agentDb.close()

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
