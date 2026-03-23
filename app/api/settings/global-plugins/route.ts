/**
 * Global Plugins API
 *
 * GET  /api/settings/global-plugins — List all user-level plugins with enabled state, grouped by marketplace
 * POST /api/settings/global-plugins — Toggle a plugin's enabled state
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, readdir } from 'fs/promises'
import { existsSync, realpathSync } from 'fs'
import { join, resolve, sep } from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

const HOME = os.homedir()
const SETTINGS_PATH = join(HOME, '.claude', 'settings.json')
// Allowed characters in marketplace and plugin names — rejects path traversal segments
const SAFE_PATH_COMPONENT = /^[a-zA-Z0-9._-]+$/

// In-memory mutex: serialize all settings reads/writes within a single process
// to prevent lost-update race conditions on concurrent POST requests.
let settingsLock: Promise<void> = Promise.resolve()

/**
 * Compare two version strings numerically segment by segment (e.g. "1.10.0" > "1.9.0").
 * Returns negative if a < b, positive if a > b, 0 if equal.
 */
function compareVersions(a: string, b: string): number {
  const aParts = a.split('.').map(n => parseInt(n, 10) || 0)
  const bParts = b.split('.').map(n => parseInt(n, 10) || 0)
  const len = Math.max(aParts.length, bParts.length)
  for (let i = 0; i < len; i++) {
    const diff = (aParts[i] ?? 0) - (bParts[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

interface PluginEntry {
  key: string           // "pluginName@marketplace"
  pluginName: string
  marketplace: string
  enabled: boolean
}

interface PluginDetail {
  name: string; key: string; enabled: boolean; version: string | null
  description: string | null; author: string | null; authorEmail: string | null
  license: string | null; homepage: string | null; repository: string | null
  keywords: string[] | null
}

interface GroupedPlugins {
  marketplace: string
  plugins: PluginDetail[]
}

async function readSettings(): Promise<Record<string, unknown>> {
  // Wait for any concurrent write to finish before reading, ensuring a consistent view.
  // Use .catch(() => {}) so that a previously failed write does not permanently block reads.
  await settingsLock.catch(() => {})
  // Attempt readFile directly instead of existsSync + readFile to avoid the TOCTOU race
  // where the file could be deleted between the existence check and the actual read.
  try {
    const content = await readFile(SETTINGS_PATH, 'utf-8')
    try {
      return JSON.parse(content)
    } catch (parseError) {
      console.error(`[global-plugins] Failed to parse settings file at ${SETTINGS_PATH}:`, parseError)
      return {}
    }
  } catch (readError: any) {
    if (readError.code === 'ENOENT') return {}
    throw readError
  }
}

async function writeSettings(settings: Record<string, unknown>): Promise<void> {
  // Chain onto the existing lock so that concurrent writes are serialized, not interleaved.
  // .catch(() => {}) before .then() ensures that a previously failed write does not prevent
  // the next write from running — the lock chain stays alive even after an error.
  // The re-thrown error at the end propagates the failure to the caller awaiting this write
  // without leaving settingsLock permanently rejected.
  settingsLock = settingsLock.catch(() => {}).then(async () => {
    await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
  })
  await settingsLock
}

export async function GET() {
  try {
    const settings = await readSettings()
    const ep = (settings.enabledPlugins || {}) as Record<string, boolean>

    // Parse plugin keys and group by marketplace.
    // Boolean() coercion guards against non-boolean values from hand-edited JSON.
    const entries: PluginEntry[] = Object.entries(ep).map(([key, enabled]) => {
      const atIdx = key.lastIndexOf('@')
      const pluginName = atIdx > 0 ? key.substring(0, atIdx) : key
      const marketplace = atIdx > 0 ? key.substring(atIdx + 1) : 'unknown'
      return { key, pluginName, marketplace, enabled: Boolean(enabled) }
    })

    // Group by marketplace
    const grouped: Record<string, GroupedPlugins> = {}
    for (const entry of entries) {
      // Read installed version and metadata from cache
      let version: string | null = null
      let description: string | null = null
      let author: string | null = null
      let authorEmail: string | null = null
      let license: string | null = null
      let homepage: string | null = null
      let repository: string | null = null
      let keywords: string[] | null = null

      // Reject marketplace or pluginName containing path-traversal sequences (e.g. "../..").
      // Any key with unsafe characters is skipped entirely; we do not silently serve data
      // from outside the expected cache root.
      if (!SAFE_PATH_COMPONENT.test(entry.marketplace) || !SAFE_PATH_COMPONENT.test(entry.pluginName)) {
        console.warn(`[global-plugins] Skipping entry with unsafe path component: ${entry.key}`)
        continue
      }

      const cacheBase = join(HOME, '.claude', 'plugins', 'cache')
      const cacheDir = join(cacheBase, entry.marketplace, entry.pluginName)

      // Double-check that the resolved path is actually inside cacheBase, even after join
      // normalizes any residual traversal that might slip past the regex.
      if (!resolve(cacheDir).startsWith(resolve(cacheBase) + sep)) {
        console.warn(`[global-plugins] Resolved cacheDir escapes expected root, skipping: ${entry.key}`)
        continue
      }

      if (existsSync(cacheDir)) {
        // Resolve symlinks to their real filesystem path to prevent traversal through
        // symlinks that physically point outside the allowed cache root even though
        // the logical (non-symlink-resolved) path appeared safe.
        try {
          const realCacheDir = realpathSync(cacheDir)
          if (!realCacheDir.startsWith(resolve(cacheBase) + sep)) {
            console.warn(`[global-plugins] Realpath escapes expected root, skipping: ${entry.key}`)
            continue
          }
        } catch {
          console.warn(`[global-plugins] Invalid symlink/realpath for ${entry.key}, skipping`)
          continue
        }

        try {
          // Use withFileTypes so we can filter to directories only, excluding plain files
          // that could otherwise be misidentified as version directories.
          const dirEntries = await readdir(cacheDir, { withFileTypes: true })
          const dirs = dirEntries
            .filter(dirent => dirent.isDirectory() && !dirent.name.startsWith('.'))
            .map(dirent => dirent.name)
            // Sort using numeric segment comparison so "1.10.0" > "1.9.0" (not lexicographic)
            .sort(compareVersions)
          if (dirs.length > 0) {
            version = dirs[dirs.length - 1]
            // Read plugin.json for metadata
            const manifestPath = join(cacheDir, version, '.claude-plugin', 'plugin.json')
            if (existsSync(manifestPath)) {
              try {
                const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
                description = manifest.description || null
                const a = manifest.author
                if (typeof a === 'string') author = a
                else if (a && typeof a === 'object') {
                  author = a.name || null
                  authorEmail = a.email || null
                }
                license = manifest.license || null
                homepage = manifest.homepage || null
                repository = manifest.repository || null
                if (Array.isArray(manifest.keywords)) keywords = manifest.keywords
              } catch (manifestError) {
                console.warn(`[global-plugins] Failed to parse manifest for ${entry.pluginName} at ${manifestPath}:`, manifestError)
              }
            }
          }
        } catch (dirError) {
          console.warn(`[global-plugins] Failed to read plugin cache directory for ${entry.pluginName} at ${cacheDir}:`, dirError)
        }
      }

      // Only create the marketplace group after all safety checks pass, so unsafe entries
      // do not leave empty ghost groups in the response.
      if (!grouped[entry.marketplace]) {
        grouped[entry.marketplace] = { marketplace: entry.marketplace, plugins: [] }
      }
      grouped[entry.marketplace].plugins.push({
        name: entry.pluginName, key: entry.key, enabled: entry.enabled,
        version, description, author, authorEmail, license, homepage, repository, keywords,
      })
    }

    // Sort: marketplaces alphabetically, plugins within each alphabetically
    const result = Object.values(grouped)
      .sort((a, b) => a.marketplace.localeCompare(b.marketplace))
    for (const group of result) {
      group.plugins.sort((a, b) => a.name.localeCompare(b.name))
    }

    // Derive counts from the actually-returned groups so that skipped (unsafe) entries
    // are not reflected in the counts, keeping them consistent with what was served.
    const totalCount = result.reduce((sum, g) => sum + g.plugins.length, 0)
    const enabledCount = result.reduce((sum, g) => sum + g.plugins.filter(p => p.enabled).length, 0)

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
    // Validate that both the plugin-name and marketplace parts of the key contain only
    // safe path characters, preventing path traversal or arbitrary key injection into settings.json.
    if (!SAFE_PATH_COMPONENT.test(key.substring(0, key.lastIndexOf('@'))) ||
        !SAFE_PATH_COMPONENT.test(key.substring(key.lastIndexOf('@') + 1))) {
      return NextResponse.json({ error: 'Invalid plugin key format' }, { status: 400 })
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
