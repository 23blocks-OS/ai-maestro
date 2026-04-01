/**
 * Claude Code Parser — parses all 6 element types from a Claude project.
 *
 * Claude Code is the richest source — it supports every IR field natively.
 * Ported from crucible parsers/claude-code.js + acplugin scanner/claude.ts.
 */

import path from 'path'
import type {
  Parser, ProjectIR, SkillIR, AgentIR, InstructionIR,
  MCPIR, MCPServerDef, CommandIR, HookIR
} from '../types'
import { parseSkillsDir, normalizeArgs, parseMarkdownAgentsDir } from './shared'
import { readFileOr } from '../utils/fs'

/** Map Claude frontmatter + body into SkillIR */
function mapSkillToIR(
  dirName: string,
  fm: Record<string, unknown>,
  body: string,
  refs: { path: string; content: string }[],
  auxFiles: { relativePath: string; content: string }[],
  sourcePath: string
): SkillIR {
  return {
    name: String(fm.name ?? dirName),
    description: String(fm.description ?? ''),
    userInvokable: Boolean(fm['user-invocable'] ?? false),
    args: normalizeArgs(fm.args),
    license: fm.license as string ?? null,
    compatibility: fm.compatibility as string ?? null,
    metadata: fm.metadata as Record<string, string> ?? null,
    allowedTools: fm['allowed-tools'] as string ?? null,
    body,
    references: refs,
    auxFiles,
    dirName,
    sourcePath,
  }
}

/** Scan instructions: CLAUDE.md, .claude/CLAUDE.md, .claude/rules/*.md */
async function scanInstructions(rootDir: string): Promise<InstructionIR[]> {
  const instructions: InstructionIR[] = []

  for (const name of ['CLAUDE.md', '.claude/CLAUDE.md']) {
    const filePath = path.join(rootDir, name)
    const content = await readFileOr(filePath)
    if (content) {
      instructions.push({ fileName: path.basename(name), content, isRule: false, sourcePath: filePath })
    }
  }

  // Rules directory
  const rulesDir = path.join(rootDir, '.claude', 'rules')
  try {
    const { readdir } = await import('fs/promises')
    const entries = await readdir(rulesDir)
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      const filePath = path.join(rulesDir, entry)
      const content = await readFileOr(filePath)
      if (content) {
        instructions.push({ fileName: entry, content, isRule: true, sourcePath: filePath })
      }
    }
  } catch { /* rules dir doesn't exist */ }

  return instructions
}

/** Scan .mcp.json for MCP server definitions */
async function scanMCP(rootDir: string): Promise<MCPIR | null> {
  const mcpPath = path.join(rootDir, '.mcp.json')
  const content = await readFileOr(mcpPath)
  if (!content) return null

  try {
    const data = JSON.parse(content)
    const mcpServers = data.mcpServers || {}
    const servers: MCPServerDef[] = Object.entries(mcpServers).map(
      ([name, config]) => {
        const c = config as Record<string, unknown>
        return {
          name,
          command: c.command as string | undefined,
          args: c.args as string[] | undefined,
          env: c.env as Record<string, string> | undefined,
          type: c.type as string | undefined,
          url: c.url as string | undefined,
          headers: c.headers as Record<string, string> | undefined,
        }
      }
    )
    return { servers, sourcePath: mcpPath }
  } catch {
    return null
  }
}

/** Scan .claude/commands/ for slash commands */
async function scanCommands(rootDir: string): Promise<CommandIR[]> {
  const commandsDir = path.join(rootDir, '.claude', 'commands')
  const commands: CommandIR[] = []
  try {
    const { readdir } = await import('fs/promises')
    const entries = await readdir(commandsDir)
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      const filePath = path.join(commandsDir, entry)
      const content = await readFileOr(filePath)
      if (content) {
        commands.push({ name: entry.replace(/\.md$/, ''), content, sourcePath: filePath })
      }
    }
  } catch { /* commands dir doesn't exist */ }
  return commands
}

/** Scan commands/ at plugin root (flat layout) */
async function scanCommandsFlat(rootDir: string): Promise<CommandIR[]> {
  const commandsDir = path.join(rootDir, 'commands')
  const commands: CommandIR[] = []
  try {
    const { readdir } = await import('fs/promises')
    const entries = await readdir(commandsDir)
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      const filePath = path.join(commandsDir, entry)
      const content = await readFileOr(filePath)
      if (content) {
        commands.push({ name: entry.replace(/\.md$/, ''), content, sourcePath: filePath })
      }
    }
  } catch { /* commands dir doesn't exist */ }
  return commands
}

/** Scan hooks from .claude/settings.json */
async function scanHooks(rootDir: string): Promise<HookIR[]> {
  const hooks: HookIR[] = []

  // Try settings.json
  const settingsPath = path.join(rootDir, '.claude', 'settings.json')
  const settingsContent = await readFileOr(settingsPath)
  if (settingsContent) {
    try {
      const data = JSON.parse(settingsContent)
      if (data.hooks) {
        for (const [event, matchers] of Object.entries(data.hooks)) {
          if (!Array.isArray(matchers)) continue
          for (const matcher of matchers as Array<{ matcher?: string; hooks?: Array<{ type: string; command?: string; url?: string }> }>) {
            if (!matcher.hooks || !Array.isArray(matcher.hooks)) continue
            for (const hook of matcher.hooks) {
              hooks.push({
                event,
                matcher: matcher.matcher,
                type: hook.type || 'command',
                command: hook.command,
                url: hook.url,
              })
            }
          }
        }
      }
    } catch { /* invalid JSON */ }
  }

  return hooks
}

/** Claude Code parser — all 6 element types */
const claudeParser: Parser = {
  providerId: 'claude-code',

  async parse(dir: string): Promise<ProjectIR> {
    // Detect layout: project (.claude/skills/) vs plugin (skills/ at root)
    const { fileExists } = await import('../utils/fs')
    const isPluginLayout = await fileExists(path.join(dir, 'skills'))
      && !await fileExists(path.join(dir, '.claude', 'skills'))

    const skillsDir = isPluginLayout
      ? path.join(dir, 'skills')
      : path.join(dir, '.claude', 'skills')
    const agentsDir = isPluginLayout
      ? path.join(dir, 'agents')
      : path.join(dir, '.claude', 'agents')

    const [skills, agents, instructions, mcp, commands, hooks] = await Promise.all([
      parseSkillsDir(skillsDir, mapSkillToIR),
      parseMarkdownAgentsDir(agentsDir),
      scanInstructions(dir),
      scanMCP(dir),
      isPluginLayout ? scanCommandsFlat(dir) : scanCommands(dir),
      scanHooks(dir),
    ])

    return {
      skills,
      agents,
      instructions,
      mcp,
      commands,
      hooks,
      sourceProvider: 'claude-code',
      rootDir: dir,
    }
  },
}

export default claudeParser
