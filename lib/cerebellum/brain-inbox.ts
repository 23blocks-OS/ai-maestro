/**
 * Brain Inbox — JSONL-based signal queue from cerebellum/subconscious to cortex
 *
 * The cortex (Claude Code agent) polls this inbox via the hook on idle_prompt.
 * Signals are appended by the cerebellum (voice events) and subconscious (memory hits).
 * Reading clears the inbox so signals are delivered exactly once.
 */

import * as fs from 'fs'
import * as path from 'path'
import * as os from 'os'

export interface BrainSignal {
  from: 'cerebellum' | 'subconscious'
  type: 'warning' | 'memory' | 'notification'
  priority: 'high' | 'medium' | 'low'
  message: string
  timestamp: number
}

function inboxPath(agentId: string): string {
  return path.join(os.homedir(), '.aimaestro', 'agents', agentId, 'brain', 'cortex-inbox.jsonl')
}

export function writeBrainSignal(agentId: string, signal: BrainSignal): void {
  try {
    const filePath = inboxPath(agentId)
    const dir = path.dirname(filePath)
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true })
    }
    fs.appendFileSync(filePath, JSON.stringify(signal) + '\n')
  } catch (err) {
    console.error(`[BrainInbox] Failed to write signal for ${agentId.substring(0, 8)}:`, err)
  }
}

export function readAndClearBrainInbox(agentId: string): BrainSignal[] {
  const filePath = inboxPath(agentId)
  try {
    if (!fs.existsSync(filePath)) return []
    const content = fs.readFileSync(filePath, 'utf-8').trim()
    if (!content) return []

    // Truncate immediately (atomic read-and-clear)
    fs.writeFileSync(filePath, '')

    const signals: BrainSignal[] = []
    for (const line of content.split('\n')) {
      if (!line.trim()) continue
      try {
        signals.push(JSON.parse(line))
      } catch {
        // Skip malformed lines
      }
    }
    return signals
  } catch (err) {
    console.error(`[BrainInbox] Failed to read inbox for ${agentId.substring(0, 8)}:`, err)
    return []
  }
}
