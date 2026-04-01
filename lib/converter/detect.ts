/**
 * Auto-detection — identify source client and element types from a path.
 *
 * Detection strategies (in priority order):
 * 1. Directory pattern matching (most reliable)
 * 2. File extension / naming conventions
 * 3. Content analysis (frontmatter fields, format)
 */

import fs from 'fs/promises'
import path from 'path'
import type { ProviderId, ElementType } from './types'
import { PROVIDER_IDS, getProvider, resolveHomePath } from './registry'

/** Result of auto-detection */
export interface DetectResult {
  /** Detected source provider (null if ambiguous) */
  provider: ProviderId | null
  /** Element types detected in the directory */
  elements: ElementType[]
  /** Confidence: 'high' (directory match), 'medium' (content match), 'low' (guess) */
  confidence: 'high' | 'medium' | 'low'
}

/** Directory patterns that uniquely identify each client */
const DIR_PATTERNS: Array<{ pattern: RegExp; provider: ProviderId }> = [
  { pattern: /[/\\]\.claude[/\\]/, provider: 'claude-code' },
  { pattern: /[/\\]\.codex[/\\]/, provider: 'codex' },
  { pattern: /[/\\]\.gemini[/\\]/, provider: 'gemini' },
  { pattern: /[/\\]\.opencode[/\\]/, provider: 'opencode' },
  { pattern: /[/\\]\.kiro[/\\]/, provider: 'kiro' },
  { pattern: /[/\\]\.github[/\\]agents[/\\]/, provider: 'copilot' },
  { pattern: /[/\\]\.agents[/\\]skills[/\\]/, provider: 'copilot' },
  // Plugin cache is always Claude
  { pattern: /[/\\]\.claude[/\\]plugins[/\\]cache[/\\]/, provider: 'claude-code' },
]

/**
 * Detect source provider from a file or directory path.
 * Uses directory patterns first, then checks what exists on disk.
 */
export async function detectProvider(inputPath: string): Promise<DetectResult> {
  const resolved = resolveHomePath(inputPath)
  const absPath = path.resolve(resolved)

  // 1. Directory pattern matching
  for (const { pattern, provider } of DIR_PATTERNS) {
    if (pattern.test(absPath)) {
      const elements = await detectElements(absPath, provider)
      return { provider, elements, confidence: 'high' }
    }
  }

  // 2. Check if the path IS a project root with client config dirs
  try {
    const stat = await fs.stat(absPath)
    if (stat.isDirectory()) {
      return detectFromProjectRoot(absPath)
    }
  } catch {
    // Path doesn't exist or not accessible
  }

  // 3. Single file — detect from extension and content
  try {
    const stat = await fs.stat(absPath)
    if (stat.isFile()) {
      return detectFromFile(absPath)
    }
  } catch {
    // Not a file
  }

  return { provider: null, elements: [], confidence: 'low' }
}

/**
 * Detect provider from a project root directory by checking which
 * client config directories exist.
 */
async function detectFromProjectRoot(dir: string): Promise<DetectResult> {
  const detected: ProviderId[] = []

  for (const id of PROVIDER_IDS) {
    const provider = getProvider(id)
    if (!provider) continue
    try {
      await fs.access(path.join(dir, provider.configDir))
      detected.push(id)
    } catch {
      // Config dir doesn't exist for this client
    }
  }

  // Also check .agents/ (Copilot) which shares with Codex
  try {
    await fs.access(path.join(dir, '.agents', 'skills'))
    if (!detected.includes('copilot')) detected.push('copilot')
  } catch { /* */ }

  if (detected.length === 1) {
    const elements = await detectElements(dir, detected[0])
    return { provider: detected[0], elements, confidence: 'high' }
  }

  if (detected.length > 1) {
    // Multiple clients — prefer Claude as the richest source
    const preferred = detected.includes('claude-code') ? 'claude-code' : detected[0]
    const elements = await detectElements(dir, preferred)
    return { provider: preferred, elements, confidence: 'medium' }
  }

  // No client dirs found — check for SKILL.md directly (standalone skill)
  try {
    await fs.access(path.join(dir, 'SKILL.md'))
    return { provider: null, elements: ['skills'], confidence: 'low' }
  } catch { /* */ }

  return { provider: null, elements: [], confidence: 'low' }
}

/**
 * Detect provider from a single file's extension and content.
 */
async function detectFromFile(filePath: string): Promise<DetectResult> {
  const ext = path.extname(filePath)
  const base = path.basename(filePath)

  // .agent.md → Copilot
  if (base.endsWith('.agent.md')) {
    return { provider: 'copilot', elements: ['agents'], confidence: 'high' }
  }

  // .toml agent → Codex
  if (ext === '.toml') {
    return { provider: 'codex', elements: ['agents'], confidence: 'medium' }
  }

  // .json agent → Kiro (check for prompt field)
  if (ext === '.json') {
    try {
      const content = await fs.readFile(filePath, 'utf-8')
      const data = JSON.parse(content)
      if (data.prompt !== undefined || data.resources !== undefined) {
        return { provider: 'kiro', elements: ['agents'], confidence: 'medium' }
      }
    } catch { /* not valid JSON */ }
  }

  // SKILL.md → detect from parent directory
  if (base === 'SKILL.md') {
    const parentDir = path.dirname(filePath)
    return detectProvider(parentDir)
  }

  return { provider: null, elements: [], confidence: 'low' }
}

/**
 * Detect which element types exist in a directory for a given provider.
 */
async function detectElements(dir: string, providerId: ProviderId): Promise<ElementType[]> {
  const provider = getProvider(providerId)
  if (!provider) return []

  const elements: ElementType[] = []

  // Skills
  const skillsDir = path.join(dir, provider.skillsPath)
  try {
    const entries = await fs.readdir(skillsDir, { withFileTypes: true })
    if (entries.some(e => e.isDirectory())) elements.push('skills')
  } catch { /* */ }

  // Agents
  const agentsDir = path.join(dir, provider.agentsPath)
  try {
    const entries = await fs.readdir(agentsDir)
    if (entries.length > 0) elements.push('agents')
  } catch { /* */ }

  // Instructions
  try {
    await fs.access(path.join(dir, provider.configFile))
    elements.push('instructions')
  } catch { /* */ }

  // MCP
  if (provider.mcpConfigPath) {
    try {
      await fs.access(path.join(dir, provider.mcpConfigPath))
      elements.push('mcp')
    } catch { /* */ }
  }

  // Commands
  if (provider.commandsPath) {
    try {
      const entries = await fs.readdir(path.join(dir, provider.commandsPath))
      if (entries.length > 0) elements.push('commands')
    } catch { /* */ }
  }

  // Hooks
  if (provider.hooksPath) {
    try {
      await fs.access(path.join(dir, provider.hooksPath))
      elements.push('hooks')
    } catch { /* */ }
  }

  return elements
}

/**
 * Detect if a path is a GitHub URL and extract owner/repo/branch/subpath.
 */
export function parseGitHubUrl(input: string): {
  isGitHub: boolean
  owner?: string
  repo?: string
  branch?: string
  subPath?: string
} {
  // github:owner/repo or owner/repo
  const shortMatch = input.match(/^(?:github:)?([a-zA-Z0-9_.-]+)\/([a-zA-Z0-9_.-]+)(?:#(.+))?$/)
  if (shortMatch) {
    return { isGitHub: true, owner: shortMatch[1], repo: shortMatch[2], branch: shortMatch[3] || 'main' }
  }

  // https://github.com/owner/repo/tree/branch/sub/path
  const urlMatch = input.match(/github\.com\/([^/]+)\/([^/]+)(?:\/tree\/([^/]+)(?:\/(.+))?)?/)
  if (urlMatch) {
    return { isGitHub: true, owner: urlMatch[1], repo: urlMatch[2], branch: urlMatch[3] || 'main', subPath: urlMatch[4] }
  }

  return { isGitHub: false }
}
