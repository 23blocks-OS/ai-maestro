/**
 * Agents Canvas Service
 *
 * Business logic for listing and serving HTML files from agent canvas directories.
 * Canvas dir: ~/.aimaestro/agents/<id>/canvas/
 *
 * Routes are thin wrappers that call these functions.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import crypto from 'crypto'
import { getAgent, getAgentByName, getAgentByAlias } from '@/lib/agent-registry'
import { type ServiceResult, invalidRequest, notFound, missingField } from '@/services/service-errors'
import type { Agent } from '@/types/agent'
import { computeSessionName } from '@/types/agent'
import { getRuntime } from '@/lib/agent-runtime'

export interface CanvasInteraction {
  id: string
  timestamp: string
  canvasFile: string
  action: string
  element?: string
  data?: Record<string, unknown>
  summary: string
}

export interface CanvasFile {
  name: string       // "report.html"
  path: string       // "reports/report.html" (relative to canvas dir)
  size: number
  modifiedAt: string // ISO timestamp
}

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')

function resolveAgent(idOrName: string): Agent | null {
  return getAgent(idOrName) || getAgentByName(idOrName) || getAgentByAlias(idOrName) || null
}

function getCanvasDir(agentId: string): string {
  return path.join(AIMAESTRO_DIR, 'agents', agentId, 'canvas')
}

/**
 * Recursively scan for HTML files in a directory.
 */
function scanHtmlFiles(dir: string, baseDir: string): CanvasFile[] {
  const files: CanvasFile[] = []

  if (!fs.existsSync(dir)) return files

  const entries = fs.readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...scanHtmlFiles(fullPath, baseDir))
    } else if (entry.isFile() && /\.html?$/i.test(entry.name)) {
      const stat = fs.statSync(fullPath)
      files.push({
        name: entry.name,
        path: path.relative(baseDir, fullPath),
        size: stat.size,
        modifiedAt: stat.mtime.toISOString(),
      })
    }
  }

  return files
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * List HTML files in an agent's canvas directory.
 */
export function listCanvasFiles(
  agentIdOrName: string
): ServiceResult<{ files: CanvasFile[] }> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return notFound('Agent', agentIdOrName)
  }

  const canvasDir = getCanvasDir(agent.id)
  const files = scanHtmlFiles(canvasDir, canvasDir)

  // Sort by modifiedAt descending (newest first)
  files.sort((a, b) => new Date(b.modifiedAt).getTime() - new Date(a.modifiedAt).getTime())

  return { data: { files }, status: 200 }
}

/**
 * Get a canvas file's raw HTML content.
 */
export function getCanvasFile(
  agentIdOrName: string,
  filePath: string
): ServiceResult<{ content: string; fileName: string; size: number }> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return notFound('Agent', agentIdOrName)
  }

  // Path traversal protection
  if (filePath.includes('..') || path.isAbsolute(filePath)) {
    return invalidRequest('Invalid file path')
  }

  // Only allow HTML files
  if (!/\.html?$/i.test(filePath)) {
    return invalidRequest('Only .html and .htm files are supported')
  }

  const canvasDir = getCanvasDir(agent.id)
  const resolvedPath = path.resolve(canvasDir, filePath)

  // Defense in depth: ensure resolved path is within canvas dir
  if (!resolvedPath.startsWith(canvasDir + path.sep) && resolvedPath !== canvasDir) {
    return invalidRequest('Invalid file path')
  }

  if (!fs.existsSync(resolvedPath)) {
    return notFound('Canvas file', filePath)
  }

  const content = fs.readFileSync(resolvedPath, 'utf-8')
  const stat = fs.statSync(resolvedPath)

  return {
    data: {
      content,
      fileName: path.basename(filePath),
      size: stat.size,
    },
    status: 200,
  }
}

// ── Canvas Interactions ───────────────────────────────────────────────────────

function getInteractionsDir(agentId: string): string {
  return path.join(AIMAESTRO_DIR, 'agents', agentId, 'canvas', 'interactions')
}

function buildSummary(action: string, element?: string, canvasFile?: string, data?: Record<string, unknown>): string {
  let summary = `User ${action}`
  if (element) summary += ` '${element}'`
  if (canvasFile) summary += ` on ${canvasFile}`
  if (data && Object.keys(data).length > 0) {
    const preview = JSON.stringify(data)
    summary += ` with data: ${preview.length > 200 ? preview.slice(0, 200) + '...' : preview}`
  }
  return summary
}

async function notifyCanvasInteraction(agent: Agent, summary: string): Promise<void> {
  try {
    if (!agent.sessions || agent.sessions.length === 0) return
    const primarySession = agent.sessions.find(s => s.index === 0) || agent.sessions[0]
    const sessionName = computeSessionName(agent.name, primarySession.index)
    const runtime = getRuntime()
    const exists = await runtime.sessionExists(sessionName)
    if (!exists) return

    const escaped = summary.replace(/'/g, "'\\''")
    const target = `${sessionName}:0.0`
    await runtime.sendKeys(target, `echo '${escaped}'`, { literal: true })
    await new Promise(resolve => setTimeout(resolve, 150))
    await runtime.sendKeys(target, 'Enter')
  } catch {
    // Fire-and-forget — notification failure is non-fatal
  }
}

/**
 * Submit a canvas interaction from the UI.
 */
export async function submitInteraction(
  agentIdOrName: string,
  input: { action?: string; element?: string; canvasFile?: string; data?: Record<string, unknown> }
): Promise<ServiceResult<{ id: string; summary: string }>> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) return notFound('Agent', agentIdOrName)

  if (!input.action) return missingField('action')
  if (!input.canvasFile) return missingField('canvasFile')

  const id = crypto.randomUUID()
  const timestamp = new Date().toISOString()
  const summary = buildSummary(input.action, input.element, input.canvasFile, input.data)

  const interaction: CanvasInteraction = {
    id,
    timestamp,
    canvasFile: input.canvasFile,
    action: input.action,
    element: input.element,
    data: input.data,
    summary,
  }

  const dir = getInteractionsDir(agent.id)
  fs.mkdirSync(dir, { recursive: true })
  const fileName = `${timestamp.replace(/[:.]/g, '-')}-${id}.json`
  fs.writeFileSync(path.join(dir, fileName), JSON.stringify(interaction, null, 2))

  // Notify agent via tmux (fire-and-forget)
  const notification = `[CANVAS] ${input.canvasFile}: ${summary}`
  notifyCanvasInteraction(agent, notification)

  return { data: { id, summary }, status: 201 }
}

/**
 * List canvas interactions for an agent.
 */
export function listInteractions(
  agentIdOrName: string,
  limit = 50
): ServiceResult<{ interactions: CanvasInteraction[] }> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) return notFound('Agent', agentIdOrName)

  const dir = getInteractionsDir(agent.id)
  if (!fs.existsSync(dir)) {
    return { data: { interactions: [] }, status: 200 }
  }

  const files = fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().reverse()
  const interactions: CanvasInteraction[] = []

  for (const file of files.slice(0, limit)) {
    try {
      const raw = fs.readFileSync(path.join(dir, file), 'utf-8')
      interactions.push(JSON.parse(raw))
    } catch {
      // Skip malformed files
    }
  }

  return { data: { interactions }, status: 200 }
}
