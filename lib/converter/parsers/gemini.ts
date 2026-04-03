/**
 * Gemini CLI Parser — parse skills, agents, instructions, MCP, commands, hooks.
 *
 * Gemini skills are minimal (name + description only in frontmatter).
 * {{args}} in body marks user-invokable but individual arg names are unrecoverable.
 * Agent frontmatter: name, description, model, temperature, max_turns, timeout_mins, tools.
 * Instructions in GEMINI.md. MCP in settings.json. Commands in .gemini/commands/ (TOML).
 */

import path from 'path'
import type { Parser, ProjectIR, SkillIR, AgentIR, InstructionIR, MCPIR, MCPServerDef, CommandIR, HookIR } from '../types'
import { parseSkillsDir, detectMustacheArgs, parseMarkdownAgentsDir } from './shared'
import { readFileOr } from '../utils/fs'

/** Map Gemini skill frontmatter to SkillIR */
function mapSkillToIR(
  dirName: string, fm: Record<string, unknown>, body: string,
  refs: { path: string; content: string }[],
  auxFiles: { relativePath: string; content: string }[],
  sourcePath: string
): SkillIR {
  const hasMustacheArgs = detectMustacheArgs(body).length > 0
  return {
    name: String(fm.name ?? dirName),
    description: String(fm.description ?? ''),
    userInvokable: hasMustacheArgs,
    args: [], // Gemini collapses to {{args}} — individual names unrecoverable
    license: null, compatibility: null, metadata: null, allowedTools: null, paths: null,
    body, references: refs, auxFiles, dirName, sourcePath,
  }
}

/** Scan GEMINI.md for instructions */
async function scanInstructions(rootDir: string): Promise<InstructionIR[]> {
  const instructions: InstructionIR[] = []
  for (const name of ['GEMINI.md', '.gemini/GEMINI.md']) {
    const filePath = path.join(rootDir, name)
    const content = await readFileOr(filePath)
    if (content) instructions.push({ fileName: path.basename(name), content, isRule: false, sourcePath: filePath })
  }
  return instructions
}

/** Scan settings.json for MCP servers */
async function scanMCP(rootDir: string): Promise<MCPIR | null> {
  for (const settingsPath of [path.join(rootDir, '.gemini', 'settings.json')]) {
    const content = await readFileOr(settingsPath)
    if (!content) continue
    try {
      const data = JSON.parse(content)
      const mcpServers = data.mcpServers || {}
      const servers: MCPServerDef[] = Object.entries(mcpServers).map(([name, config]) => {
        const c = config as Record<string, unknown>
        return { name, command: c.command as string | undefined, args: c.args as string[] | undefined, env: c.env as Record<string, string> | undefined, url: c.url as string | undefined }
      })
      if (servers.length > 0) return { servers, sourcePath: settingsPath }
    } catch { /* invalid JSON */ }
  }
  return null
}

/** Scan hooks from settings.json */
async function scanHooks(rootDir: string): Promise<HookIR[]> {
  const hooks: HookIR[] = []
  const settingsPath = path.join(rootDir, '.gemini', 'settings.json')
  const content = await readFileOr(settingsPath)
  if (!content) return hooks
  try {
    const data = JSON.parse(content)
    if (data.hooks && typeof data.hooks === 'object') {
      for (const [event, matchers] of Object.entries(data.hooks)) {
        if (!Array.isArray(matchers)) continue
        for (const m of matchers as Array<{ matcher?: string; hooks?: Array<{ type: string; command?: string }> }>) {
          if (!m.hooks) continue
          for (const h of m.hooks) {
            hooks.push({ event, matcher: m.matcher, type: h.type || 'command', command: h.command })
          }
        }
      }
    }
  } catch { /* */ }
  return hooks
}

/** Scan .gemini/commands/ (TOML format) */
async function scanCommands(rootDir: string): Promise<CommandIR[]> {
  const commands: CommandIR[] = []
  const commandsDir = path.join(rootDir, '.gemini', 'commands')
  try {
    const { readdir } = await import('fs/promises')
    const entries = await readdir(commandsDir)
    for (const entry of entries) {
      if (!entry.endsWith('.toml') && !entry.endsWith('.md')) continue
      const filePath = path.join(commandsDir, entry)
      const content = await readFileOr(filePath)
      if (content) commands.push({ name: entry.replace(/\.(toml|md)$/, ''), content, sourcePath: filePath })
    }
  } catch { /* */ }
  return commands
}

const geminiParser: Parser = {
  providerId: 'gemini',
  async parse(dir: string): Promise<ProjectIR> {
    const skillsDir = path.join(dir, '.gemini', 'skills')
    const agentsDir = path.join(dir, '.gemini', 'agents')
    const [skills, agents, instructions, mcp, commands, hooks] = await Promise.all([
      parseSkillsDir(skillsDir, mapSkillToIR),
      parseMarkdownAgentsDir(agentsDir),
      scanInstructions(dir),
      scanMCP(dir),
      scanCommands(dir),
      scanHooks(dir),
    ])
    return { skills, agents, instructions, mcp, commands, hooks, sourceProvider: 'gemini', rootDir: dir }
  },
}

export default geminiParser
