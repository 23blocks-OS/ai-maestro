/**
 * MCP Server Discovery API
 *
 * Discovers tools, resources, and prompts exposed by an MCP server
 * using the mcp_discovery.py script.
 *
 * POST /api/settings/mcp-discover
 *
 * Request body:
 *   configPath: string     — path to .mcp.json file (must be under ~/.claude/plugins/)
 *   serverName: string     — name of the server inside the config file
 *   format?: 'json' | 'text' | 'llm'  — output format (default: 'json')
 *   raw?: boolean          — if true, returns raw unprocessed output from the script
 *   method?: string        — JSON-RPC method to execute (e.g. 'tools/list', 'resources/list', 'prompts/list')
 *   toolName?: string      — tool name for tools/call method
 *   toolArgs?: Record<string, string>  — arguments for tools/call
 *   timeout?: number       — max seconds to wait (default: 25)
 *
 * Response (format=json):
 *   { tools: [...], resources: [...], prompts: [...], serverInfo: {...}, capabilities: {...} }
 *
 * Response (format=text or raw=true):
 *   { output: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile } from 'fs/promises'
import { existsSync, writeFileSync, unlinkSync } from 'fs'
import { dirname, join } from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

const PLUGINS_BASE = `${os.homedir()}/.claude/plugins`
const PROJECT_ROOT = process.cwd()
const SCRIPT_PATH = join(PROJECT_ROOT, 'scripts_dev', 'mcp_discovery.py')

/** Sanitize a string for safe shell use */
function shellSafe(input: string): string {
  return input.replace(/[^a-zA-Z0-9._/@:+=-]/g, '')
}

export async function POST(req: NextRequest) {
  const body = await req.json()
  const { configPath, serverName, format, raw, method, toolName, toolArgs, timeout } = body as {
    configPath?: string
    serverName?: string
    format?: 'json' | 'text' | 'llm'
    raw?: boolean
    method?: string
    toolName?: string
    toolArgs?: Record<string, string>
    timeout?: number
  }

  if (!serverName) {
    return NextResponse.json({ error: 'serverName is required' }, { status: 400 })
  }
  if (!existsSync(SCRIPT_PATH)) {
    return NextResponse.json({ error: 'MCP discovery script not found at scripts_dev/mcp_discovery.py' }, { status: 500 })
  }

  // Two modes:
  // 1. configPath — plugin-based MCP with .mcp.json file (must be under ~/.claude/plugins/)
  // 2. serverConfig — inline JSON for standalone MCP (from ~/.claude.json, no file on disk)
  const { serverConfig } = body as { serverConfig?: Record<string, unknown> }
  let tmpFile: string

  if (configPath) {
    // Plugin-based: read from .mcp.json file
    const resolved = configPath.replace(/\.\./g, '')
    if (!resolved.startsWith(PLUGINS_BASE)) {
      return NextResponse.json({ error: 'Access denied — configPath must be under ~/.claude/plugins/' }, { status: 403 })
    }
    if (!existsSync(resolved)) {
      return NextResponse.json({ error: 'Config file not found' }, { status: 404 })
    }
    // Resolve ${CLAUDE_PLUGIN_ROOT} and other variables in .mcp.json
    const pluginRoot = dirname(resolved)
    let mcpJsonContent = await readFile(resolved, 'utf-8')
    mcpJsonContent = mcpJsonContent.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, pluginRoot)
    tmpFile = join(os.tmpdir(), `mcp-discover-${Date.now()}.json`)
    writeFileSync(tmpFile, mcpJsonContent)
  } else if (serverConfig && typeof serverConfig === 'object') {
    // Standalone: create temp .mcp.json from inline server config
    const safeName = shellSafe(serverName)
    const mcpJson = { mcpServers: { [safeName]: serverConfig } }
    tmpFile = join(os.tmpdir(), `mcp-discover-${Date.now()}.json`)
    writeFileSync(tmpFile, JSON.stringify(mcpJson))
  } else {
    return NextResponse.json({ error: 'Either configPath or serverConfig is required' }, { status: 400 })
  }

  // Build command arguments
  const safeName = shellSafe(serverName)
  const args: string[] = [
    `"${SCRIPT_PATH}"`,
    `"${tmpFile}"`,
    `"${safeName}"`,
  ]

  // Output format
  const fmt = format || (raw ? 'text' : 'json')
  args.push(`--format ${shellSafe(fmt)}`)

  if (raw) args.push('--dangerously-output-the-raw-response')

  // Timeout
  args.push(`--timeout ${Math.min(timeout || 25, 60)}`)
  args.push('--no-prompt-key')

  // Method execution
  if (method) {
    args.push(`--method ${shellSafe(method)}`)
    if (toolName) args.push(`--tool-name ${shellSafe(toolName)}`)
    if (toolArgs) {
      for (const [k, v] of Object.entries(toolArgs)) {
        args.push(`--tool-arg ${shellSafe(k)}=${shellSafe(String(v))}`)
      }
    }
  }

  try {
    const { execSync } = await import('child_process')
    const cmd = `uv run ${args.join(' ')} 2>/dev/null`
    const output = execSync(cmd, {
      timeout: (Math.min(timeout || 25, 60) + 5) * 1000,
      maxBuffer: 2 * 1024 * 1024,
      env: { ...process.env, ...(configPath ? { CLAUDE_PLUGIN_ROOT: dirname(configPath.replace(/\.\./g, '')) } : {}) },
    }).toString()

    // Clean up temp file
    try { unlinkSync(tmpFile) } catch { /* ignore */ }

    // Return based on format
    if (fmt === 'json' && !raw) {
      try {
        const data = JSON.parse(output)
        return NextResponse.json({
          tools: data.tools || [],
          resources: data.resources || [],
          prompts: data.prompts || [],
          serverInfo: data.serverInfo || null,
          capabilities: data.capabilities || null,
        })
      } catch {
        return NextResponse.json({ output, error: 'Failed to parse JSON output' })
      }
    }
    return NextResponse.json({ output })
  } catch (err) {
    try { unlinkSync(tmpFile) } catch { /* ignore */ }
    return NextResponse.json({ error: `MCP discovery failed: ${String(err).substring(0, 500)}`, tools: [] }, { status: 500 })
  }
}
