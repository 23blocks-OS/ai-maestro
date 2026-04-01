/**
 * Main Conversion Orchestrator
 *
 * Pipeline: Input → Auto-detect → Parse → Rewrite → Emit → Output
 *
 * This is the primary entry point for the conversion library.
 * Combines crucible's IR hub architecture with acplugin's element breadth.
 */

import type {
  ConvertOptions, ConvertResult, ConvertedFile, ProjectIR,
  ElementType, ProviderId, SkillIR, AgentIR
} from './types'
import { getProvider } from './registry'
import { detectProvider, parseGitHubUrl } from './detect'
import { getParser } from './parsers'
import { getEmitter } from './emitters'
import { rewriteSkillBodies } from './rewrite/args'
import { rewriteBody } from './rewrite/body'
import { rewriteAgentModels } from './rewrite/model'
import { rewriteAgentTools } from './rewrite/tools'
import { WarningCollector } from './utils/warnings'
import { writeFile } from './utils/fs'
import { resolveHomePath } from './registry'
import path from 'path'

/**
 * Convert elements from one AI coding client to another.
 *
 * @example
 * // Convert all Claude skills to Codex format
 * const result = await convert({
 *   dir: '/path/to/project',
 *   to: 'codex',
 *   scope: 'user',
 * })
 */
export async function convert(options: ConvertOptions): Promise<ConvertResult> {
  const warnings = new WarningCollector()

  // 1. Resolve source directory
  let sourceDir = resolveHomePath(options.dir)
  sourceDir = path.resolve(sourceDir)

  // 2. Auto-detect source provider if not specified
  let fromId = options.from
  if (!fromId) {
    const detected = await detectProvider(sourceDir)
    if (!detected.provider) {
      return {
        ok: false,
        error: `Could not auto-detect source client for: ${sourceDir}`,
        files: [], warnings: [], elements: emptyElements(),
        sourceProvider: 'claude-code', targetProvider: options.to,
      }
    }
    fromId = detected.provider
  }

  const sourceProvider = getProvider(fromId)
  const targetProvider = getProvider(options.to)

  if (!sourceProvider) {
    return { ok: false, error: `Unknown source provider: ${fromId}`, files: [], warnings: [], elements: emptyElements(), sourceProvider: fromId, targetProvider: options.to }
  }
  if (!targetProvider) {
    return { ok: false, error: `Unknown target provider: ${options.to}`, files: [], warnings: [], elements: emptyElements(), sourceProvider: fromId, targetProvider: options.to }
  }

  if (sourceProvider.id === targetProvider.id) {
    return { ok: false, error: 'Source and target provider are the same', files: [], warnings: [], elements: emptyElements(), sourceProvider: fromId, targetProvider: options.to }
  }

  // 3. Parse source directory
  const parser = await getParser(fromId)
  if (!parser) {
    return { ok: false, error: `No parser available for: ${fromId}`, files: [], warnings: [], elements: emptyElements(), sourceProvider: fromId, targetProvider: options.to }
  }

  let project: ProjectIR
  try {
    project = await parser.parse(sourceDir)
  } catch (err) {
    return { ok: false, error: `Parse error: ${err instanceof Error ? err.message : String(err)}`, files: [], warnings: [], elements: emptyElements(), sourceProvider: fromId, targetProvider: options.to }
  }

  // 4. Filter to requested element types
  if (options.elements) {
    const keep = new Set(options.elements)
    if (!keep.has('skills')) project.skills = []
    if (!keep.has('agents')) project.agents = []
    if (!keep.has('instructions')) project.instructions = []
    if (!keep.has('mcp')) project.mcp = null
    if (!keep.has('commands')) project.commands = []
    if (!keep.has('hooks')) project.hooks = []
  }

  // 5. Apply rewriters
  // Skills: body text + arg syntax rewriting
  project.skills = rewriteSkillBodies(project.skills, sourceProvider, targetProvider, warnings)

  // Agents: body text + model mapping + tool mapping
  project.agents = project.agents.map(agent => ({
    ...agent,
    body: rewriteBody(agent.body, sourceProvider, targetProvider),
  }))
  project.agents = rewriteAgentModels(project.agents, sourceProvider, targetProvider, warnings)
  project.agents = rewriteAgentTools(project.agents, sourceProvider, targetProvider, warnings)

  // Instructions: body text rewriting
  project.instructions = project.instructions.map(inst => ({
    ...inst,
    content: rewriteBody(inst.content, sourceProvider, targetProvider),
  }))

  // 6. Emit to target format
  const emitter = await getEmitter(options.to)
  if (!emitter) {
    return { ok: false, error: `No emitter available for: ${options.to}`, files: [], warnings: warnings.getWarnings(), elements: emptyElements(), sourceProvider: fromId, targetProvider: options.to }
  }

  const files = emitter.emit(project, { scope: options.scope, projectDir: options.projectDir })

  // 7. Write to disk (unless dry run)
  if (!options.dryRun) {
    const outputRoot = getOutputRoot(options, targetProvider)
    for (const file of files) {
      const fullPath = path.join(outputRoot, file.path)
      if (!options.force) {
        const { fileExists } = await import('./utils/fs')
        if (await fileExists(fullPath)) {
          file.warnings.push(`Skipped (exists): ${file.path}`)
          continue
        }
      }
      await writeFile(fullPath, file.content)
    }
  }

  // 8. Build result
  const elements: Record<ElementType, number> = emptyElements()
  for (const file of files) {
    elements[file.type] = (elements[file.type] || 0) + 1
  }

  return {
    ok: true,
    files,
    warnings: warnings.getWarnings(),
    elements,
    sourceProvider: fromId,
    targetProvider: options.to,
  }
}

/** Convenience: scan a directory and return all detected elements as IR */
export async function scan(dir: string, sourceProvider?: ProviderId): Promise<ProjectIR | null> {
  const resolved = resolveHomePath(dir)
  let providerId = sourceProvider
  if (!providerId) {
    const detected = await detectProvider(resolved)
    providerId = detected.provider ?? undefined
  }
  if (!providerId) return null

  const parser = await getParser(providerId)
  if (!parser) return null

  return parser.parse(path.resolve(resolved))
}

/** Determine output root directory based on scope */
function getOutputRoot(options: ConvertOptions, _targetProvider: { userConfigDir: string }): string {
  if (options.scope === 'user') {
    // User scope: emitter paths are relative (e.g., '.claude/skills/foo/SKILL.md')
    // so the root is HOME — the emitter's path includes the client dir prefix
    return process.env.HOME || '/root'
  }
  // Project scope: write relative to project dir
  return options.projectDir || process.cwd()
}

function emptyElements(): Record<ElementType, number> {
  return { skills: 0, agents: 0, instructions: 0, mcp: 0, commands: 0, hooks: 0 }
}
