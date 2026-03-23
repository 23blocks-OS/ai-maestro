/**
 * Global Plugins API
 *
 * GET  /api/settings/global-plugins — List all user-level plugins with enabled state, grouped by marketplace
 * POST /api/settings/global-plugins — Toggle a plugin's enabled state
 */

import { NextRequest, NextResponse } from 'next/server'
import { readFile, writeFile, readdir, mkdir } from 'fs/promises'
import { existsSync, realpathSync } from 'fs'
import { join, resolve, sep, dirname } from 'path'
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

interface PluginDetail {
  name: string; key: string; enabled: boolean; version: string | null
  description: string | null; author: string | null; authorEmail: string | null
  license: string | null; homepage: string | null; repository: string | null
  keywords: string[] | null
}

interface GroupedPlugins {
  marketplace: string
  sourceUrl: string | null
  plugins: PluginDetail[]
}

async function readSettings(): Promise<Record<string, unknown>> {
  // Single try/catch avoids TOCTOU between existsSync and readFile, and also
  // handles corrupted/invalid JSON gracefully by returning an empty object
  try {
    return JSON.parse(await readFile(SETTINGS_PATH, 'utf-8'))
  } catch {
    return {}
  }
}

async function writeSettings(settings: Record<string, unknown>): Promise<void> {
  // Ensure the directory exists before writing (e.g. on first run)
  await mkdir(dirname(SETTINGS_PATH), { recursive: true })
  await writeFile(SETTINGS_PATH, JSON.stringify(settings, null, 2) + '\n')
}

export async function GET() {
  try {
    const settings = await readSettings()
    // Explicitly reject arrays: JSON allows arrays where an object is expected,
    // and `|| {}` would not catch that case since `[] || {}` evaluates to `[]`.
    const epRaw = settings.enabledPlugins
    const ep: Record<string, boolean> = (epRaw && typeof epRaw === 'object' && !Array.isArray(epRaw)) ? epRaw as Record<string, boolean> : {}

    // Parse plugin keys and group by marketplace
    const entries: PluginEntry[] = Object.entries(ep).map(([key, enabled]) => {
      const atIdx = key.lastIndexOf('@')
      const pluginName = atIdx > 0 ? key.substring(0, atIdx) : key
      const marketplace = atIdx > 0 ? key.substring(atIdx + 1) : 'unknown'
      // Coerce any non-boolean values that may come from untrusted JSON to boolean
      const isEnabled = typeof enabled === 'boolean' ? enabled : Boolean(enabled)
      return { key, pluginName, marketplace, enabled: isEnabled }
    })

    // Read marketplace source URLs from extraKnownMarketplaces
    const ekm = (settings.extraKnownMarketplaces || {}) as Record<string, { source?: { repo?: unknown } }>
    const getMktSourceUrl = (mkt: string): string | null => {
      const e = ekm[mkt]
      // Validate repo is a string before constructing the URL to avoid
      // coercing truthy non-strings (arrays, objects) into invalid URLs
      const repo = typeof e?.source?.repo === 'string' ? e.source.repo : null
      // If repo is already a full URL, use it directly; otherwise treat it as
      // an "owner/repo-name" shorthand and prepend the GitHub base URL.
      return repo ? (repo.startsWith('http://') || repo.startsWith('https://') ? repo : `https://github.com/${repo}`) : null
    }

    // Precompute the real (symlink-resolved) cache base path once, outside the loop,
    // so that symlink traversal attacks via marketplace/pluginName are correctly detected.
    const cacheBase = join(HOME, '.claude', 'plugins', 'cache')
    const realCacheBase = (() => { try { return realpathSync(cacheBase) } catch { return resolve(cacheBase) } })()

    // Group by marketplace
    const grouped: Record<string, GroupedPlugins> = {}
    for (const entry of entries) {
      if (!grouped[entry.marketplace]) {
        grouped[entry.marketplace] = { marketplace: entry.marketplace, sourceUrl: getMktSourceUrl(entry.marketplace), plugins: [] }
      }
      // Read installed version and metadata from cache
      let version: string | null = null
      let description: string | null = null
      let author: string | null = null
      let authorEmail: string | null = null
      let license: string | null = null
      let homepage: string | null = null
      let repository: string | null = null
      let keywords: string[] | null = null

      const cacheDir = join(cacheBase, entry.marketplace, entry.pluginName)
      // Guard against path traversal: marketplace/pluginName from settings
      // could contain "../" sequences or symlinks pointing outside the cache base.
      // Use realpathSync (not resolve) so symlink chains are fully expanded before
      // the prefix check — otherwise an attacker could escape via a symlink.
      // An unsafe path means we skip filesystem access only — the plugin entry
      // is still included in the response (with null metadata) so that counts
      // (totalCount/enabledCount) remain accurate.
      let isSafe = false
      try {
        const realCacheDir = realpathSync(cacheDir)
        isSafe = realCacheDir.startsWith(realCacheBase + sep)
      } catch {
        isSafe = false
      }
      if (isSafe && existsSync(cacheDir)) {
        try {
          // Use withFileTypes so we can filter to directories only — readdir returns
          // both files and directories, and treating a file as a version directory
          // would cause the manifest path join to silently produce a wrong path.
          const rawDirs = (await readdir(cacheDir, { withFileTypes: true }))
            .filter(e => !e.name.startsWith('.') && e.isDirectory())
            .map(e => e.name)
          // Sort version directories using semantic version ordering so that
          // e.g. "10.0.0" sorts after "9.0.0" (pure lexical sort would fail here)
          rawDirs.sort((a, b) => {
            const toNums = (v: string) => v.split('.').map(p => parseInt(p, 10) || 0)
            const aN = toNums(a)
            const bN = toNums(b)
            for (let i = 0; i < Math.max(aN.length, bN.length); i++) {
              const diff = (aN[i] ?? 0) - (bN[i] ?? 0)
              if (diff !== 0) return diff
            }
            return 0
          })
          if (rawDirs.length > 0) {
            version = rawDirs[rawDirs.length - 1]
            // Read plugin.json for metadata
            const manifestPath = join(cacheDir, version, '.claude-plugin', 'plugin.json')
            if (existsSync(manifestPath)) {
              try {
                const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'))
                // Apply explicit string type guards so non-string values from
                // untrusted plugin.json do not violate the PluginDetail interface
                description = typeof manifest.description === 'string' ? manifest.description : null
                const a = manifest.author
                if (typeof a === 'string') {
                  author = a
                } else if (a && typeof a === 'object') {
                  author = typeof a.name === 'string' ? a.name : null
                  authorEmail = typeof a.email === 'string' ? a.email : null
                }
                license = typeof manifest.license === 'string' ? manifest.license : null
                homepage = typeof manifest.homepage === 'string' ? manifest.homepage : null
                repository = typeof manifest.repository === 'string' ? manifest.repository : null
                if (Array.isArray(manifest.keywords) && manifest.keywords.every((k: unknown) => typeof k === 'string')) keywords = manifest.keywords as string[]
              } catch (jsonError) {
                console.warn(`[global-plugins] Failed to parse plugin.json for ${entry.pluginName}@${entry.marketplace}:`, jsonError)
              }
            }
          }
        } catch (fsError) {
          console.warn(`[global-plugins] Failed to read cache directory for ${entry.pluginName}@${entry.marketplace}:`, fsError)
        }
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
    // Explicitly reject arrays: JSON allows arrays where an object is expected,
    // and `|| {}` would not catch that case since `[] || {}` evaluates to `[]`.
    const epRaw = settings.enabledPlugins
    const ep: Record<string, boolean> = (epRaw && typeof epRaw === 'object' && !Array.isArray(epRaw)) ? epRaw as Record<string, boolean> : {}
    ep[key] = enabled
    settings.enabledPlugins = ep
    await writeSettings(settings)

    return NextResponse.json({ success: true, key, enabled })
  } catch (error) {
    console.error('[global-plugins] POST failed:', error)
    return NextResponse.json({ error: 'Failed to update plugin' }, { status: 500 })
  }
}
