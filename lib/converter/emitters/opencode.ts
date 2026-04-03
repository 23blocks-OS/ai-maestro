/**
 * OpenCode Emitter — near-full parity with Claude for skills.
 * Agents use 'variant' instead of 'effort', 'steps' instead of 'maxTurns',
 * tools as object map {name: bool} instead of array.
 * Instructions to AGENTS.md. MCP to opencode.json.
 */

import type { Emitter, ProjectIR, ConvertedFile, ConversionProvenance } from '../types'
import { emitSkill, emitSkillAuxFiles, emitMarkdownAgent } from './shared'
import { WarningCollector } from '../utils/warnings'

function getProvenance(sourceProvider: string): ConversionProvenance {
  return { from: sourceProvider as ConversionProvenance['from'], date: new Date().toISOString() }
}

const opencodeEmitter: Emitter = {
  providerId: 'opencode',
  emit(project: ProjectIR): ConvertedFile[] {
    const files: ConvertedFile[] = []
    const warnings = new WarningCollector()
    const provenance = project.sourceProvider !== 'opencode' ? getProvenance(project.sourceProvider) : undefined

    // Skills — near-full parity, same fields as Claude (except paths)
    for (const skill of project.skills) {
      if (skill.paths) warnings.lossyField(skill.name, 'paths', 'OpenCode does not support paths globs')
      const skillPath = `.opencode/skills/${skill.dirName}/SKILL.md`
      files.push(emitSkill(skill, skillPath, { fieldsToStrip: ['paths'], provenance }))
      files.push(...emitSkillAuxFiles(skill, `.opencode/skills/${skill.dirName}`))
    }

    // Agents — markdown, field name mapping
    for (const agent of project.agents) {
      if (agent.background) warnings.lossyField(agent.name, 'background', 'OpenCode does not support background agents')
      if (agent.isolation) warnings.lossyField(agent.name, 'isolation', 'OpenCode does not support isolation')
      if (agent.hooks) warnings.lossyField(agent.name, 'hooks', 'OpenCode: use plugin system for hooks')
      const agentPath = `.opencode/agents/${agent.fileName}.md`
      files.push(emitMarkdownAgent(agent, agentPath, {
        fieldMapping: { 'effort': 'variant', 'maxTurns': 'steps' },
        provenance,
      }))
    }

    // Instructions → AGENTS.md
    if (project.instructions.length > 0) {
      const sections = project.instructions.map(inst =>
        inst.isRule ? `## Rule: ${inst.fileName.replace(/\.md$/, '')}\n\n${inst.content}` : inst.content
      )
      files.push({ path: 'AGENTS.md', content: sections.join('\n\n---\n\n'), type: 'instructions', warnings: [] })
    }

    // MCP → opencode.json
    if (project.mcp && project.mcp.servers.length > 0) {
      const mcpSection: Record<string, Record<string, unknown>> = {}
      for (const s of project.mcp.servers) {
        const def: Record<string, unknown> = {}
        if (s.command) { def.command = s.command; def.type = 'local' }
        if (s.args) def.args = s.args
        if (s.env) def.env = s.env
        if (s.url) { def.url = s.url; def.type = 'remote' }
        mcpSection[s.name] = def
      }
      files.push({
        path: 'opencode.json',
        content: JSON.stringify({ mcp: mcpSection }, null, 2),
        type: 'mcp',
        warnings: ['MCP written to opencode.json — merge manually with existing config'],
      })
    }

    // Commands → .opencode/commands/
    for (const cmd of project.commands) {
      files.push({ path: `.opencode/commands/${cmd.name}.md`, content: cmd.content, type: 'commands', warnings: [] })
    }

    if (warnings.hasWarnings() && files.length > 0) files[0].warnings.push(...warnings.getWarnings())
    return files
  },
}

export default opencodeEmitter
