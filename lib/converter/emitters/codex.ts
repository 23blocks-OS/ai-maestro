/**
 * Codex Emitter — emit skills, agents, instructions, MCP, hooks to Codex format.
 *
 * Key format differences:
 * - Skills: argument-hint frontmatter, $ARGNAME body syntax
 * - Agents: TOML files with developer_instructions, sandbox_mode
 * - Instructions: AGENTS.md (merged from multiple sources)
 * - MCP: config.toml [mcp_servers.X] sections
 * - Hooks: hooks.json
 *
 * Ported from crucible emitters/codex.js + agents/emitters/codex.js + acplugin converter/mcp.ts.
 */

import type { Emitter, ProjectIR, ConvertedFile, ConversionProvenance, SkillIR } from '../types'
import { emitSkill, emitSkillAuxFiles, buildArgumentHint } from './shared'
import { parseFrontmatter as parseFrontmatterUtil } from '../utils/frontmatter'
import { stringifyToml } from '../utils/toml'
import { WarningCollector } from '../utils/warnings'

/** Claude-specific frontmatter fields not supported by Codex */
const CODEX_STRIP_FIELDS = ['allowed-tools', 'compatibility', 'metadata', 'context', 'agent', 'effort', 'model', 'hooks', 'user-invocable', 'args']

/** Permission mode mapping: Claude → Codex */
const PERMISSION_TO_SANDBOX: Record<string, string> = {
  'plan': 'read-only',
  'dontAsk': 'workspace-write',
  'bypassPermissions': 'danger-full-access',
}

function getProvenance(sourceProvider: string): ConversionProvenance {
  return { from: sourceProvider as ConversionProvenance['from'], date: new Date().toISOString() }
}

/** Transform {{argname}} → $ARGNAME in body text */
function transformBodyToCodex(body: string): string {
  return body.replace(/\{\{([^}]+)\}\}/g, (_match, argName: string) => {
    return `$${argName.trim().toUpperCase()}`
  })
}

/** Warn about lossy fields when converting to Codex */
function warnLossySkill(skill: SkillIR, warnings: WarningCollector): void {
  if (skill.allowedTools) warnings.lossyField(skill.name, 'allowed-tools', 'Codex does not support tool whitelists')
  if (skill.compatibility) warnings.lossyField(skill.name, 'compatibility', 'Codex does not support compatibility field')
  if (skill.metadata) warnings.lossyField(skill.name, 'metadata', 'Codex does not support metadata field')
}

const codexEmitter: Emitter = {
  providerId: 'codex',

  emit(project: ProjectIR): ConvertedFile[] {
    const files: ConvertedFile[] = []
    const warnings = new WarningCollector()
    const provenance = project.sourceProvider !== 'codex'
      ? getProvenance(project.sourceProvider)
      : undefined

    // ═══ Skills ═══
    for (const skill of project.skills) {
      warnLossySkill(skill, warnings)

      // Build Codex-specific frontmatter
      const extraFm: Record<string, unknown> = {}
      if (skill.userInvokable && skill.args.length > 0) {
        extraFm['argument-hint'] = buildArgumentHint(skill.args)
      }

      // Transform body: {{argname}} → $ARGNAME
      const transformedSkill: SkillIR = {
        ...skill,
        body: skill.userInvokable ? transformBodyToCodex(skill.body) : skill.body,
      }

      const skillPath = `.agents/skills/${skill.dirName}/SKILL.md`
      files.push(emitSkill(transformedSkill, skillPath, {
        fieldsToStrip: CODEX_STRIP_FIELDS,
        extraFrontmatter: extraFm,
        provenance,
      }))
      files.push(...emitSkillAuxFiles(skill, `.agents/skills/${skill.dirName}`))
    }

    // ═══ Agents (TOML) ═══
    for (const agent of project.agents) {
      const tomlData: Record<string, unknown> = {
        name: agent.name,
        description: agent.description,
      }

      if (agent.body) tomlData.developer_instructions = agent.body
      if (agent.model) tomlData.model = agent.model
      if (agent.reasoningEffort) tomlData.model_reasoning_effort = agent.reasoningEffort
      if (agent.permissionMode) {
        tomlData.sandbox_mode = PERMISSION_TO_SANDBOX[agent.permissionMode] ?? 'workspace-write'
      }

      // Warn about unsupported agent fields
      if (agent.temperature !== null) warnings.lossyField(agent.name, 'temperature', 'Codex agents do not support temperature')
      if (agent.tools) warnings.lossyField(agent.name, 'tools', 'Codex agents do not support tool whitelists')
      if (agent.maxTurns !== null) warnings.lossyField(agent.name, 'maxTurns', 'Codex agents do not support maxTurns')
      if (agent.hooks) warnings.lossyField(agent.name, 'hooks', 'Codex agents: inline hooks not supported, use hooks.json')
      if (agent.mcpServers) warnings.lossyField(agent.name, 'mcpServers', 'Codex agents: inline MCP not supported, use config.toml')

      try {
        files.push({
          path: `.codex/agents/${agent.fileName}.toml`,
          content: stringifyToml(tomlData),
          type: 'agents',
          warnings: [],
        })
      } catch {
        warnings.add(`Agent "${agent.name}": TOML serialization failed`)
      }
    }

    // ═══ Instructions → AGENTS.md ═══
    if (project.instructions.length > 0) {
      const sections: string[] = []
      for (const inst of project.instructions) {
        if (inst.isRule) {
          sections.push(`## Rule: ${inst.fileName.replace(/\.md$/, '')}\n\n${inst.content}`)
        } else {
          sections.push(inst.content)
        }
      }
      files.push({
        path: 'AGENTS.md',
        content: sections.join('\n\n---\n\n'),
        type: 'instructions',
        warnings: [],
      })
    }

    // ═══ MCP → config.toml section ═══
    if (project.mcp && project.mcp.servers.length > 0) {
      const mcpSection: Record<string, Record<string, unknown>> = {}
      for (const server of project.mcp.servers) {
        const def: Record<string, unknown> = {}
        if (server.command) def.command = server.command
        if (server.args) def.args = server.args
        if (server.env) def.env = server.env
        if (server.url) def.url = server.url
        if (server.headers) def.http_headers = server.headers
        mcpSection[server.name] = def
      }

      try {
        const tomlContent = stringifyToml({ mcp_servers: mcpSection })
        files.push({
          path: '.codex/config.toml',
          content: `# MCP servers converted from ${project.sourceProvider}\n${tomlContent}`,
          type: 'mcp',
          warnings: ['MCP config written to .codex/config.toml — merge manually with existing config'],
        })
      } catch {
        warnings.add('MCP TOML serialization failed')
      }
    }

    // ═══ Commands → Skills (Codex has no commands, convert to skills) ═══
    for (const cmd of project.commands) {
      warnings.lossyElement('commands', cmd.name, 'Codex does not support slash commands — converted to skill')
      // Strip original frontmatter from command content to avoid double frontmatter
      const parsed = parseFrontmatterUtil(cmd.content)
      const desc = String(parsed.data.description || `Converted from command /${cmd.name}`)
      const body = parsed.body || cmd.content
      files.push({
        path: `.agents/skills/${cmd.name}/SKILL.md`,
        content: `---\nname: ${cmd.name}\ndescription: "${desc.replace(/"/g, '\\"')}"\n---\n\n${body}`,
        type: 'commands',
        warnings: [`Command "/${cmd.name}" converted to skill (Codex has no native commands)`],
      })
    }

    // ═══ Hooks → hooks.json ═══
    if (project.hooks.length > 0) {
      const hooksConfig: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command?: string }> }>> = {}
      for (const hook of project.hooks) {
        if (!hooksConfig[hook.event]) hooksConfig[hook.event] = []
        let group = hooksConfig[hook.event].find(g => g.matcher === hook.matcher)
        if (!group) {
          group = { matcher: hook.matcher, hooks: [] }
          hooksConfig[hook.event].push(group)
        }
        group.hooks.push({ type: hook.type, command: hook.command })
      }
      files.push({
        path: '.codex/hooks.json',
        content: JSON.stringify({ hooks: hooksConfig }, null, 2),
        type: 'hooks',
        warnings: ['Hooks converted to .codex/hooks.json — verify event names match Codex conventions'],
      })
    }

    // Attach global warnings to the first file (or create a warnings file)
    if (warnings.hasWarnings()) {
      const w = warnings.getWarnings()
      if (files.length > 0) {
        files[0].warnings.push(...w)
      }
    }

    return files
  },
}

export default codexEmitter
