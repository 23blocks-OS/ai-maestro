/**
 * Shared emitter logic: emit skills and agents to markdown files.
 * Ported from crucible emitters/shared.js + agents/emitters/shared.js.
 */

import type {
  ConvertedFile, SkillIR, AgentIR, InstructionIR,
  MCPIR, CommandIR, HookIR, ConversionProvenance, ProviderId
} from '../types'
import { stringifyFrontmatter, stripClientSpecificFields } from '../utils/frontmatter'

/**
 * Emit a skill as a SKILL.md ConvertedFile.
 * Builds frontmatter from IR, applies provenance, returns file.
 */
export function emitSkill(
  skill: SkillIR,
  outputPath: string,
  options: {
    fieldsToStrip?: string[]
    extraFrontmatter?: Record<string, unknown>
    provenance?: ConversionProvenance
  } = {}
): ConvertedFile {
  const warnings: string[] = []

  // Guard: required fields must be non-empty
  if (!skill.name) warnings.push(`Skill has empty name — using dirName "${skill.dirName}"`)
  if (!skill.description) warnings.push(`Skill "${skill.name || skill.dirName}" has empty description`)
  if (skill.description && skill.description.length > 250) {
    warnings.push(`Skill "${skill.name}" description is ${skill.description.length} chars (Claude Code caps /skills listing at 250)`)
  }

  let fm: Record<string, unknown> = {
    name: skill.name || skill.dirName,
    description: skill.description || `Skill: ${skill.name || skill.dirName}`,
  }

  // Add optional fields if present
  if (skill.userInvokable) fm['user-invocable'] = skill.userInvokable
  if (skill.args.length > 0) fm.args = skill.args
  if (skill.license) fm.license = skill.license
  if (skill.compatibility) fm.compatibility = skill.compatibility
  if (skill.metadata) fm.metadata = skill.metadata
  if (skill.allowedTools) fm['allowed-tools'] = skill.allowedTools
  if (skill.paths) fm.paths = skill.paths

  // Apply extra frontmatter
  if (options.extraFrontmatter) {
    fm = { ...fm, ...options.extraFrontmatter }
  }

  // Strip client-specific fields
  if (options.fieldsToStrip) {
    fm = stripClientSpecificFields(fm, options.fieldsToStrip)
  }

  const content = stringifyFrontmatter(fm, skill.body, options.provenance)

  return { path: outputPath, content, type: 'skills', warnings }
}

/**
 * Emit a skill's auxiliary files (references, scripts, assets).
 */
export function emitSkillAuxFiles(
  skill: SkillIR,
  baseDir: string
): ConvertedFile[] {
  const files: ConvertedFile[] = []

  // References
  for (const ref of skill.references) {
    files.push({
      path: `${baseDir}/${ref.path}`,
      content: ref.content,
      type: 'skills',
      warnings: [],
    })
  }

  // Auxiliary files
  for (const aux of skill.auxFiles) {
    files.push({
      path: `${baseDir}/${aux.relativePath}`,
      content: aux.content,
      type: 'skills',
      warnings: [],
    })
  }

  return files
}

/**
 * Emit an agent as a markdown file with YAML frontmatter.
 */
export function emitMarkdownAgent(
  agent: AgentIR,
  outputPath: string,
  options: {
    fieldsToInclude?: string[]
    fieldMapping?: Record<string, string>
    provenance?: ConversionProvenance
  } = {}
): ConvertedFile {
  const warnings: string[] = []

  // Guard: required fields must be non-empty
  if (!agent.name) warnings.push(`Agent has empty name — using fileName "${agent.fileName}"`)
  if (!agent.description) warnings.push(`Agent "${agent.name || agent.fileName}" has empty description`)

  const fm: Record<string, unknown> = {
    name: agent.name || agent.fileName,
    description: agent.description || `Agent: ${agent.name || agent.fileName}`,
  }

  // Standard agent fields
  if (agent.model) fm.model = agent.model
  if (agent.temperature !== null) fm.temperature = agent.temperature
  if (agent.reasoningEffort) fm.effort = agent.reasoningEffort
  if (agent.tools) fm.tools = agent.tools
  if (agent.disallowedTools) fm.disallowedTools = agent.disallowedTools
  if (agent.permissionMode) fm.permissionMode = agent.permissionMode
  if (agent.maxTurns !== null) fm.maxTurns = agent.maxTurns
  if (agent.timeoutMins !== null) fm.timeoutMins = agent.timeoutMins
  if (agent.background) fm.background = agent.background
  if (agent.isolation) fm.isolation = agent.isolation
  if (agent.mcpServers) fm.mcpServers = agent.mcpServers
  if (agent.skills) fm.skills = agent.skills
  if (agent.hooks) fm.hooks = agent.hooks
  if (agent.memory) fm.memory = agent.memory

  // Apply field name mapping (e.g., effort → variant for OpenCode)
  if (options.fieldMapping) {
    for (const [from, to] of Object.entries(options.fieldMapping)) {
      if (fm[from] !== undefined) {
        fm[to] = fm[from]
        delete fm[from]
      }
    }
  }

  const content = stringifyFrontmatter(fm, agent.body, options.provenance)
  return { path: outputPath, content, type: 'agents', warnings }
}

/**
 * Build argument-hint string from args array.
 * Used by Codex and Copilot emitters.
 */
export function buildArgumentHint(args: { name: string; required: boolean }[]): string {
  return args.map(a => a.required ? `<${a.name}>` : `[${a.name}]`).join(' ')
}
