/**
 * Gemini CLI Emitter — emit skills, agents, instructions, MCP to Gemini format.
 *
 * Gemini is lossy: skills drop most frontmatter, args collapse to {{args}},
 * instructions go to GEMINI.md, MCP to settings.json.
 */

import type { Emitter, ProjectIR, ConvertedFile, ConversionProvenance, SkillIR } from '../types'
import { emitSkill, emitSkillAuxFiles, emitMarkdownAgent } from './shared'
import { WarningCollector } from '../utils/warnings'

const GEMINI_STRIP_FIELDS = ['allowed-tools', 'compatibility', 'metadata', 'license', 'context', 'agent', 'effort', 'model', 'hooks', 'user-invocable', 'args']

function getProvenance(sourceProvider: string): ConversionProvenance {
  return { from: sourceProvider as ConversionProvenance['from'], date: new Date().toISOString() }
}

/** Collapse all {{argname}} placeholders to {{args}} */
function collapseArgsToGemini(body: string): string {
  const seen = new Set<string>()
  return body.replace(/\{\{([^}]+)\}\}/g, (match, argName: string) => {
    const trimmed = argName.trim().toLowerCase()
    if (trimmed === 'args') return match // Already collapsed
    if (seen.has('collapsed')) return '' // Remove subsequent named args
    seen.add('collapsed')
    return '{{args}}'
  })
}

const geminiEmitter: Emitter = {
  providerId: 'gemini',
  emit(project: ProjectIR): ConvertedFile[] {
    const files: ConvertedFile[] = []
    const warnings = new WarningCollector()
    const provenance = project.sourceProvider !== 'gemini' ? getProvenance(project.sourceProvider) : undefined

    // Skills — minimal frontmatter, collapse args
    for (const skill of project.skills) {
      if (skill.args.length > 0) warnings.lossyField(skill.name, 'args', 'Gemini collapses named args to {{args}}')
      if (skill.allowedTools) warnings.lossyField(skill.name, 'allowed-tools', 'Gemini does not support tool whitelists')
      if (skill.license) warnings.lossyField(skill.name, 'license', 'Gemini does not support license field')
      if (skill.metadata) warnings.lossyField(skill.name, 'metadata', 'Gemini does not support metadata')

      const transformed: SkillIR = {
        ...skill,
        body: skill.userInvokable ? collapseArgsToGemini(skill.body) : skill.body,
      }
      const skillPath = `.gemini/skills/${skill.dirName}/SKILL.md`
      files.push(emitSkill(transformed, skillPath, { fieldsToStrip: GEMINI_STRIP_FIELDS, provenance }))
      files.push(...emitSkillAuxFiles(skill, `.gemini/skills/${skill.dirName}`))
    }

    // Agents — markdown, limited fields
    for (const agent of project.agents) {
      if (agent.permissionMode) warnings.lossyField(agent.name, 'permissionMode', 'Gemini agents do not support permissionMode')
      if (agent.hooks) warnings.lossyField(agent.name, 'hooks', 'Gemini agents: use settings.json for hooks')
      const agentPath = `.gemini/agents/${agent.fileName}.md`
      files.push(emitMarkdownAgent(agent, agentPath, {
        fieldMapping: { 'maxTurns': 'max_turns', 'timeoutMins': 'timeout_mins' },
        provenance,
      }))
    }

    // Instructions → GEMINI.md
    if (project.instructions.length > 0) {
      const sections = project.instructions.map(inst =>
        inst.isRule ? `## Rule: ${inst.fileName.replace(/\.md$/, '')}\n\n${inst.content}` : inst.content
      )
      files.push({ path: 'GEMINI.md', content: sections.join('\n\n---\n\n'), type: 'instructions', warnings: [] })
    }

    // MCP → settings.json
    if (project.mcp && project.mcp.servers.length > 0) {
      const mcpServers: Record<string, Record<string, unknown>> = {}
      for (const s of project.mcp.servers) {
        const def: Record<string, unknown> = {}
        if (s.command) def.command = s.command
        if (s.args) def.args = s.args
        if (s.env) def.env = s.env
        if (s.url) def.url = s.url
        mcpServers[s.name] = def
      }
      files.push({
        path: '.gemini/settings.json',
        content: JSON.stringify({ mcpServers }, null, 2),
        type: 'mcp',
        warnings: ['MCP written to .gemini/settings.json — merge manually with existing settings'],
      })
    }

    // Commands → .gemini/commands/ (keep as-is, Gemini supports TOML commands)
    for (const cmd of project.commands) {
      files.push({ path: `.gemini/commands/${cmd.name}.md`, content: cmd.content, type: 'commands', warnings: [] })
    }

    if (warnings.hasWarnings() && files.length > 0) files[0].warnings.push(...warnings.getWarnings())
    return files
  },
}

export default geminiEmitter
