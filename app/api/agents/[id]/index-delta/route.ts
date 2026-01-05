import { NextRequest, NextResponse } from 'next/server'
import { agentRegistry } from '@/lib/agent'
import { AgentDatabase } from '@/lib/cozo-db'
import { getConversations, recordConversation, recordProject, getProjects, getSessions } from '@/lib/cozo-schema-simple'
import { indexConversationDelta } from '@/lib/rag/ingest'
import { getAgent as getRegistryAgent, getAgentBySession, updateAgentWorkingDirectory } from '@/lib/agent-registry'
import { computeSessionName } from '@/types/agent'
import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'
import { exec } from 'child_process'
import { promisify } from 'util'

const execAsync = promisify(exec)

// ============================================================================
// THROTTLING: Limit concurrent Delta Index operations to prevent CPU overload
// ============================================================================
const MAX_CONCURRENT_INDEX = 1  // Maximum simultaneous indexing operations (reduced to prevent CPU overload)
let activeIndexCount = 0
const indexQueue: Array<{
  resolve: () => void
  agentId: string
  timestamp: number
}> = []

/**
 * Acquire a slot for indexing. Returns a release function.
 * If at capacity, waits in queue until a slot is available.
 */
async function acquireIndexSlot(agentId: string): Promise<() => void> {
  if (activeIndexCount < MAX_CONCURRENT_INDEX) {
    activeIndexCount++
    console.log(`[Delta Index Throttle] Acquired slot for ${agentId.substring(0, 8)} (${activeIndexCount}/${MAX_CONCURRENT_INDEX} active)`)
    return () => releaseIndexSlot(agentId)
  }

  // Wait in queue
  console.log(`[Delta Index Throttle] ${agentId.substring(0, 8)} queued (${indexQueue.length + 1} waiting)`)

  return new Promise((resolve) => {
    indexQueue.push({
      resolve: () => {
        activeIndexCount++
        console.log(`[Delta Index Throttle] Acquired slot for ${agentId.substring(0, 8)} from queue (${activeIndexCount}/${MAX_CONCURRENT_INDEX} active)`)
        resolve(() => releaseIndexSlot(agentId))
      },
      agentId,
      timestamp: Date.now()
    })
  })
}

/**
 * Release an indexing slot and process next in queue
 */
function releaseIndexSlot(agentId: string) {
  activeIndexCount--
  console.log(`[Delta Index Throttle] Released slot for ${agentId.substring(0, 8)} (${activeIndexCount}/${MAX_CONCURRENT_INDEX} active, ${indexQueue.length} queued)`)

  // Process next in queue
  if (indexQueue.length > 0) {
    const next = indexQueue.shift()!
    const waitTime = Date.now() - next.timestamp
    console.log(`[Delta Index Throttle] Processing queued ${next.agentId.substring(0, 8)} (waited ${waitTime}ms)`)
    next.resolve()
  }
}

/**
 * Get the live working directory from tmux for an agent's session
 */
async function getLiveTmuxWorkingDirectory(sessionName: string): Promise<string | null> {
  try {
    const { stdout } = await execAsync(
      `tmux display-message -t "${sessionName}" -p "#{pane_current_path}" 2>/dev/null || echo ""`
    )
    const pwd = stdout.trim()
    return pwd || null
  } catch {
    return null
  }
}

/**
 * Auto-discover projects from Claude's projects directory
 * This is called when no projects are registered for an agent
 * @param agentDb - The agent's CozoDB database instance
 * @param agentId - The agent ID to find projects for
 * @param workingDirectories - Set of known working directories for this agent
 */
async function autoDiscoverProjects(
  agentDb: AgentDatabase,
  agentId: string,
  workingDirectories: Set<string>
): Promise<number> {
  console.log(`[Delta Index API] Auto-discovering projects for agent ${agentId}...`)
  console.log(`[Delta Index API] Known working directories: ${Array.from(workingDirectories).join(', ') || 'none'}`)

  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(claudeProjectsDir)) {
    console.log(`[Delta Index API] Claude projects directory not found: ${claudeProjectsDir}`)
    return 0
  }

  // Get agent's registered sessions to find matching conversations
  const agentSessionIds = new Set<string>()
  try {
    const sessionsResult = await getSessions(agentDb, agentId)
    for (const row of sessionsResult.rows) {
      agentSessionIds.add(row[0] as string)
    }
  } catch {
    // Sessions table might not exist
  }

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
        } catch {
          // Skip files we can't read
        }
      }
    } catch {
      // Skip directories we can't read
    }
    return files
  }

  const allJsonlFiles = findJsonlFiles(claudeProjectsDir)
  console.log(`[Delta Index API] Found ${allJsonlFiles.length} total conversation files in Claude projects`)

  const discoveredProjects = new Map<string, { projectName: string; claudeDir: string }>()
  let matchedConversations = 0

  for (const jsonlPath of allJsonlFiles) {
    try {
      const fileContent = fs.readFileSync(jsonlPath, 'utf-8')
      const firstLines = fileContent.split('\n').slice(0, 20)

      let sessionId: string | null = null
      let cwd: string | null = null

      for (const line of firstLines) {
        if (!line.trim()) continue
        try {
          const message = JSON.parse(line)
          if (message.sessionId && !sessionId) sessionId = message.sessionId
          if (message.cwd && !cwd) cwd = message.cwd
        } catch {
          // Skip malformed lines
        }
      }

      // Check if this conversation belongs to this agent
      // Match by: 1) session ID, 2) working directory match, 3) agentId in path
      const belongsToAgent =
        (sessionId && agentSessionIds.has(sessionId)) ||
        (cwd && workingDirectories.has(cwd)) ||
        jsonlPath.includes(agentId) ||
        (cwd && cwd.includes(agentId))

      if (belongsToAgent && cwd) {
        matchedConversations++
        if (!discoveredProjects.has(cwd)) {
          const projectName = cwd.split('/').pop() || 'unknown'
          const claudeDir = path.dirname(jsonlPath)
          discoveredProjects.set(cwd, { projectName, claudeDir })
          console.log(`[Delta Index API] 🆕 Auto-discovered project: ${projectName} (${cwd})`)
        }
      }
    } catch {
      // Skip files we can't process
    }
  }

  // Register discovered projects
  for (const [projectPath, { projectName, claudeDir }] of discoveredProjects) {
    try {
      await recordProject(agentDb, {
        project_path: projectPath,
        project_name: projectName,
        claude_dir: claudeDir
      })
    } catch (err) {
      console.error(`[Delta Index API] Failed to record project ${projectName}:`, err)
    }
  }

  console.log(`[Delta Index API] Auto-discovered ${discoveredProjects.size} project(s) from ${matchedConversations} conversation(s)`)
  return discoveredProjects.size
}

/**
 * Extract metadata from a conversation file
 */
function extractConversationMetadata(jsonlPath: string, projectPath: string): {
  sessionId: string | null
  cwd: string | null
  firstUserMessage: string | null
  gitBranch: string | null
  claudeVersion: string | null
  firstMessageAt: number | null
  lastMessageAt: number | null
  modelNames: string
  messageCount: number
} {
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

  // Process first 50 lines for metadata
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
        const content = message.message.content
        // Sanitize: take first 100 chars, strip newlines/carriage returns to avoid CozoDB parser issues
        firstUserMessage = content.substring(0, 100).replace(/[\n\r]/g, ' ').trim()
      }
      if (message.type === 'assistant' && message.message?.model) {
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

  return {
    sessionId,
    cwd: cwd || projectPath,
    firstUserMessage,
    gitBranch,
    claudeVersion,
    firstMessageAt,
    lastMessageAt,
    modelNames: Array.from(modelSet).join(', '),
    messageCount: allLines.length
  }
}

/**
 * POST /api/agents/:id/index-delta
 * Index new messages (delta) for all conversations of an agent
 *
 * This endpoint:
 * 1. DISCOVERS new conversation files in the agent's project directories
 * 2. Records any new conversations found
 * 3. Indexes only the new messages since the last index
 *
 * Query parameters:
 * - dryRun: If true, only report what would be indexed without actually indexing (default: false)
 * - batchSize: Batch size for processing (default: 10)
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: agentId } = await params

  // Acquire throttle slot (waits if at capacity)
  const releaseSlot = await acquireIndexSlot(agentId)

  try {
    const searchParams = request.nextUrl.searchParams

    const dryRun = searchParams.get('dryRun') === 'true'
    const batchSize = parseInt(searchParams.get('batchSize') || '10')

    console.log(`[Delta Index API] Processing agent ${agentId} (dryRun: ${dryRun})`)

    // Get or create agent (will initialize with subconscious if first time)
    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // SYNC WORKING DIRECTORY: Always check live tmux pwd and sync if different
    // This ensures the agent's workingDirectory stays current even if user navigates
    let liveTmuxWd: string | null = null
    let registryAgent = getRegistryAgent(agentId) || getAgentBySession(agentId)
    if (registryAgent) {
      const agentName = registryAgent.name || registryAgent.alias
      const sessionName = agentName ? computeSessionName(agentName, 0) : undefined
      const storedWd = registryAgent.workingDirectory ||
                       registryAgent.sessions?.[0]?.workingDirectory
      if (sessionName) {
        liveTmuxWd = await getLiveTmuxWorkingDirectory(sessionName)
        if (liveTmuxWd && storedWd && liveTmuxWd !== storedWd) {
          console.log(`[Delta Index API] ⚡ Syncing workingDirectory:`)
          console.log(`[Delta Index API]   Stored: ${storedWd}`)
          console.log(`[Delta Index API]   Live:   ${liveTmuxWd}`)
          updateAgentWorkingDirectory(agentId, liveTmuxWd)
          // Re-fetch agent to get updated data
          registryAgent = getRegistryAgent(agentId) || getAgentBySession(agentId)
        }
      }
    }

    // Get all projects for this agent (with claude_dir info)
    // Handle case where projects table doesn't exist yet (schema not initialized)
    let projectsResult
    try {
      projectsResult = await getProjects(agentDb)
    } catch (error: any) {
      if (error.code === 'query::relation_not_found' || error.message?.includes('relation_not_found')) {
        console.log(`[Delta Index API] Schema not initialized for agent ${agentId} - skipping (will retry later)`)
        releaseSlot()
        return NextResponse.json({
          success: true,
          agent_id: agentId,
          message: 'Schema not initialized yet - will retry on next cycle',
          new_conversations_discovered: 0,
          conversations_indexed: 0,
          total_messages_processed: 0,
        })
      }
      throw error
    }

    // AUTO-DISCOVER: If no projects registered, try to find them from Claude's directory
    if (projectsResult.rows.length === 0) {
      console.log(`[Delta Index API] No projects registered for agent ${agentId} - attempting auto-discovery`)

      // Get agent's known working directories
      // Use live tmux pwd (already fetched above) as PRIMARY source
      const workingDirectories = new Set<string>()

      if (registryAgent) {
        // Use live tmux pwd if available (already computed above)
        if (liveTmuxWd) {
          workingDirectories.add(liveTmuxWd)
          console.log(`[Delta Index API] Using LIVE workingDirectory: ${liveTmuxWd}`)
        }

        // Also add stored workingDirectory as fallback
        const storedWd = registryAgent.workingDirectory ||
                         registryAgent.sessions?.[0]?.workingDirectory
        if (storedWd && !workingDirectories.has(storedWd)) {
          workingDirectories.add(storedWd)
          console.log(`[Delta Index API] Also checking stored workingDirectory: ${storedWd}`)
        }

        // Also check preferences as fallback
        const preferenceWd = registryAgent.preferences?.defaultWorkingDirectory
        if (preferenceWd && !workingDirectories.has(preferenceWd)) {
          workingDirectories.add(preferenceWd)
          console.log(`[Delta Index API] Also checking preferences workingDirectory: ${preferenceWd}`)
        }
      } else {
        console.log(`[Delta Index API] Agent ${agentId} not found in registry - will rely on session/path matching`)
      }

      const autoDiscoveredCount = await autoDiscoverProjects(agentDb, agentId, workingDirectories)

      if (autoDiscoveredCount > 0) {
        // Re-fetch projects after auto-discovery
        projectsResult = await getProjects(agentDb)
        console.log(`[Delta Index API] ✓ Auto-discovered ${autoDiscoveredCount} project(s), now have ${projectsResult.rows.length} total`)
      } else {
        console.log(`[Delta Index API] No projects could be auto-discovered for agent ${agentId}`)
        releaseSlot()
        return NextResponse.json({
          success: true,
          agent_id: agentId,
          message: 'No projects found for this agent - conversations will be discovered when sessions are created',
          new_conversations_discovered: 0,
          conversations_indexed: 0,
          total_messages_processed: 0,
        })
      }
    }

    // Phase 1: DISCOVER new conversation files in each project's claude_dir
    let newConversationsDiscovered = 0

    for (const projectRow of projectsResult.rows) {
      const projectPath = projectRow[0] as string
      const projectName = projectRow[1] as string
      const claudeDir = projectRow[2] as string

      if (!claudeDir || !fs.existsSync(claudeDir)) {
        console.log(`[Delta Index API] Skipping project ${projectName}: claude_dir not found (${claudeDir})`)
        continue
      }

      // Get existing conversation files from database for this project
      const existingConvosResult = await getConversations(agentDb, projectPath)
      const existingFiles = new Set(existingConvosResult.rows.map((row: unknown[]) => row[0] as string))

      // Scan claude_dir for .jsonl files
      try {
        const files = fs.readdirSync(claudeDir)
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))

        for (const jsonlFile of jsonlFiles) {
          const fullPath = path.join(claudeDir, jsonlFile)

          // Skip if already known
          if (existingFiles.has(fullPath)) {
            continue
          }

          // NEW conversation file found!
          console.log(`[Delta Index API] 🆕 Discovered new conversation: ${jsonlFile}`)

          try {
            // Extract metadata from the file
            const metadata = extractConversationMetadata(fullPath, projectPath)

            // Record in database
            await recordConversation(agentDb, {
              jsonl_file: fullPath,
              project_path: projectPath,
              session_id: metadata.sessionId || 'unknown',
              message_count: metadata.messageCount,
              first_message_at: metadata.firstMessageAt || undefined,
              last_message_at: metadata.lastMessageAt || undefined,
              first_user_message: metadata.firstUserMessage || undefined,
              model_names: metadata.modelNames || undefined,
              git_branch: metadata.gitBranch || undefined,
              claude_version: metadata.claudeVersion || undefined,
              last_indexed_at: 0,  // Not indexed yet
              last_indexed_message_count: 0  // Not indexed yet
            })

            newConversationsDiscovered++
            console.log(`[Delta Index API] ✓ Recorded new conversation: ${jsonlFile} (${metadata.messageCount} messages)`)
          } catch (err) {
            console.error(`[Delta Index API] Failed to process new conversation ${jsonlFile}:`, err)
          }
        }
      } catch (err) {
        console.error(`[Delta Index API] Error scanning claude_dir ${claudeDir}:`, err)
      }
    }

    if (newConversationsDiscovered > 0) {
      console.log(`[Delta Index API] 📁 Discovered ${newConversationsDiscovered} new conversation file(s)`)
    }

    // Phase 2: Get ALL conversations (including newly discovered ones)
    const conversations: Array<{
      jsonl_file: string
      message_count: number
      last_indexed_message_count: number
      project_path: string
    }> = []

    for (const projectRow of projectsResult.rows) {
      const projectPath = projectRow[0] as string
      const convosResult = await getConversations(agentDb, projectPath)

      for (const convoRow of convosResult.rows) {
        const jsonlFile = convoRow[0] as string
        const messageCount = convoRow[4] as number
        const lastIndexedMessageCount = (convoRow[10] as number) || 0

        conversations.push({
          jsonl_file: jsonlFile,
          message_count: messageCount,
          last_indexed_message_count: lastIndexedMessageCount,
          project_path: projectPath,
        })
      }
    }

    console.log(`[Delta Index API] Found ${conversations.length} total conversations (${newConversationsDiscovered} newly discovered)`)

    // Filter conversations that need indexing
    const conversationsNeedingIndex = conversations.filter(
      (conv) => {
        // Check if file exists and has new messages
        if (!fs.existsSync(conv.jsonl_file)) {
          console.log(`[Delta Index API] File not found: ${conv.jsonl_file}`)
          return false
        }

        const fileContent = fs.readFileSync(conv.jsonl_file, 'utf-8')
        const currentLineCount = fileContent.split('\n').filter(line => line.trim()).length

        const delta = currentLineCount - conv.last_indexed_message_count
        return delta > 0
      }
    )

    console.log(`[Delta Index API] ${conversationsNeedingIndex.length} conversations need indexing`)

    if (dryRun) {
      // Dry run - just report what would be indexed
      const report = conversationsNeedingIndex.map((conv) => {
        const fileContent = fs.readFileSync(conv.jsonl_file, 'utf-8')
        const currentLineCount = fileContent.split('\n').filter(line => line.trim()).length
        const delta = currentLineCount - conv.last_indexed_message_count

        return {
          file: conv.jsonl_file,
          last_indexed: conv.last_indexed_message_count,
          current_messages: currentLineCount,
          delta_to_index: delta,
        }
      })

      // NOTE: Don't close agentDb - it's owned by the agent and stays open

      releaseSlot()
      return NextResponse.json({
        success: true,
        dry_run: true,
        agent_id: agentId,
        new_conversations_discovered: newConversationsDiscovered,
        conversations_needing_index: conversationsNeedingIndex.length,
        report,
      })
    }

    // Actually index the deltas
    const results: Array<{
      file: string
      delta: number
      processed: number
      duration_ms: number
    }> = []

    let totalProcessed = 0
    let totalDuration = 0

    for (const conv of conversationsNeedingIndex) {
      console.log(`\n[Delta Index API] Processing: ${conv.jsonl_file}`)

      const fileContent = fs.readFileSync(conv.jsonl_file, 'utf-8')
      const currentLineCount = fileContent.split('\n').filter(line => line.trim()).length
      const delta = currentLineCount - conv.last_indexed_message_count

      const stats = await indexConversationDelta(
        agentDb,
        conv.jsonl_file,
        conv.last_indexed_message_count,
        { batchSize }
      )

      // Update conversation record with new indexed count
      await recordConversation(agentDb, {
        jsonl_file: conv.jsonl_file,
        project_path: conv.project_path,
        message_count: currentLineCount,
        last_indexed_at: Date.now(),
        last_indexed_message_count: currentLineCount,
      })

      results.push({
        file: conv.jsonl_file,
        delta,
        processed: stats.processedMessages,
        duration_ms: stats.durationMs,
      })

      totalProcessed += stats.processedMessages
      totalDuration += stats.durationMs
    }

    // NOTE: Don't close agentDb - it's owned by the agent and stays open

    console.log(`\n[Delta Index API] ✅ Complete: ${totalProcessed} messages in ${totalDuration}ms`)

    // Release throttle slot
    releaseSlot()

    return NextResponse.json({
      success: true,
      agent_id: agentId,
      new_conversations_discovered: newConversationsDiscovered,
      conversations_indexed: conversationsNeedingIndex.length,
      total_messages_processed: totalProcessed,
      total_duration_ms: totalDuration,
      results,
    })
  } catch (error) {
    // Release throttle slot on error
    releaseSlot()

    console.error('[Delta Index API] Error:', error)
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
