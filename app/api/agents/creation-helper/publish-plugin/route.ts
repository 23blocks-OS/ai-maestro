/**
 * Publish Plugin — Copies a validated plugin from Haephestos workspace to local marketplace
 *
 * POST /api/agents/creation-helper/publish-plugin
 *
 * Accepts a plugin directory path inside ~/agents/haephestos/build/.
 * Validates quad-identity + compatible-titles/clients, then copies to
 * ~/agents/role-plugins/<name>/ and registers in marketplace manifest.
 *
 * Haephestos is responsible for ALL content edits (compatible-titles, compatible-clients,
 * version, description, etc.) BEFORE calling this endpoint. The API only validates and copies.
 */

import { NextRequest, NextResponse } from 'next/server'
import { homedir } from 'os'
import { join, basename, resolve } from 'path'
import { existsSync, readFileSync } from 'fs'
import { cp, rm, mkdir } from 'fs/promises'
import { ensureMarketplace, updateMarketplaceManifest } from '@/services/role-plugin-service'
import { getLocalMarketplacePath, LOCAL_MARKETPLACE_NAME } from '@/lib/ecosystem-constants'

export const dynamic = 'force-dynamic'

const HOME = homedir()
const HAEPHESTOS_BUILD = join(HOME, 'agents', 'haephestos', 'build')
const PLUGINS_DIR = getLocalMarketplacePath()  // ~/agents/role-plugins/ — central source of truth

// ── Quad-identity validation helpers (inline — simple regex, not worth a shared module) ──

function extractPluginJsonName(pluginDir: string): string | null {
  try {
    const raw = readFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf-8')
    const json = JSON.parse(raw) as Record<string, unknown>
    return typeof json.name === 'string' ? json.name : null
  } catch { return null }
}

function extractTomlAgentName(tomlPath: string): string | null {
  try {
    const content = readFileSync(tomlPath, 'utf-8')
    const agentMatch = content.match(/\[agent\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/)
    if (!agentMatch) return null
    const nameMatch = agentMatch[1].match(/^\s*name\s*=\s*"([^"]+)"/m)
    return nameMatch ? nameMatch[1] : null
  } catch { return null }
}

function extractFrontmatterName(mdPath: string): string | null {
  try {
    const content = readFileSync(mdPath, 'utf-8')
    const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---/)
    if (!fmMatch) return null
    const nameMatch = fmMatch[1].match(/^\s*name:\s*(.+)$/m)
    return nameMatch ? nameMatch[1].trim() : null
  } catch { return null }
}

function extractTomlField(tomlPath: string, field: string): string[] | null {
  try {
    const content = readFileSync(tomlPath, 'utf-8')
    const agentMatch = content.match(/\[agent\]\s*\n([\s\S]*?)(?=\n\[|\n*$)/)
    if (!agentMatch) return null
    const section = agentMatch[1]
    const fieldMatch = section.match(new RegExp(`^\\s*${field}\\s*=\\s*\\[([^\\]]*)\\]`, 'm'))
    if (!fieldMatch) return null
    return fieldMatch[1]
      .split(',')
      .map(s => s.trim().replace(/^["']|["']$/g, '').trim())
      .filter(Boolean)
  } catch { return null }
}

function extractPluginJsonField(pluginDir: string, field: string): string | null {
  try {
    const raw = readFileSync(join(pluginDir, '.claude-plugin', 'plugin.json'), 'utf-8')
    const json = JSON.parse(raw) as Record<string, unknown>
    return typeof json[field] === 'string' ? json[field] as string : null
  } catch { return null }
}

export async function POST(req: NextRequest) {
  try {
    let body: { pluginDir?: string }
    try { body = await req.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    if (!body.pluginDir || typeof body.pluginDir !== 'string') {
      return NextResponse.json({ error: 'pluginDir is required' }, { status: 400 })
    }

    // ── G1: Path traversal guard — must be inside Haephestos build dir ──
    const resolvedDir = resolve(body.pluginDir.replace(/^~/, HOME))
    if (!resolvedDir.startsWith(HAEPHESTOS_BUILD)) {
      return NextResponse.json(
        { error: `pluginDir must be inside ~/agents/haephestos/build/. Got: ${body.pluginDir}` },
        { status: 403 },
      )
    }
    if (!existsSync(resolvedDir)) {
      return NextResponse.json({ error: `Plugin directory does not exist: ${body.pluginDir}` }, { status: 404 })
    }

    const dirName = basename(resolvedDir)

    // ── G2: Quad-identity validation ──
    const errors: string[] = []

    // 2a. plugin.json name
    const pluginJsonName = extractPluginJsonName(resolvedDir)
    if (!pluginJsonName) {
      errors.push('Missing or invalid .claude-plugin/plugin.json (no name field)')
    } else if (pluginJsonName !== dirName) {
      errors.push(`plugin.json name "${pluginJsonName}" does not match directory name "${dirName}"`)
    }

    // 2b. .agent.toml [agent].name
    const tomlPath = join(resolvedDir, `${dirName}.agent.toml`)
    if (!existsSync(tomlPath)) {
      errors.push(`Missing ${dirName}.agent.toml at plugin root`)
    } else {
      const tomlName = extractTomlAgentName(tomlPath)
      if (!tomlName) {
        errors.push('.agent.toml has no [agent].name field')
      } else if (tomlName !== dirName) {
        errors.push(`[agent].name "${tomlName}" does not match directory name "${dirName}"`)
      }
    }

    // 2c. main-agent.md frontmatter name
    const mainAgentName = `${dirName}-main-agent`
    const mainAgentPath = join(resolvedDir, 'agents', `${mainAgentName}.md`)
    if (!existsSync(mainAgentPath)) {
      errors.push(`Missing agents/${mainAgentName}.md`)
    } else {
      const fmName = extractFrontmatterName(mainAgentPath)
      if (fmName && fmName !== mainAgentName) {
        errors.push(`main-agent frontmatter name "${fmName}" does not match expected "${mainAgentName}"`)
      }
    }

    // ── G3: compatible-titles and compatible-clients must exist ──
    if (existsSync(tomlPath)) {
      const titles = extractTomlField(tomlPath, 'compatible-titles')
      if (!titles || titles.length === 0) {
        errors.push('Missing compatible-titles in .agent.toml [agent] section')
      }
      const clients = extractTomlField(tomlPath, 'compatible-clients')
      if (!clients || clients.length === 0) {
        errors.push('Missing compatible-clients in .agent.toml [agent] section')
      }
    }

    if (errors.length > 0) {
      return NextResponse.json({
        error: `Plugin validation failed (${errors.length} issue${errors.length > 1 ? 's' : ''})`,
        issues: errors,
      }, { status: 422 })
    }

    // ── G4: Copy to marketplace ──
    const targetDir = join(PLUGINS_DIR, dirName)
    // Wipe existing if regenerating
    if (existsSync(targetDir)) {
      await rm(targetDir, { recursive: true })
    }
    await mkdir(PLUGINS_DIR, { recursive: true })
    await cp(resolvedDir, targetDir, { recursive: true })

    // ── G5: Register in marketplace manifest ──
    const description = extractPluginJsonField(resolvedDir, 'description') || `Role plugin for ${dirName}`
    const version = extractPluginJsonField(resolvedDir, 'version') || '1.0.0'
    await ensureMarketplace()
    await updateMarketplaceManifest(dirName, description, version)

    // ── G6: Tell Claude CLI to refresh the marketplace ──
    try {
      const { execSync } = await import('child_process')
      execSync(`claude plugin marketplace update ${LOCAL_MARKETPLACE_NAME}`, {
        timeout: 15000,
        stdio: 'pipe',
      })
    } catch {
      // Non-blocking — marketplace will auto-refresh on next CLI use
    }

    return NextResponse.json({
      success: true,
      pluginName: dirName,
      pluginDir: targetDir,
    })
  } catch (error) {
    console.error('[publish-plugin] Failed:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to publish plugin' },
      { status: 500 },
    )
  }
}
