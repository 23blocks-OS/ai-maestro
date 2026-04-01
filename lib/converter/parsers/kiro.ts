/**
 * Kiro Parser — skills (markdown), agents (JSON with file:// URI resolution),
 * MCP (.kiro/settings/mcp.json), hooks (.kiro/settings/hooks.json),
 * steering files (.kiro/steering/ as instructions).
 *
 * Kiro agents are JSON — unique among all providers.
 * prompt field can be inline string or file:// URI.
 * skills referenced via skill:// URIs in resources array.
 * Kiro-specific fields stored in extras.kiro.
 *
 * Ported from crucible parsers/kiro.js + agents/parsers/kiro.js.
 */

import path from 'path'
import fs from 'fs/promises'
import type { Parser, ProjectIR, SkillIR, AgentIR, InstructionIR, MCPIR, MCPServerDef, HookIR } from '../types'
import { parseSkillsDir } from './shared'
import { readFileOr, listFiles } from '../utils/fs'

/** Kiro-specific agent fields that go into extras.kiro */
const KIRO_EXTRAS_KEYS = [
  'toolAliases', 'allowedTools', 'toolsSettings', 'toolSchema',
  'includeMcpJson', 'useLegacyMcpJson', 'keyboardShortcut', 'welcomeMessage',
]

/** Map Kiro skill frontmatter — minimal like Gemini */
function mapSkillToIR(
  dirName: string, fm: Record<string, unknown>, body: string,
  refs: { path: string; content: string }[],
  auxFiles: { relativePath: string; content: string }[],
  sourcePath: string
): SkillIR {
  return {
    name: String(fm.name ?? dirName),
    description: String(fm.description ?? ''),
    userInvokable: false,
    args: [],
    license: fm.license as string ?? null,
    compatibility: fm.compatibility as string ?? null,
    metadata: fm.metadata as Record<string, string> ?? null,
    allowedTools: null,
    body, references: refs, auxFiles, dirName, sourcePath,
  }
}

/** Resolve Kiro agent prompt — inline string or file:// URI */
async function resolveBody(prompt: unknown, agentsDir: string): Promise<string> {
  if (typeof prompt !== 'string') return ''
  if (!prompt.startsWith('file://')) return prompt
  const filePath = path.join(agentsDir, prompt.slice(7))
  return await readFileOr(filePath) ?? ''
}

/** Parse Kiro JSON agent files */
async function parseKiroAgents(dir: string): Promise<AgentIR[]> {
  const agentsDir = path.join(dir, '.kiro', 'agents')
  const agents: AgentIR[] = []
  const files = await listFiles(agentsDir)

  for (const fileName of files) {
    if (!fileName.endsWith('.json')) continue
    const filePath = path.join(agentsDir, fileName)
    const content = await readFileOr(filePath)
    if (!content) continue

    try {
      const data = JSON.parse(content) as Record<string, unknown>
      const baseName = fileName.replace(/\.json$/, '')
      const body = await resolveBody(data.prompt, agentsDir)

      // Extract skill:// URIs from resources
      const skills: string[] = []
      const extraResources: unknown[] = []
      if (Array.isArray(data.resources)) {
        for (const r of data.resources) {
          if (typeof r === 'string' && r.startsWith('skill://')) {
            skills.push(r.slice(8))
          } else {
            extraResources.push(r)
          }
        }
      }

      // Collect Kiro-specific extras
      const kiroExtras: Record<string, unknown> = {}
      for (const key of KIRO_EXTRAS_KEYS) {
        if (data[key] != null) kiroExtras[key] = data[key]
      }
      if (extraResources.length > 0) kiroExtras.resources = extraResources

      agents.push({
        name: String(data.name ?? baseName),
        description: String(data.description ?? ''),
        body,
        model: data.model as string ?? null,
        temperature: null,
        reasoningEffort: null,
        tools: data.tools as string[] ?? null,
        disallowedTools: null,
        permissionMode: null,
        maxTurns: null,
        timeoutMins: null,
        background: false,
        isolation: null,
        mcpServers: data.mcpServers as Record<string, unknown> ?? null,
        skills: skills.length > 0 ? skills : null,
        hooks: data.hooks as Record<string, unknown> ?? null,
        memory: null,
        extras: Object.keys(kiroExtras).length > 0 ? { kiro: kiroExtras } : {},
        fileName: baseName,
        sourcePath: filePath,
      })
    } catch { /* invalid JSON */ }
  }

  return agents
}

/** Scan .kiro/steering/ as instructions */
async function scanSteering(rootDir: string): Promise<InstructionIR[]> {
  const instructions: InstructionIR[] = []
  const steeringDir = path.join(rootDir, '.kiro', 'steering')
  try {
    const entries = await fs.readdir(steeringDir)
    for (const entry of entries) {
      if (!entry.endsWith('.md')) continue
      const filePath = path.join(steeringDir, entry)
      const content = await readFileOr(filePath)
      if (content) instructions.push({ fileName: entry, content, isRule: false, sourcePath: filePath })
    }
  } catch { /* */ }
  return instructions
}

/** Scan .kiro/settings/mcp.json */
async function scanMCP(rootDir: string): Promise<MCPIR | null> {
  const mcpPath = path.join(rootDir, '.kiro', 'settings', 'mcp.json')
  const content = await readFileOr(mcpPath)
  if (!content) return null
  try {
    const data = JSON.parse(content)
    const mcpServers = data.mcpServers || {}
    const servers: MCPServerDef[] = Object.entries(mcpServers).map(([name, config]) => {
      const c = config as Record<string, unknown>
      return { name, command: c.command as string | undefined, args: c.args as string[] | undefined, env: c.env as Record<string, string> | undefined, url: c.url as string | undefined }
    })
    if (servers.length > 0) return { servers, sourcePath: mcpPath }
  } catch { /* */ }
  return null
}

/** Scan .kiro/hooks/*.kiro.hook (per-hook JSON files per Kiro spec) */
async function scanHooks(rootDir: string): Promise<HookIR[]> {
  const hooks: HookIR[] = []
  const hooksDir = path.join(rootDir, '.kiro', 'hooks')
  const files = await listFiles(hooksDir)

  for (const fileName of files) {
    if (!fileName.endsWith('.kiro.hook')) continue
    const filePath = path.join(hooksDir, fileName)
    const content = await readFileOr(filePath)
    if (!content) continue

    try {
      const data = JSON.parse(content) as Record<string, unknown>
      // Kiro hook schema: { name, description, version, when: { event, ... }, then: { type, command, ... } }
      const when = data.when as Record<string, unknown> | undefined
      const then = data.then as Record<string, unknown> | undefined
      if (!when || !then) continue

      hooks.push({
        event: String(when.event ?? data.name ?? fileName.replace('.kiro.hook', '')),
        matcher: when.matcher as string | undefined,
        type: String(then.type ?? 'shell'),
        command: then.command as string | undefined,
      })
    } catch { /* invalid JSON */ }
  }

  return hooks
}

const kiroParser: Parser = {
  providerId: 'kiro',
  async parse(dir: string): Promise<ProjectIR> {
    const skillsDir = path.join(dir, '.kiro', 'skills')
    const [skills, agents, instructions, mcp, hooks] = await Promise.all([
      parseSkillsDir(skillsDir, mapSkillToIR),
      parseKiroAgents(dir),
      scanSteering(dir),
      scanMCP(dir),
      scanHooks(dir),
    ])
    return { skills, agents, instructions, mcp, commands: [], hooks, sourceProvider: 'kiro', rootDir: dir }
  },
}

export default kiroParser
