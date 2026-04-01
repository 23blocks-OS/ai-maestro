/**
 * Plugin manifest scanning + local fake marketplace generation.
 * Ported from acplugin scanner/plugin.ts.
 *
 * Scans .claude-plugin/plugin.json and marketplace.json for plugin metadata.
 * Generates local marketplace.json files for target clients so they discover
 * converted elements without any remote publishing.
 */

import path from 'path'
import { readFileOr, fileExists, listDirs } from './fs'
import type { PluginMeta, ProviderId } from '../types'

/**
 * Read plugin.json from a Claude plugin directory.
 */
export async function readPluginMeta(pluginDir: string): Promise<PluginMeta | null> {
  const content = await readFileOr(path.join(pluginDir, '.claude-plugin', 'plugin.json'))
    ?? await readFileOr(path.join(pluginDir, 'plugin.json'))
  if (!content) return null

  try {
    const data = JSON.parse(content)
    return {
      name: data.name,
      description: data.description,
      version: data.version,
      author: data.author,
      displayName: data.displayName,
      homepage: data.homepage,
      repository: data.repository,
      license: data.license,
      keywords: data.keywords,
      category: data.category,
    }
  } catch {
    return null
  }
}

/**
 * Scan a marketplace.json to discover plugins in a multi-plugin repo.
 * Returns array of { meta, pluginDir } for each plugin.
 */
export async function scanMarketplace(rootDir: string): Promise<Array<{ meta: PluginMeta; pluginDir: string }>> {
  const marketplacePath = path.join(rootDir, '.claude-plugin', 'marketplace.json')
  const content = await readFileOr(marketplacePath)
  if (!content) return []

  try {
    const data = JSON.parse(content)
    const plugins = data.plugins || []
    const results: Array<{ meta: PluginMeta; pluginDir: string }> = []

    for (const p of plugins) {
      const source = p.source || p.path || `./${p.name}`
      const pluginDir = path.resolve(rootDir, source)
      results.push({
        meta: {
          name: p.name,
          description: p.description,
          version: p.version,
          author: p.author,
          category: p.category,
          displayName: p.displayName,
          homepage: p.homepage,
          repository: p.repository,
          license: p.license,
          keywords: p.keywords,
          source,
        },
        pluginDir,
      })
    }

    return results
  } catch {
    return []
  }
}

/**
 * Check if a directory contains a Claude plugin manifest.
 */
export async function isPlugin(dir: string): Promise<boolean> {
  return await fileExists(path.join(dir, '.claude-plugin', 'plugin.json'))
    || await fileExists(path.join(dir, 'plugin.json'))
}

/**
 * Check if a directory contains a marketplace manifest.
 */
export async function isMarketplace(dir: string): Promise<boolean> {
  return await fileExists(path.join(dir, '.claude-plugin', 'marketplace.json'))
}

/**
 * Generate a local fake marketplace.json for a target client.
 * This lets the target client discover converted elements locally
 * without any remote publishing.
 *
 * @param targetProvider - Target client ID
 * @param pluginName - Name of the converted plugin
 * @param pluginDir - Relative path to the plugin directory
 * @param meta - Original plugin metadata
 */
export function generateLocalMarketplace(
  targetProvider: ProviderId,
  pluginName: string,
  pluginDir: string,
  meta?: PluginMeta
): string {
  const marketplace = {
    name: `${pluginName}-converted`,
    description: `Locally converted from Claude Code plugin "${meta?.displayName ?? pluginName}"`,
    interface: { displayName: meta?.displayName ?? pluginName },
    plugins: [
      {
        name: pluginName,
        description: meta?.description ?? `Converted plugin: ${pluginName}`,
        source: pluginDir,
        category: meta?.category ?? 'Converted',
        version: meta?.version ?? '1.0.0',
        policy: { installation: 'AVAILABLE' },
      },
    ],
  }

  return JSON.stringify(marketplace, null, 2)
}

/**
 * Get the marketplace.json path for a target client.
 */
export function getMarketplacePath(targetProvider: ProviderId): string {
  switch (targetProvider) {
    case 'codex': return '.codex/plugins/marketplace.json'
    case 'claude-code': return '.claude-plugin/marketplace.json'
    default: return `.${targetProvider}/plugins/marketplace.json`
  }
}

/**
 * Scan Claude plugin cache for all installed plugins.
 * Returns plugin metadata and paths.
 */
export async function scanPluginCache(): Promise<Array<{ meta: PluginMeta; pluginDir: string; marketplace: string }>> {
  const cacheDir = path.join(process.env.HOME || '/root', '.claude', 'plugins', 'cache')
  const results: Array<{ meta: PluginMeta; pluginDir: string; marketplace: string }> = []

  try {
    const marketplaces = await listDirs(cacheDir)
    for (const mpName of marketplaces) {
      const mpDir = path.join(cacheDir, mpName)
      const plugins = await listDirs(mpDir)
      for (const pluginName of plugins) {
        const pluginDir = path.join(mpDir, pluginName)
        // Find latest version (sort by mtime)
        const versions = await listDirs(pluginDir)
        if (versions.length === 0) continue
        // Use last version directory (most recently written)
        const latestVersion = versions[versions.length - 1]
        const versionDir = path.join(pluginDir, latestVersion)
        const meta = await readPluginMeta(versionDir)
        if (meta) {
          results.push({ meta, pluginDir: versionDir, marketplace: mpName })
        }
      }
    }
  } catch { /* cache doesn't exist */ }

  return results
}
