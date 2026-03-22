/**
 * Global Plugins API
 *
 * GET  /api/settings/global-plugins — List all user-level plugins with enabled state, grouped by marketplace
 * POST /api/settings/global-plugins — Toggle a plugin's enabled state
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

const HOME = os.homedir()
const SETTINGS_PATH = join(HOME, '.claude', 'settings.json')

interface PluginEntry {
  key: string           // "pluginName@marketplace"
  pluginName: string
  marketplace: string
  enabled: boolean
}

interface GroupedPlugins {
  marketplace: string
  plugins: { name: string; key: string; enabled: boolean }[]
}

async function readSettings(): Promise<Record<string, unknown>> {
  if (!existsSync(SETTINGS_PATH)) return {}
  const content = await readFile(SETTINGS_PATH, 'utf-8')
  return JSON.parse(content)
}

async function writeSettings(settings: Record<string, unknown>): Promise<void> {
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
}

export async function GET() {
  try {
    const settings = await readSettings()
    const ep = (settings.enabledPlugins || {}) as Record<string, boolean>

    // Parse plugin keys and group by marketplace
    const entries: PluginEntry[] = Object.entries(ep).map(([key, enabled]) => {
      const atIdx = key.lastIndexOf('@')
      const pluginName = atIdx > 0 ? key.substring(0, atIdx) : key
      const marketplace = atIdx > 0 ? key.substring(atIdx + 1) : 'unknown'
      return { key, pluginName, marketplace, enabled }
    })

    // Group by marketplace
    const grouped: Record<string, GroupedPlugins> = {}
    for (const entry of entries) {
      if (!grouped[entry.marketplace]) {
        grouped[entry.marketplace] = { marketplace: entry.marketplace, plugins: [] }
      }
      grouped[entry.marketplace].plugins.push({
        name: entry.pluginName,
        key: entry.key,
        enabled: entry.enabled,
      })
    }

    // Sort: marketplaces alphabetically, plugins within each alphabetically
    const result = Object.values(grouped)
      .sort((a, b) => a.marketplace.localeCompare(b.marketplace))
    for (const group of result) {
      group.plugins.sort((a, b) => a.name.localeCompare(b.name))
    }

    const enabledCount = entries.filter(e => e.enabled).length
    const totalCount = entries.length

    return NextResponse.json({ groups: result, enabledCount, totalCount })
  } catch (error) {
    console.error('[global-plugins] GET failed:', error)
    return NextResponse.json({ error: 'Failed to read plugins' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { key, enabled } = body as { key?: string; enabled?: boolean }

    if (!key || typeof key !== 'string') {
      return NextResponse.json({ error: 'key is required' }, { status: 400 })
    }
    if (typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 })
    }

    const settings = await readSettings()
    const ep = (settings.enabledPlugins || {}) as Record<string, boolean>
    ep[key] = enabled
    settings.enabledPlugins = ep
    await writeSettings(settings)

    return NextResponse.json({ success: true, key, enabled })
  } catch (error) {
    console.error('[global-plugins] POST failed:', error)
    return NextResponse.json({ error: 'Failed to update plugin' }, { status: 500 })
  }
}
