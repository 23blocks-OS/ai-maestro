/**
 * Codex Parser — parse skills, agents, instructions, MCP, hooks from Codex format.
 *
 * Key differences from Claude:
 * - Skills use `argument-hint` and $ARGNAME in body (not named args frontmatter)
 * - Agents are TOML files (not markdown)
 * - Instructions in AGENTS.md (not CLAUDE.md)
 * - MCP in config.toml [mcp_servers] sections
 * - Hooks in hooks.json
 * - Skills may be at .codex/skills/ OR .agents/skills/ (universal convention)
 *
 * Ported from crucible parsers/codex.js + agents/parsers/codex.js.
 */

import path from 'path'
import type { Parser, ProjectIR, SkillIR, AgentIR, InstructionIR, MCPIR, MCPServerDef, CommandIR, HookIR } from '../types'
import { parseSkillsDir, parseArgumentHint, recoverDollarArgs, asStringOrNull } from './shared'
import { readFileOr, listDirs, listFiles } from '../utils/fs'
import { parseToml } from '../utils/toml'
import { parseFrontmatter } from '../utils/frontmatter'

/** Permission mode mapping: Codex sandbox_mode → Claude permissionMode */
const SANDBOX_TO_PERMISSION: Record<string, string> = {
  'read-only': 'plan',
  'workspace-write': 'dontAsk',
  'danger-full-access': 'bypassPermissions',
}

/** Map Codex skill frontmatter to SkillIR */
function mapSkillToIR(
  dirName: string,
  fm: Record<string, unknown>,
  body: string,
  refs: { path: string; content: string }[],
  auxFiles: { relativePath: string; content: string }[],
  sourcePath: string
): SkillIR {
  let args: SkillIR['args'] = []
  let userInvokable = false

  // Try argument-hint from frontmatter first
  const hint = fm['argument-hint'] as string | undefined
  if (hint) {
    args = parseArgumentHint(hint)
    userInvokable = args.length > 0
  }

  // Fallback: recover $ARGNAME from body
  if (args.length === 0) {
    const recovered = recoverDollarArgs(body)
    args = recovered.args
    userInvokable = recovered.userInvokable
  }

  return {
    name: String(fm.name ?? dirName),
    description: String(fm.description ?? ''),
    userInvokable,
    args,
    license: asStringOrNull(fm.license),
    compatibility: null,
    metadata: null,
    allowedTools: null,
    paths: null,
    body,
    references: refs,
    auxFiles,
    dirName,
    sourcePath,
  }
}

/** Parse TOML agent files from .codex/agents/ */
async function parseTomlAgents(agentsDir: string): Promise<AgentIR[]> {
  const agents: AgentIR[] = []
  const files = await listFiles(agentsDir)

  for (const fileName of files) {
    if (!fileName.endsWith('.toml')) continue
    const filePath = path.join(agentsDir, fileName)
    const content = await readFileOr(filePath)
    if (!content) continue

    try {
      const data = parseToml(content)
      const baseName = fileName.replace(/\.toml$/, '')
      agents.push({
        name: String(data.name ?? baseName),
        description: String(data.description ?? ''),
        body: String(data.developer_instructions ?? ''),
        model: data.model as string ?? null,
        temperature: null,
        reasoningEffort: data.model_reasoning_effort as string ?? null,
        tools: null,
        disallowedTools: null,
        permissionMode: SANDBOX_TO_PERMISSION[data.sandbox_mode as string] ?? null,
        maxTurns: null,
        timeoutMins: null,
        background: false,
        isolation: null,
        mcpServers: null,
        skills: null,
        hooks: null,
        memory: null,
        extras: {},
        fileName: baseName,
        sourcePath: filePath,
      })
    } catch { /* invalid TOML */ }
  }

  return agents
}

/** Scan AGENTS.md and AGENTS.override.md for instructions */
async function scanInstructions(rootDir: string): Promise<InstructionIR[]> {
  const instructions: InstructionIR[] = []

  for (const name of ['AGENTS.md', 'AGENTS.override.md']) {
    const filePath = path.join(rootDir, name)
    const content = await readFileOr(filePath)
    if (content) {
      instructions.push({ fileName: name, content, isRule: false, sourcePath: filePath })
    }
  }

  return instructions
}

/** Scan config.toml for MCP server definitions */
async function scanMCP(rootDir: string): Promise<MCPIR | null> {
  const configPath = path.join(rootDir, '.codex', 'config.toml')
  const content = await readFileOr(configPath)
  if (!content) return null

  try {
    const data = parseToml(content)
    const mcpSection = data.mcp_servers as Record<string, Record<string, unknown>> | undefined
    if (!mcpSection) return null

    const servers: MCPServerDef[] = Object.entries(mcpSection).map(([name, config]) => ({
      name,
      command: config.command as string | undefined,
      args: config.args as string[] | undefined,
      env: config.env as Record<string, string> | undefined,
      url: config.url as string | undefined,
      headers: config.http_headers as Record<string, string> | undefined,
    }))

    return { servers, sourcePath: configPath }
  } catch {
    return null
  }
}

/** Scan hooks.json */
async function scanHooks(rootDir: string): Promise<HookIR[]> {
  const hooks: HookIR[] = []
  const hooksPath = path.join(rootDir, '.codex', 'hooks.json')
  const content = await readFileOr(hooksPath)
  if (!content) return hooks

  try {
    const data = JSON.parse(content)
    if (data.hooks && typeof data.hooks === 'object') {
      for (const [event, matchers] of Object.entries(data.hooks)) {
        if (!Array.isArray(matchers)) continue
        for (const matcher of matchers as Array<{ matcher?: string; hooks?: Array<{ type: string; command?: string }> }>) {
          if (!matcher.hooks) continue
          for (const hook of matcher.hooks) {
            hooks.push({
              event,
              matcher: matcher.matcher,
              type: hook.type || 'command',
              command: hook.command,
            })
          }
        }
      }
    }
  } catch { /* invalid JSON */ }

  return hooks
}

const codexParser: Parser = {
  providerId: 'codex',

  async parse(dir: string): Promise<ProjectIR> {
    // Codex skills can be at .codex/skills/ or .agents/skills/
    const skillsDirs = [
      path.join(dir, '.codex', 'skills'),
      path.join(dir, '.agents', 'skills'),
    ]

    let skills: SkillIR[] = []
    for (const skillsDir of skillsDirs) {
      const parsed = await parseSkillsDir(skillsDir, mapSkillToIR)
      skills = skills.concat(parsed)
    }
    // Deduplicate by name
    const seen = new Set<string>()
    skills = skills.filter(s => {
      if (seen.has(s.name)) return false
      seen.add(s.name)
      return true
    })

    const agentsDir = path.join(dir, '.codex', 'agents')

    const [agents, instructions, mcp, hooks] = await Promise.all([
      parseTomlAgents(agentsDir),
      scanInstructions(dir),
      scanMCP(dir),
      scanHooks(dir),
    ])

    return {
      skills,
      agents,
      instructions,
      mcp,
      commands: [], // Codex doesn't have slash commands
      hooks,
      sourceProvider: 'codex',
      rootDir: dir,
    }
  },
}

export default codexParser
