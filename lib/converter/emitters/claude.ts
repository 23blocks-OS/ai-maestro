/**
 * Claude Code Emitter — emit all element types to Claude format.
 *
 * Claude Code is the richest target — nothing is lossy.
 * Ported from crucible emitters/claude-code.js.
 */

import type {
  Emitter, ProjectIR, ConvertedFile, ConversionProvenance
} from '../types'
import { emitSkill, emitSkillAuxFiles, emitMarkdownAgent } from './shared'
import { stringifyFrontmatter } from '../utils/frontmatter'

function getProvenance(sourceProvider: string): ConversionProvenance {
  return {
    from: sourceProvider as ConversionProvenance['from'],
    date: new Date().toISOString(),
  }
}

const claudeEmitter: Emitter = {
  providerId: 'claude-code',

  emit(project: ProjectIR): ConvertedFile[] {
    const files: ConvertedFile[] = []
    const provenance = project.sourceProvider !== 'claude-code'
      ? getProvenance(project.sourceProvider)
      : undefined

    // Skills
    for (const skill of project.skills) {
      const skillPath = `.claude/skills/${skill.dirName}/SKILL.md`
      files.push(emitSkill(skill, skillPath, { provenance }))
      files.push(...emitSkillAuxFiles(skill, `.claude/skills/${skill.dirName}`))
    }

    // Agents
    for (const agent of project.agents) {
      const agentPath = `.claude/agents/${agent.fileName}.md`
      files.push(emitMarkdownAgent(agent, agentPath, { provenance }))
    }

    // Instructions
    for (const instruction of project.instructions) {
      if (instruction.isRule) {
        files.push({
          path: `.claude/rules/${instruction.fileName}`,
          content: instruction.content,
          type: 'instructions',
          warnings: [],
        })
      } else {
        files.push({
          path: instruction.fileName === 'CLAUDE.md' ? 'CLAUDE.md' : `.claude/${instruction.fileName}`,
          content: instruction.content,
          type: 'instructions',
          warnings: [],
        })
      }
    }

    // MCP
    if (project.mcp && project.mcp.servers.length > 0) {
      const mcpServers: Record<string, Record<string, unknown>> = {}
      for (const server of project.mcp.servers) {
        const def: Record<string, unknown> = {}
        if (server.command) def.command = server.command
        if (server.args) def.args = server.args
        if (server.env) def.env = server.env
        if (server.url) def.url = server.url
        if (server.headers) def.headers = server.headers
        if (server.type) def.type = server.type
        mcpServers[server.name] = def
      }
      files.push({
        path: '.mcp.json',
        content: JSON.stringify({ mcpServers }, null, 2),
        type: 'mcp',
        warnings: [],
      })
    }

    // Commands
    for (const cmd of project.commands) {
      files.push({
        path: `.claude/commands/${cmd.name}.md`,
        content: cmd.content,
        type: 'commands',
        warnings: [],
      })
    }

    // Hooks
    if (project.hooks.length > 0) {
      const hooksConfig: Record<string, Array<{ matcher?: string; hooks: Array<{ type: string; command?: string; url?: string }> }>> = {}
      for (const hook of project.hooks) {
        if (!hooksConfig[hook.event]) {
          hooksConfig[hook.event] = []
        }
        // Group by matcher
        let group = hooksConfig[hook.event].find(g => g.matcher === hook.matcher)
        if (!group) {
          group = { matcher: hook.matcher, hooks: [] }
          hooksConfig[hook.event].push(group)
        }
        const hookDef: { type: string; command?: string; url?: string } = { type: hook.type }
        if (hook.command) hookDef.command = hook.command
        if (hook.url) hookDef.url = hook.url
        group.hooks.push(hookDef)
      }

      // Merge into settings.json structure
      files.push({
        path: '.claude/settings.local.json',
        content: JSON.stringify({ hooks: hooksConfig }, null, 2),
        type: 'hooks',
        warnings: ['Hooks written to .claude/settings.local.json — merge manually with existing settings'],
      })
    }

    return files
  },
}

export default claudeEmitter
