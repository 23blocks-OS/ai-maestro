/**
 * Delta Indexing Engine
 *
 * Core logic for discovering and indexing new conversation messages.
 * Extracted from the API route to be callable directly (no HTTP overhead).
 *
 * Performance optimizations:
 * - fs.statSync().size for delta detection (no file reads for unchanged files)
 * - Global project discovery cache (scan once, share across agents)
 * - Single file read per conversation (no triple reads)
 * - Throttled to MAX_CONCURRENT_INDEX=1 to prevent CPU overload
 */

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
const MAX_CONCURRENT_INDEX = 1
let activeIndexCount = 0
const indexQueue: Array<{
  resolve: () => void
  agentId: string
  timestamp: number
}> = []

async function acquireIndexSlot(agentId: string): Promise<() => void> {
  if (activeIndexCount < MAX_CONCURRENT_INDEX) {
    activeIndexCount++
    console.log(`[Delta Index Throttle] Acquired slot for ${agentId.substring(0, 8)} (${activeIndexCount}/${MAX_CONCURRENT_INDEX} active)`)
    return () => releaseIndexSlot(agentId)
  }

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

function releaseIndexSlot(agentId: string) {
  activeIndexCount--
  console.log(`[Delta Index Throttle] Released slot for ${agentId.substring(0, 8)} (${activeIndexCount}/${MAX_CONCURRENT_INDEX} active, ${indexQueue.length} queued)`)

  if (indexQueue.length > 0) {
    const next = indexQueue.shift()!
    const waitTime = Date.now() - next.timestamp
    console.log(`[Delta Index Throttle] Processing queued ${next.agentId.substring(0, 8)} (waited ${waitTime}ms)`)
    next.resolve()
  }
}

// ============================================================================
// FILE SIZE CACHE: Track file sizes to avoid reading unchanged files
// ============================================================================
const fileSizeCache = new Map<string, number>()

function hasFileChanged(filePath: string): boolean {
  try {
    const currentSize = fs.statSync(filePath).size
    const cachedSize = fileSizeCache.get(filePath)
    if (cachedSize !== undefined && cachedSize === currentSize) {
      return false
    }
    fileSizeCache.set(filePath, currentSize)
    return true
  } catch {
    return false
  }
}

function updateFileSizeCache(filePath: string) {
  try {
    fileSizeCache.set(filePath, fs.statSync(filePath).size)
  } catch {
    // ignore
  }
}

// ============================================================================
// PROJECT DISCOVERY CACHE: Scan ~/.claude/projects/ once, share across agents
// ============================================================================
interface CachedJsonlFile {
  path: string
  sessionId: string | null
  cwd: string | null
}

let projectDiscoveryCache: {
  files: CachedJsonlFile[]
  timestamp: number
} | null = null

const PROJECT_CACHE_TTL = 10 * 60 * 1000 // 10 minutes

function getCachedProjectFiles(): CachedJsonlFile[] {
  const now = Date.now()
  if (projectDiscoveryCache && (now - projectDiscoveryCache.timestamp) < PROJECT_CACHE_TTL) {
    return projectDiscoveryCache.files
  }

  // Rebuild cache
  const claudeProjectsDir = path.join(os.homedir(), '.claude', 'projects')
  if (!fs.existsSync(claudeProjectsDir)) {
    projectDiscoveryCache = { files: [], timestamp: now }
    return []
  }

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
    } catch {
      // Skip
    }
    return files
  }

  const allPaths = findJsonlFiles(claudeProjectsDir)
  const files: CachedJsonlFile[] = []

  for (const jsonlPath of allPaths) {
    try {
      // Read only the first 4KB to extract metadata (sessionId, cwd)
      const fd = fs.openSync(jsonlPath, 'r')
      const buf = Buffer.alloc(4096)
      const bytesRead = fs.readSync(fd, buf, 0, 4096, 0)
      fs.closeSync(fd)

      const header = buf.toString('utf-8', 0, bytesRead)
      const firstLines = header.split('\n').slice(0, 20)

      let sessionId: string | null = null
      let cwd: string | null = null

      for (const line of firstLines) {
        if (!line.trim()) continue
        try {
          const message = JSON.parse(line)
          if (message.sessionId && !sessionId) sessionId = message.sessionId
          if (message.cwd && !cwd) cwd = message.cwd
        } catch {
          // Skip malformed
        }
      }

      files.push({ path: jsonlPath, sessionId, cwd })
    } catch {
      // Skip
    }
  }

  console.log(`[Delta Index] Project discovery cache rebuilt: ${files.length} files (TTL: ${PROJECT_CACHE_TTL / 60000}m)`)
  projectDiscoveryCache = { files, timestamp: now }
  return files
}

// ============================================================================
// AUTO-DISCOVER PROJECTS (uses global cache)
// ============================================================================
async function autoDiscoverProjects(
  agentDb: AgentDatabase,
  agentId: string,
  workingDirectories: Set<string>
): Promise<number> {
  console.log(`[Delta Index] Auto-discovering projects for agent ${agentId.substring(0, 8)}...`)

  const agentSessionIds = new Set<string>()
  try {
    const sessionsResult = await getSessions(agentDb, agentId)
    for (const row of sessionsResult.rows) {
      agentSessionIds.add(row[0] as string)
    }
  } catch {
    // Sessions table might not exist
  }

  // Use global cache instead of scanning per-agent
  const allFiles = getCachedProjectFiles()

  const discoveredProjects = new Map<string, { projectName: string; claudeDir: string }>()
  let matchedConversations = 0

  for (const file of allFiles) {
    const belongsToAgent =
      (file.sessionId && agentSessionIds.has(file.sessionId)) ||
      (file.cwd && workingDirectories.has(file.cwd)) ||
      file.path.includes(agentId) ||
      (file.cwd && file.cwd.includes(agentId))

    if (belongsToAgent && file.cwd) {
      matchedConversations++
      if (!discoveredProjects.has(file.cwd)) {
        const projectName = file.cwd.split('/').pop() || 'unknown'
        const claudeDir = path.dirname(file.path)
        discoveredProjects.set(file.cwd, { projectName, claudeDir })
        console.log(`[Delta Index] Auto-discovered project: ${projectName} (${file.cwd})`)
      }
    }
  }

  for (const [projectPath, { projectName, claudeDir }] of discoveredProjects) {
    try {
      await recordProject(agentDb, {
        project_path: projectPath,
        project_name: projectName,
        claude_dir: claudeDir
      })
    } catch (err) {
      console.error(`[Delta Index] Failed to record project ${projectName}:`, err)
    }
  }

  console.log(`[Delta Index] Auto-discovered ${discoveredProjects.size} project(s) from ${matchedConversations} conversation(s)`)
  return discoveredProjects.size
}

// ============================================================================
// GET LIVE TMUX WORKING DIRECTORY
// ============================================================================
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

// ============================================================================
// EXTRACT CONVERSATION METADATA (reads file once, extracts everything)
// ============================================================================
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
        firstUserMessage = content.substring(0, 100).replace(/[\n\r]/g, ' ').trim()
      }
      if (message.type === 'assistant' && message.message?.model) {
        const model = message.message.model
        if (model.includes('sonnet')) modelSet.add('Sonnet 4.5')
        else if (model.includes('haiku')) modelSet.add('Haiku 4.5')
        else if (model.includes('opus')) modelSet.add('Opus 4.5')
      }
    } catch {
      // Skip malformed
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

// ============================================================================
// STREAMING LINE COUNTER (avoids loading entire file into memory)
// ============================================================================
function countFileLines(filePath: string): number {
  const buffer = Buffer.alloc(64 * 1024) // 64KB read buffer
  const fd = fs.openSync(filePath, 'r')
  let count = 0
  let bytesRead: number
  let leftover = ''

  try {
    while ((bytesRead = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) {
      const chunk = leftover + buffer.toString('utf-8', 0, bytesRead)
      const lines = chunk.split('\n')
      leftover = lines.pop() || ''
      for (const line of lines) {
        if (line.trim()) count++
      }
    }
    if (leftover.trim()) count++
  } finally {
    fs.closeSync(fd)
  }
  return count
}

// ============================================================================
// MAIN ENTRY: runIndexDelta — callable directly (no HTTP)
// ============================================================================
export interface IndexDeltaResult {
  success: boolean
  agent_id: string
  message?: string
  dry_run?: boolean
  new_conversations_discovered: number
  conversations_indexed?: number
  conversations_needing_index?: number
  total_messages_processed: number
  total_duration_ms?: number
  results?: Array<{
    file: string
    delta: number
    processed: number
    duration_ms: number
  }>
  report?: Array<{
    file: string
    last_indexed: number
    current_messages: number
    delta_to_index: number
  }>
  error?: string
}

export async function runIndexDelta(
  agentId: string,
  options: { dryRun?: boolean; batchSize?: number } = {}
): Promise<IndexDeltaResult> {
  const { dryRun = false, batchSize = 10 } = options

  const releaseSlot = await acquireIndexSlot(agentId)

  try {
    console.log(`[Delta Index] Processing agent ${agentId.substring(0, 8)} (dryRun: ${dryRun})`)

    const agent = await agentRegistry.getAgent(agentId)
    const agentDb = await agent.getDatabase()

    // SYNC WORKING DIRECTORY
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
          console.log(`[Delta Index] Syncing workingDirectory: ${storedWd} -> ${liveTmuxWd}`)
          updateAgentWorkingDirectory(agentId, liveTmuxWd)
          registryAgent = getRegistryAgent(agentId) || getAgentBySession(agentId)
        }
      }
    }

    // Get projects
    let projectsResult
    try {
      projectsResult = await getProjects(agentDb)
    } catch (error: any) {
      if (error.code === 'query::relation_not_found' || error.message?.includes('relation_not_found')) {
        console.log(`[Delta Index] Schema not initialized for agent ${agentId.substring(0, 8)} - skipping`)
        releaseSlot()
        return {
          success: true,
          agent_id: agentId,
          message: 'Schema not initialized yet - will retry on next cycle',
          new_conversations_discovered: 0,
          total_messages_processed: 0,
        }
      }
      throw error
    }

    // AUTO-DISCOVER if no projects
    if (projectsResult.rows.length === 0) {
      console.log(`[Delta Index] No projects for agent ${agentId.substring(0, 8)} - auto-discovering`)

      const workingDirectories = new Set<string>()
      if (registryAgent) {
        if (liveTmuxWd) workingDirectories.add(liveTmuxWd)
        const storedWd = registryAgent.workingDirectory || registryAgent.sessions?.[0]?.workingDirectory
        if (storedWd) workingDirectories.add(storedWd)
        const preferenceWd = registryAgent.preferences?.defaultWorkingDirectory
        if (preferenceWd) workingDirectories.add(preferenceWd)
      }

      const autoDiscoveredCount = await autoDiscoverProjects(agentDb, agentId, workingDirectories)

      if (autoDiscoveredCount > 0) {
        projectsResult = await getProjects(agentDb)
      } else {
        releaseSlot()
        return {
          success: true,
          agent_id: agentId,
          message: 'No projects found for this agent',
          new_conversations_discovered: 0,
          total_messages_processed: 0,
        }
      }
    }

    // Phase 1: DISCOVER new conversation files
    let newConversationsDiscovered = 0

    for (const projectRow of projectsResult.rows) {
      const projectPath = projectRow[0] as string
      const claudeDir = projectRow[2] as string

      if (!claudeDir || !fs.existsSync(claudeDir)) continue

      const existingConvosResult = await getConversations(agentDb, projectPath)
      const existingFiles = new Set(existingConvosResult.rows.map((row: unknown[]) => row[0] as string))

      try {
        const files = fs.readdirSync(claudeDir)
        const jsonlFiles = files.filter(f => f.endsWith('.jsonl'))

        for (const jsonlFile of jsonlFiles) {
          const fullPath = path.join(claudeDir, jsonlFile)
          if (existingFiles.has(fullPath)) continue

          console.log(`[Delta Index] Discovered new conversation: ${jsonlFile}`)

          try {
            const metadata = extractConversationMetadata(fullPath, projectPath)
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
              last_indexed_at: 0,
              last_indexed_message_count: 0
            })

            // Seed the file size cache for this new file
            updateFileSizeCache(fullPath)

            newConversationsDiscovered++
          } catch (err) {
            console.error(`[Delta Index] Failed to process ${jsonlFile}:`, err)
          }
        }
      } catch (err) {
        console.error(`[Delta Index] Error scanning ${claudeDir}:`, err)
      }
    }

    if (newConversationsDiscovered > 0) {
      console.log(`[Delta Index] Discovered ${newConversationsDiscovered} new conversation(s)`)
    }

    // Phase 2: Get ALL conversations
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
        conversations.push({
          jsonl_file: convoRow[0] as string,
          message_count: convoRow[4] as number,
          last_indexed_message_count: (convoRow[10] as number) || 0,
          project_path: projectPath,
        })
      }
    }

    console.log(`[Delta Index] ${conversations.length} total conversations (${newConversationsDiscovered} new)`)

    // Phase 3: Filter — use file size cache to skip unchanged files (no file reads!)
    const conversationsNeedingIndex: Array<typeof conversations[0] & { currentLineCount: number }> = []

    for (const conv of conversations) {
      if (!fs.existsSync(conv.jsonl_file)) continue

      // Fast check: has the file size changed since last time?
      if (!hasFileChanged(conv.jsonl_file) && conv.last_indexed_message_count > 0) {
        continue // File unchanged — skip without reading
      }

      // File changed or never indexed — read once and count lines
      const currentLineCount = countFileLines(conv.jsonl_file)
      const delta = currentLineCount - conv.last_indexed_message_count

      if (delta > 0) {
        conversationsNeedingIndex.push({ ...conv, currentLineCount })
      }
    }

    console.log(`[Delta Index] ${conversationsNeedingIndex.length} conversations need indexing`)

    if (dryRun) {
      const report = conversationsNeedingIndex.map((conv) => ({
        file: conv.jsonl_file,
        last_indexed: conv.last_indexed_message_count,
        current_messages: conv.currentLineCount,
        delta_to_index: conv.currentLineCount - conv.last_indexed_message_count,
      }))

      releaseSlot()
      return {
        success: true,
        dry_run: true,
        agent_id: agentId,
        new_conversations_discovered: newConversationsDiscovered,
        conversations_needing_index: conversationsNeedingIndex.length,
        total_messages_processed: 0,
        report,
      }
    }

    // Phase 4: Index deltas (file read happens inside indexConversationDelta)
    const results: Array<{
      file: string
      delta: number
      processed: number
      duration_ms: number
    }> = []

    let totalProcessed = 0
    let totalDuration = 0

    for (const conv of conversationsNeedingIndex) {
      console.log(`\n[Delta Index] Processing: ${conv.jsonl_file}`)

      const delta = conv.currentLineCount - conv.last_indexed_message_count

      const stats = await indexConversationDelta(
        agentDb,
        conv.jsonl_file,
        conv.last_indexed_message_count,
        { batchSize }
      )

      await recordConversation(agentDb, {
        jsonl_file: conv.jsonl_file,
        project_path: conv.project_path,
        message_count: conv.currentLineCount,
        last_indexed_at: Date.now(),
        last_indexed_message_count: conv.currentLineCount,
      })

      // Update file size cache after successful indexing
      updateFileSizeCache(conv.jsonl_file)

      results.push({
        file: conv.jsonl_file,
        delta,
        processed: stats.processedMessages,
        duration_ms: stats.durationMs,
      })

      totalProcessed += stats.processedMessages
      totalDuration += stats.durationMs
    }

    console.log(`\n[Delta Index] Complete: ${totalProcessed} messages in ${totalDuration}ms`)

    releaseSlot()
    return {
      success: true,
      agent_id: agentId,
      new_conversations_discovered: newConversationsDiscovered,
      conversations_indexed: conversationsNeedingIndex.length,
      total_messages_processed: totalProcessed,
      total_duration_ms: totalDuration,
      results,
    }
  } catch (error) {
    releaseSlot()
    console.error('[Delta Index] Error:', error)
    return {
      success: false,
      agent_id: agentId,
      new_conversations_discovered: 0,
      total_messages_processed: 0,
      error: error instanceof Error ? error.message : 'Unknown error',
    }
  }
}
