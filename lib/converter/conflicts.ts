/**
 * Conflict Detection for element installation and conversion.
 *
 * Rules:
 * 1. Standalone → Standalone (same scope): Block if folder name matches.
 * 2. Local scope only checks local standalone. User scope only checks user standalone.
 * 3. Plugin elements: NEVER modified. Conversion creates NEW plugins.
 * 4. Inside a generated plugin: Check for duplicate names WITHIN the plugin only.
 * 5. Cross-plugin: No conflict (namespace prefix resolves names).
 * 6. Default: never force, always return error on conflict.
 */

import path from 'path'
import { fileExists, listDirs } from './utils/fs'
import { resolveHomePath, getProvider } from './registry'
import type { ConvertedFile, ProviderId } from './types'

export interface ConflictInfo {
  /** Element name that conflicts */
  name: string
  /** Type of element (skills, agents, etc.) */
  type: string
  /** Path of the existing element */
  existingPath: string
  /** Whether the existing element is standalone or inside a plugin */
  existingSource: 'standalone' | 'plugin'
  /** Scope of the existing element */
  scope: 'user' | 'project'
}

export interface ConflictCheckResult {
  hasConflicts: boolean
  conflicts: ConflictInfo[]
  /** Human-readable error message listing all conflicts */
  errorMessage: string | null
}

/**
 * Check for standalone element name conflicts before writing converted files.
 *
 * Only checks standalone elements (NOT plugin elements — those use namespace prefixes).
 * Only checks within the same scope (user ↔ user, project ↔ project).
 */
export async function checkStandaloneConflicts(
  files: ConvertedFile[],
  targetProvider: ProviderId,
  scope: 'user' | 'project',
  projectDir?: string
): Promise<ConflictCheckResult> {
  const provider = getProvider(targetProvider)
  if (!provider) return { hasConflicts: false, conflicts: [], errorMessage: null }

  const rootDir = scope === 'user'
    ? (process.env.HOME || '/root')
    : (projectDir || process.cwd())

  const conflicts: ConflictInfo[] = []

  // Extract unique element directories from the file list
  // e.g., ".agents/skills/my-skill/SKILL.md" → check if ".agents/skills/my-skill/" exists
  const checkedDirs = new Set<string>()

  for (const file of files) {
    // Only check SKILL.md and agent files (the primary files, not aux/reference)
    const isSkillFile = file.path.endsWith('/SKILL.md')
    const isAgentFile = file.type === 'agents' && (
      file.path.endsWith('.md') || file.path.endsWith('.toml') || file.path.endsWith('.json')
    ) && !file.path.endsWith('-prompt.md')  // Exclude Kiro prompt files, not all paths with slashes

    if (!isSkillFile && !isAgentFile) continue

    // Get the element directory (for skills) or file (for agents)
    let elementPath: string
    let elementName: string

    if (isSkillFile) {
      // .agents/skills/my-skill/SKILL.md → .agents/skills/my-skill
      elementPath = path.dirname(file.path)
      elementName = path.basename(elementPath)
    } else {
      // .codex/agents/my-agent.toml → .codex/agents/my-agent.toml
      elementPath = file.path
      elementName = path.basename(file.path).replace(/\.(md|toml|json)$/, '')
    }

    // Skip if already checked this directory
    if (checkedDirs.has(elementPath)) continue
    checkedDirs.add(elementPath)

    // Check if element exists at target
    const fullPath = path.join(rootDir, elementPath)

    if (isSkillFile) {
      // For skills: check if the directory exists AND has a SKILL.md
      if (await fileExists(path.join(fullPath, 'SKILL.md'))) {
        conflicts.push({
          name: elementName,
          type: file.type,
          existingPath: fullPath,
          existingSource: 'standalone',
          scope,
        })
      }
    } else {
      // For agents: check if the file exists
      if (await fileExists(path.join(rootDir, file.path))) {
        conflicts.push({
          name: elementName,
          type: file.type,
          existingPath: path.join(rootDir, file.path),
          existingSource: 'standalone',
          scope,
        })
      }
    }
  }

  if (conflicts.length === 0) {
    return { hasConflicts: false, conflicts: [], errorMessage: null }
  }

  // Build detailed error message
  const scopeLabel = scope === 'user' ? 'user-scope' : 'project-scope'
  const lines = [
    `${conflicts.length} name conflict(s) found with existing ${scopeLabel} standalone elements:`,
    '',
    ...conflicts.map(c =>
      `  - ${c.type} "${c.name}" already exists at: ${c.existingPath}`
    ),
    '',
    'To resolve: rename the conflicting element(s) or remove the existing ones first.',
    'Existing standalone elements will NOT be overwritten.',
  ]

  return {
    hasConflicts: true,
    conflicts,
    errorMessage: lines.join('\n'),
  }
}

/**
 * Check for duplicate element names WITHIN a single generated plugin.
 * Cross-plugin conflicts are not possible (namespace prefix resolves them).
 */
export function checkIntraPluginConflicts(files: ConvertedFile[]): ConflictCheckResult {
  const namesByType: Record<string, Set<string>> = {}
  const conflicts: ConflictInfo[] = []

  for (const file of files) {
    if (!namesByType[file.type]) namesByType[file.type] = new Set()

    let name: string | null = null
    if (file.path.endsWith('/SKILL.md')) {
      name = path.basename(path.dirname(file.path))
    } else if (file.type === 'agents') {
      name = path.basename(file.path).replace(/\.(agent\.md|md|toml|json)$/, '')
    } else if (file.type === 'commands') {
      name = path.basename(file.path).replace(/\.(md|toml)$/, '')
    }

    if (!name) continue

    if (namesByType[file.type].has(name)) {
      conflicts.push({
        name,
        type: file.type,
        existingPath: file.path,
        existingSource: 'plugin',
        scope: 'project',
      })
    } else {
      namesByType[file.type].add(name)
    }
  }

  if (conflicts.length === 0) {
    return { hasConflicts: false, conflicts: [], errorMessage: null }
  }

  return {
    hasConflicts: true,
    conflicts,
    errorMessage: `Duplicate element names within the generated plugin:\n${conflicts.map(c => `  - ${c.type} "${c.name}" appears multiple times`).join('\n')}`,
  }
}
