/**
 * OpenCode Parser — nearly identical to Claude for skills (same frontmatter fields).
 * Agents use markdown but with different field names (steps, variant, tools as object map).
 * Instructions in AGENTS.md. MCP in opencode.json. Commands in .opencode/commands/.
 */

import path from 'path'
import type { Parser, ProjectIR, SkillIR, AgentIR, InstructionIR, MCPIR, MCPServerDef, CommandIR, HookIR } from '../types'
import { parseSkillsDir, normalizeArgs, parseMarkdownAgentsDir, asStringOrNull, asRecordOrNull, asPathsOrNull } from './shared'
import { readFileOr } from '../utils/fs'

/** Map OpenCode skill frontmatter — same as Claude (full field support) */
function mapSkillToIR(
  dirName: string, fm: Record<string, unknown>, body: string,
  refs: { path: string; content: string }[],
  auxFiles: { relativePath: string; content: string }[],
  sourcePath: string
): SkillIR {
  return {
    name: String(fm.name ?? dirName),
    description: String(fm.description ?? ''),
    userInvokable: Boolean(fm['user-invocable'] ?? false),
    args: normalizeArgs(fm.args),
    license: asStringOrNull(fm.license),
    compatibility: asStringOrNull(fm.compatibility),
    metadata: asRecordOrNull(fm.metadata),
    allowedTools: asStringOrNull(fm['allowed-tools']),
    paths: asPathsOrNull(fm.paths),
    body, references: refs, auxFiles, dirName, sourcePath,
  }
}

/** Scan AGENTS.md (fallback CLAUDE.md) for instructions */
async function scanInstructions(rootDir: string): Promise<InstructionIR[]> {
  const instructions: InstructionIR[] = []
  for (const name of ['AGENTS.md', 'CLAUDE.md']) {
    const filePath = path.join(rootDir, name)
    const content = await readFileOr(filePath)
    if (content) {
      instructions.push({ fileName: name, content, isRule: false, sourcePath: filePath })
      break // Only use the first found
    }
  }
  return instructions
}

/** Scan opencode.json for MCP servers */
async function scanMCP(rootDir: string): Promise<MCPIR | null> {
  const configPath = path.join(rootDir, 'opencode.json')
  const content = await readFileOr(configPath)
  if (!content) return null
  try {
    const data = JSON.parse(content)
    const mcpSection = data.mcp || {}
    const servers: MCPServerDef[] = Object.entries(mcpSection).map(([name, config]) => {
      const c = config as Record<string, unknown>
      return {
        name,
        command: c.command as string | undefined,
        args: c.args as string[] | undefined,
        env: c.env as Record<string, string> | undefined,
        type: c.type as string | undefined,
        url: c.url as string | undefined,
      }
    })
    if (servers.length > 0) return { servers, sourcePath: configPath }
  } catch { /* */ }
  return null
}

/** Scan .opencode/commands/ */
async function scanCommands(rootDir: string): Promise<CommandIR[]> {
  const commands: CommandIR[] = []
  const commandsDir = path.join(rootDir, '.opencode', 'commands')
  try {
    const { readdir } = await import('fs/promises')
    for (const entry of await readdir(commandsDir)) {
      if (!entry.endsWith('.md')) continue
      const filePath = path.join(commandsDir, entry)
      const content = await readFileOr(filePath)
      if (content) commands.push({ name: entry.replace(/\.md$/, ''), content, sourcePath: filePath })
    }
  } catch { /* */ }
  return commands
}

const opencodeParser: Parser = {
  providerId: 'opencode',
  async parse(dir: string): Promise<ProjectIR> {
    const skillsDir = path.join(dir, '.opencode', 'skills')
    const agentsDir = path.join(dir, '.opencode', 'agents')
    const [skills, agents, instructions, mcp, commands] = await Promise.all([
      parseSkillsDir(skillsDir, mapSkillToIR),
      parseMarkdownAgentsDir(agentsDir),
      scanInstructions(dir),
      scanMCP(dir),
      scanCommands(dir),
    ])
    return { skills, agents, instructions, mcp, commands, hooks: [], sourceProvider: 'opencode', rootDir: dir }
  },
}

export default opencodeParser
