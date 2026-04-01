/**
 * Kiro Emitter — skills (markdown), agents (JSON), MCP (mcp.json),
 * hooks (hooks.json), steering files (instructions).
 *
 * Kiro agents are JSON with file:// URI prompts and skill:// resources.
 * Kiro-specific extras (toolAliases, keyboardShortcut, etc.) are spread
 * back to top level from extras.kiro.
 */

import type { Emitter, ProjectIR, ConvertedFile, ConversionProvenance } from '../types'
import { emitSkill, emitSkillAuxFiles } from './shared'
import { WarningCollector } from '../utils/warnings'

function getProvenance(sourceProvider: string): ConversionProvenance {
  return { from: sourceProvider as ConversionProvenance['from'], date: new Date().toISOString() }
}

const kiroEmitter: Emitter = {
  providerId: 'kiro',
  emit(project: ProjectIR): ConvertedFile[] {
    const files: ConvertedFile[] = []
    const warnings = new WarningCollector()
    const provenance = project.sourceProvider !== 'kiro' ? getProvenance(project.sourceProvider) : undefined

    // Skills — markdown, minimal frontmatter
    for (const skill of project.skills) {
      if (skill.args.length > 0) warnings.lossyField(skill.name, 'args', 'Kiro does not support named args')
      if (skill.allowedTools) warnings.lossyField(skill.name, 'allowed-tools', 'Kiro does not support tool whitelists')
      const skillPath = `.kiro/skills/${skill.dirName}/SKILL.md`
      files.push(emitSkill(skill, skillPath, {
        fieldsToStrip: ['allowed-tools', 'args', 'user-invocable', 'context', 'agent', 'effort', 'model', 'hooks'],
        provenance,
      }))
      files.push(...emitSkillAuxFiles(skill, `.kiro/skills/${skill.dirName}`))
    }

    // Agents — JSON format
    for (const agent of project.agents) {
      if (agent.temperature !== null) warnings.lossyField(agent.name, 'temperature', 'Kiro agents do not support temperature')
      if (agent.reasoningEffort) warnings.lossyField(agent.name, 'reasoningEffort', 'Kiro agents do not support reasoningEffort')
      if (agent.permissionMode) warnings.lossyField(agent.name, 'permissionMode', 'Kiro agents do not support permissionMode')
      if (agent.maxTurns !== null) warnings.lossyField(agent.name, 'maxTurns', 'Kiro agents do not support maxTurns')
      if (agent.background) warnings.lossyField(agent.name, 'background', 'Kiro agents do not support background')
      if (agent.isolation) warnings.lossyField(agent.name, 'isolation', 'Kiro agents do not support isolation')
      if (agent.memory) warnings.lossyField(agent.name, 'memory', 'Kiro agents do not support memory')

      // Build Kiro JSON agent
      const agentJson: Record<string, unknown> = {
        name: agent.name,
        description: agent.description,
      }

      // Write body to a separate file and reference via file:// URI
      const promptFileName = `${agent.fileName}-prompt.md`
      if (agent.body) {
        agentJson.prompt = `file://${promptFileName}`
        files.push({
          path: `.kiro/agents/${promptFileName}`,
          content: agent.body,
          type: 'agents',
          warnings: [],
        })
      }

      if (agent.model) agentJson.model = agent.model
      if (agent.tools) agentJson.tools = agent.tools
      if (agent.mcpServers) agentJson.mcpServers = agent.mcpServers
      if (agent.hooks) agentJson.hooks = agent.hooks

      // Reconstruct skill:// resource URIs
      const resources: string[] = []
      if (agent.skills) {
        for (const skill of agent.skills) {
          resources.push(`skill://${skill}`)
        }
      }

      // Spread Kiro extras back to top level
      const kiroExtras = (agent.extras?.kiro ?? {}) as Record<string, unknown>
      for (const [key, value] of Object.entries(kiroExtras)) {
        if (key === 'resources' && Array.isArray(value)) {
          resources.push(...(value as string[]))
        } else {
          agentJson[key] = value
        }
      }

      if (resources.length > 0) agentJson.resources = resources

      files.push({
        path: `.kiro/agents/${agent.fileName}.json`,
        content: JSON.stringify(agentJson, null, 2),
        type: 'agents',
        warnings: [],
      })
    }

    // Instructions → .kiro/steering/
    for (const inst of project.instructions) {
      const fileName = inst.isRule ? inst.fileName : 'AGENTS.md'
      files.push({ path: `.kiro/steering/${fileName}`, content: inst.content, type: 'instructions', warnings: [] })
    }

    // MCP → .kiro/settings/mcp.json
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
        path: '.kiro/settings/mcp.json',
        content: JSON.stringify({ mcpServers }, null, 2),
        type: 'mcp',
        warnings: [],
      })
    }

    // Hooks → .kiro/hooks/<name>.kiro.hook (per-hook JSON files per Kiro spec)
    // Schema: { name, description, version, when: { event, matcher? }, then: { type, command? } }
    for (const hook of project.hooks) {
      const hookName = `${hook.event}${hook.matcher ? `-${hook.matcher.replace(/[^a-zA-Z0-9]/g, '-')}` : ''}`
      const hookJson: Record<string, unknown> = {
        name: hookName,
        description: `Hook for ${hook.event}${hook.matcher ? ` (${hook.matcher})` : ''}`,
        version: '1.0',
        when: {
          event: hook.event,
          ...(hook.matcher ? { matcher: hook.matcher } : {}),
        },
        then: {
          type: hook.type === 'command' ? 'shell' : hook.type,
          ...(hook.command ? { command: hook.command } : {}),
        },
      }

      files.push({
        path: `.kiro/hooks/${hookName}.kiro.hook`,
        content: JSON.stringify(hookJson, null, 2),
        type: 'hooks',
        warnings: [],
      })
    }

    // Commands → skills (Kiro has no native commands)
    for (const cmd of project.commands) {
      warnings.lossyElement('commands', cmd.name, 'Kiro does not support slash commands — converted to skill')
      files.push({
        path: `.kiro/skills/${cmd.name}/SKILL.md`,
        content: `---\nname: ${cmd.name}\ndescription: "Converted from command /${cmd.name}"\n---\n\n${cmd.content}`,
        type: 'commands',
        warnings: [`Command "/${cmd.name}" converted to skill`],
      })
    }

    if (warnings.hasWarnings() && files.length > 0) files[0].warnings.push(...warnings.getWarnings())
    return files
  },
}

export default kiroEmitter
