/**
 * Shared parser logic: scan skill/agent directories, parse frontmatter, read references.
 * Ported from crucible parsers/shared.js + acplugin scanner/claude.ts.
 */

import fs from 'fs/promises'
import path from 'path'
import { parseFrontmatter } from '../utils/frontmatter'
import { listDirs, listFilesRecursive, readFileOr } from '../utils/fs'
import type { SkillIR, SkillArg, SkillReference, AuxFile, AgentIR } from '../types'

// ═══════════════════════════════════════════════════════════════
// Safe type coercion helpers (frontmatter values can be any type)
// ═══════════════════════════════════════════════════════════════

/** Coerce frontmatter value to string or null. Converts numbers/booleans via String(). */
export function asStringOrNull(val: unknown): string | null {
  if (val == null) return null
  if (typeof val === 'string') return val
  if (typeof val === 'number' || typeof val === 'boolean') return String(val)
  return null
}

/** Coerce frontmatter value to Record<string, string> or null. */
export function asRecordOrNull(val: unknown): Record<string, string> | null {
  if (val == null) return null
  if (typeof val === 'object' && !Array.isArray(val)) return val as Record<string, string>
  return null
}

/** Coerce frontmatter paths field to string[] or null. Accepts string or string[]. */
export function asPathsOrNull(val: unknown): string[] | null {
  if (Array.isArray(val)) return val.filter(v => typeof v === 'string')
  if (typeof val === 'string') return [val]
  return null
}

// ═══════════════════════════════════════════════════════════════
// Skill Parsing
// ═══════════════════════════════════════════════════════════════

/**
 * Parse all skills in a directory. Scans {skillsDir}/{name}/SKILL.md.
 * Uses mapFn to convert frontmatter+body into SkillIR.
 */
export async function parseSkillsDir(
  skillsDir: string,
  mapFn: (dirName: string, fm: Record<string, unknown>, body: string, refs: SkillReference[], auxFiles: AuxFile[], sourcePath: string) => SkillIR
): Promise<SkillIR[]> {
  const dirs = await listDirs(skillsDir)
  const results: SkillIR[] = []

  for (const dirName of dirs) {
    const skillDir = path.join(skillsDir, dirName)
    const skillFile = path.join(skillDir, 'SKILL.md')
    const content = await readFileOr(skillFile)
    if (!content) continue

    const { data, body } = parseFrontmatter(content)
    const refs = await readReferences(skillDir)
    const auxFiles = await scanAuxFiles(skillDir)
    results.push(mapFn(dirName, data, body, refs, auxFiles, skillFile))
  }

  return results
}

/** Read all .md files from {skillDir}/reference/ or {skillDir}/references/ */
async function readReferences(skillDir: string): Promise<SkillReference[]> {
  const refs: SkillReference[] = []
  for (const refDirName of ['reference', 'references']) {
    const refDir = path.join(skillDir, refDirName)
    try {
      const entries = await fs.readdir(refDir, { withFileTypes: true })
      for (const entry of entries) {
        if (!entry.isFile()) continue
        const filePath = path.join(refDir, entry.name)
        const content = await readFileOr(filePath)
        if (content) {
          refs.push({ path: `${refDirName}/${entry.name}`, content })
        }
      }
    } catch { /* dir doesn't exist */ }
  }
  return refs
}

/** Scan all auxiliary files in a skill directory (everything except SKILL.md) */
async function scanAuxFiles(skillDir: string): Promise<AuxFile[]> {
  const allFiles = await listFilesRecursive(skillDir, skillDir)
  const auxFiles: AuxFile[] = []
  for (const relativePath of allFiles) {
    if (relativePath === 'SKILL.md') continue
    // Skip reference files (already captured separately)
    if (relativePath.startsWith('reference/') || relativePath.startsWith('references/')) continue
    const content = await readFileOr(path.join(skillDir, relativePath))
    if (content !== null) {
      auxFiles.push({ relativePath, content })
    }
  }
  return auxFiles
}

// ═══════════════════════════════════════════════════════════════
// Argument Parsing
// ═══════════════════════════════════════════════════════════════

/** Normalize args from frontmatter into canonical IR format */
export function normalizeArgs(args: unknown): SkillArg[] {
  if (!Array.isArray(args)) return []
  return args.map((arg: unknown) => {
    if (typeof arg === 'string') {
      return { name: arg, description: '', required: true }
    }
    const a = arg as Record<string, unknown>
    return {
      name: String(a.name ?? ''),
      description: String(a.description ?? ''),
      required: Boolean(a.required ?? true),
    }
  })
}

/**
 * Parse argument-hint string into args array.
 * Handles <name> (required) and [name] or [name=default] (optional).
 * Ported from crucible parsers/shared.js.
 */
export function parseArgumentHint(hint: string | undefined): SkillArg[] {
  if (!hint || typeof hint !== 'string') return []
  const args: SkillArg[] = []
  const tokenRegex = /<([^>]+)>|\[([^\]]+)\]/g
  let match
  while ((match = tokenRegex.exec(hint)) !== null) {
    if (match[1]) {
      args.push({ name: match[1].toLowerCase(), description: '', required: true })
    } else if (match[2]) {
      const parts = match[2].split('=')
      const name = parts[0].toLowerCase()
      const defaultVal = parts.length > 1 ? parts.slice(1).join('=') : null
      args.push({ name, description: defaultVal ? `default: ${defaultVal}` : '', required: false })
    }
  }
  return args
}

/** Recover arg names from $ARGNAME patterns in body text (Codex style) */
export function recoverDollarArgs(body: string): { args: SkillArg[]; userInvokable: boolean } {
  if (!body) return { args: [], userInvokable: false }
  const argRegex = /\$([A-Z_][A-Z0-9_]*)/g
  const seen = new Set<string>()
  const args: SkillArg[] = []
  let match
  while ((match = argRegex.exec(body)) !== null) {
    const name = match[1].toLowerCase()
    if (!seen.has(name)) {
      seen.add(name)
      args.push({ name, description: '', required: true })
    }
  }
  return { args, userInvokable: args.length > 0 }
}

/** Detect {{arg}} mustache patterns in body text */
export function detectMustacheArgs(body: string): SkillArg[] {
  if (!body) return []
  const argRegex = /\{\{([^}]+)\}\}/g
  const seen = new Set<string>()
  const args: SkillArg[] = []
  let match
  while ((match = argRegex.exec(body)) !== null) {
    const name = match[1].trim().toLowerCase()
    if (name === 'args') continue // Skip collapsed {{args}} placeholder
    if (!seen.has(name)) {
      seen.add(name)
      args.push({ name, description: '', required: true })
    }
  }
  return args
}

// ═══════════════════════════════════════════════════════════════
// Agent Parsing
// ═══════════════════════════════════════════════════════════════

/** Parse agents from a directory of markdown files with YAML frontmatter */
export async function parseMarkdownAgentsDir(agentsDir: string): Promise<AgentIR[]> {
  const agents: AgentIR[] = []
  let entries: string[]
  try {
    entries = await fs.readdir(agentsDir).then(e => e.filter(f => f.endsWith('.md')))
  } catch {
    return []
  }

  for (const fileName of entries) {
    const filePath = path.join(agentsDir, fileName)
    const content = await readFileOr(filePath)
    if (!content) continue

    const { data, body } = parseFrontmatter(content)
    const baseName = fileName.replace(/\.agent\.md$/, '').replace(/\.md$/, '')

    agents.push({
      name: String(data.name ?? baseName),
      description: String(data.description ?? ''),
      body,
      model: data.model as string ?? null,
      temperature: data.temperature as number ?? null,
      reasoningEffort: (data.effort ?? data.reasoningEffort ?? data.variant) as string ?? null,
      tools: normalizeStringArray(data.tools),
      disallowedTools: normalizeStringArray(data.disallowedTools),
      permissionMode: data.permissionMode as string ?? null,
      maxTurns: data.maxTurns as number ?? null,
      timeoutMins: data.timeoutMins as number ?? null,
      background: Boolean(data.background ?? false),
      isolation: data.isolation as string ?? null,
      mcpServers: data.mcpServers as Record<string, unknown> ?? null,
      skills: normalizeStringArray(data.skills),
      hooks: data.hooks as Record<string, unknown> ?? null,
      memory: data.memory as string ?? null,
      extras: {},
      fileName: baseName,
      sourcePath: filePath,
    })
  }

  return agents
}

/** Normalize a value that could be string, string[], or null into string[] | null */
function normalizeStringArray(val: unknown): string[] | null {
  if (val === null || val === undefined) return null
  if (typeof val === 'string') return [val]
  if (Array.isArray(val)) return val.map(String)
  return null
}
