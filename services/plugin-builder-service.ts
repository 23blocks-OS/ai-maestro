/**
 * Plugin Builder Service
 *
 * Pure business logic for the visual plugin builder.
 * No HTTP concepts (Request, Response, NextResponse, headers) leak into this module.
 * API routes are thin wrappers that call these functions.
 *
 * Covers:
 *   POST /api/plugin-builder/build        -> buildPlugin
 *   GET  /api/plugin-builder/builds/[id]  -> getBuildStatus
 *   POST /api/plugin-builder/scan-repo    -> scanRepo
 *   POST /api/plugin-builder/push         -> pushToGitHub
 */

import { promises as fs, type Dirent } from 'fs'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { randomUUID, createHash } from 'crypto'
import matter from 'gray-matter'
// ServiceResult imported directly from canonical source
import type { ServiceResult } from '@/types/service'
import type {
  PluginBuildConfig,
  PluginBuildResult,
  PluginManifest,
  PluginManifestSource,
  PluginSkillSelection,
  RepoScanResult,
  RepoSkillInfo,
  RepoScriptInfo,
  PluginPushConfig,
  PluginPushResult,
} from '@/types/plugin-builder'

// ============================================================================
// Constants
// ============================================================================

const PLUGIN_DIR = path.join(process.cwd(), 'plugin')
const BUILD_SCRIPT = path.join(PLUGIN_DIR, 'build-plugin.sh')
const BUILDS_DIR = path.join(os.tmpdir(), 'ai-maestro-plugin-builds')
/** Claude Code global config directory — where Claude installs plugins/marketplaces */
const CLAUDE_DIR = path.join(os.homedir(), '.claude')

/**
 * Base directory where Claude Code marketplace plugins are installed.
 * Override via CLAUDE_MARKETPLACE_PLUGINS_DIR env var when running in
 * environments where the process user's home directory differs from the
 * intended plugin installation location.
 */
const MARKETPLACE_PLUGINS_DIR = process.env.CLAUDE_MARKETPLACE_PLUGINS_DIR
  || path.join(os.homedir(), '.claude', 'plugins', 'marketplaces')

/** Max builds to keep in memory before evicting oldest */
const MAX_BUILD_RESULTS = 50
/** Auto-evict build results older than this (ms) */
const BUILD_TTL_MS = 60 * 60 * 1000 // 1 hour

/** Max concurrent build/scan operations */
const MAX_CONCURRENT_OPS = 3
let activeOps = 0
const operationQueue: Array<() => void> = []

/**
 * Acquire a concurrency slot.
 * Returns a release function that MUST be called in a finally block.
 * If MAX_CONCURRENT_OPS slots are already taken, queues the caller and
 * resolves only when a slot becomes available — no busy-waiting, no race.
 *
 * The check-and-increment is synchronous (no await between them), so two
 * concurrent callers cannot both slip through the MAX_CONCURRENT_OPS guard.
 */
function acquireSlot(): Promise<() => void> {
  return new Promise<() => void>((resolve) => {
    const tryAcquire = () => {
      // Synchronous check-and-increment: no await between them, so this is
      // the only place activeOps grows and it is always paired with a release.
      if (activeOps < MAX_CONCURRENT_OPS) {
        activeOps++
        resolve(() => {
          activeOps--
          // Wake the next queued operation, if any.
          if (operationQueue.length > 0) {
            const next = operationQueue.shift()!
            next()
          }
        })
      } else {
        operationQueue.push(tryAcquire)
      }
    }
    tryAcquire()
  })
}

/** Guard flag to prevent re-entrant calls to evictStaleBuildResults */
let isEvicting = false

// Promise-chain mutex: serialises the check+increment so no two concurrent
// callers can both pass the guard when activeOps === MAX_CONCURRENT_OPS - 1.
// Each caller appends to the chain, runs its critical section, then resolves
// so the next caller can proceed.  The long-running work (builds, git ops)
// happens OUTSIDE the lock — only the atomic check+increment is protected.
let activeOpsLock: Promise<void> = Promise.resolve()

// In-memory build status tracking (with TTL eviction)
const buildResults = new Map<string, PluginBuildResult>()

// ============================================================================
// Validation helpers
// ============================================================================

const PLUGIN_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
// Git ref character whitelist: letters, digits, dot, underscore, hyphen, forward-slash only.
// All other characters (~ ^ : ? * [ \ space @{ etc.) are forbidden — they carry special
// meaning in git ref syntax or in POSIX shells and must never appear in a validated ref.
const GIT_REF_RE = /^[a-zA-Z0-9._/-]+$/
const SEMVER_RE = /^\d+\.\d+\.\d+(-[a-zA-Z0-9.]+)?$/
// Disallows '.' and '..' as full segments to prevent path traversal while still
// permitting dots within names (e.g. "my.plugin"). A valid segment must start
// with an alphanumeric character so it can never be '.' or '..'.
const SAFE_PATH_SEGMENT_RE = /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/

/**
 * Allowed git hosting domains. Blocks SSRF against internal networks.
 * Phase 1 is localhost-only, but this protects against escalation.
 */
const ALLOWED_GIT_HOSTS = [
  'github.com',
  'gitlab.com',
  'bitbucket.org',
  'codeberg.org',
]

function validateGitUrl(url: string): string | null {
  if (!url || typeof url !== 'string') return 'URL is required'

  // Must be HTTPS
  if (!url.match(/^https:\/\/.+/)) {
    return 'Only HTTPS git URLs are allowed'
  }

  try {
    const parsed = new URL(url)

    // Reject URLs with embedded credentials — they would be stored in config files and logs
    if (parsed.username || parsed.password) {
      return 'Git URL must not contain embedded credentials'
    }

    const host = parsed.hostname.toLowerCase()

    // Block internal network addresses
    if (
      host === 'localhost' ||
      host === '127.0.0.1' ||
      host === '0.0.0.0' ||
      host === '::1' ||
      host.endsWith('.local') ||
      host.startsWith('10.') ||
      host.startsWith('192.168.') ||
      /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    ) {
      return 'Internal network URLs are not allowed'
    }

    // Check against allowed hosts — exact match only; subdomains are not legitimate
    // repo hosts for any of the listed providers and would open SSRF bypass vectors.
    if (!ALLOWED_GIT_HOSTS.includes(host)) {
      return `Git host "${host}" is not in the allowed list (${ALLOWED_GIT_HOSTS.join(', ')})`
    }

    return null // valid
  } catch {
    return 'Invalid URL format'
  }
}

function validateGitRef(ref: string): string | null {
  if (!ref || typeof ref !== 'string') return 'Git ref is required'
  // A leading dash could be misinterpreted as a git flag in shell invocations.
  if (ref.startsWith('-')) return 'Git ref must not start with a dash'
  // Whitelist: only letters, digits, dot, underscore, hyphen, forward-slash.
  if (!GIT_REF_RE.test(ref)) return 'Git ref contains invalid characters'
  // Git forbids ".." in ref names (used as range operator).
  if (ref.includes('..')) return 'Git ref must not contain ".."'
  // Git forbids a ref ending with a slash.
  if (ref.endsWith('/')) return 'Git ref must not end with a slash'
  // Git forbids a ref starting with a slash (must be relative).
  if (ref.startsWith('/')) return 'Git ref must not start with a slash'
  // Git forbids consecutive slashes (would resolve to empty path component).
  if (ref.includes('//')) return 'Git ref must not contain consecutive slashes'
  // Git forbids a path component that starts with a dot (e.g. "refs/.hidden").
  if (ref.startsWith('.') || ref.includes('/.')) return 'Git ref components must not start with a dot'
  return null
}

function validatePluginName(name: string): string | null {
  if (!name || typeof name !== 'string') return 'Plugin name is required'
  if (!PLUGIN_NAME_RE.test(name)) {
    return 'Plugin name must start with a letter/number and contain only letters, numbers, hyphens, and underscores'
  }
  if (name.length > 64) return 'Plugin name too long (max 64 characters)'
  return null
}

function validateSkillPath(skillPath: string): string | null {
  if (!skillPath || typeof skillPath !== 'string') return 'Skill path is required'
  if (skillPath.includes('..')) return 'Skill path must not contain ".."'
  if (skillPath.split('/').some(seg => seg === '.')) return 'Skill path must not contain "." as a path segment'
  if (path.isAbsolute(skillPath)) return 'Skill path must be relative'
  // Reject leading or trailing slashes, and double slashes — all produce empty
  // segments after split('/'), which bypassed validation in the old `if (seg &&…)` guard.
  if (skillPath.startsWith('/') || skillPath.endsWith('/')) {
    return 'Skill path must not have leading or trailing slashes'
  }
  // Each segment must be non-empty and contain only safe characters.
  const segments = skillPath.split('/')
  for (const seg of segments) {
    if (!seg) {
      return 'Skill path must not contain empty segments (e.g. from consecutive slashes)'
    }
    if (!SAFE_PATH_SEGMENT_RE.test(seg)) {
      return `Skill path segment "${seg}" contains invalid characters`
    }
  }
  return null
}

/**
 * Validate a marketplace or plugin name used in path construction.
 * Prevents path traversal via crafted marketplace/plugin names.
 */
function validateMarketplaceName(name: string): string | null {
  if (!name || typeof name !== 'string') return 'Name is required'
  if (name.includes('..')) return 'Name must not contain ".."'
  if (!SAFE_PATH_SEGMENT_RE.test(name)) {
    return `Name "${name}" contains invalid characters`
  }
  return null
}

function validateBuildConfig(config: PluginBuildConfig): string | null {
  const nameErr = validatePluginName(config.name)
  if (nameErr) return nameErr

  if (!c.version || typeof c.version !== 'string') return 'Version is required'
  if (!SEMVER_RE.test(c.version)) return 'Version must be valid semver (e.g., 1.0.0)'

  // Validate description if provided — must be a string within reasonable length
  if (config.description !== undefined && config.description !== null) {
    if (typeof config.description !== 'string') return 'Description must be a string'
    if (config.description.length > 512) return 'Description too long (max 512 characters)'
  }

  if (!config.skills || !Array.isArray(config.skills) || config.skills.length === 0) {
    return 'At least one skill must be selected'
  }

  // Validate each skill selection
  for (const skill of config.skills) {
    if (skill.type === 'core') {
      // skill.name is used as a path segment in generateManifest: skills/${skill.name}
      if (!skill.name || typeof skill.name !== 'string' || !SAFE_PATH_SEGMENT_RE.test(skill.name) || skill.name.length > 32) {
        return `Core skill "${skill.name || 'unknown'}": name must be a non-empty safe path segment (letters, numbers, dots, hyphens, underscores; max 32 chars)`
      }
    } else if (skill.type === 'repo') {
      // skill.name is used as a path segment in generateManifest: skills/${skill.name}
      if (!skill.name || typeof skill.name !== 'string' || !SAFE_PATH_SEGMENT_RE.test(skill.name) || skill.name.length > 32) {
        return `Repo skill "${skill.name || 'unknown'}": name must be a non-empty safe path segment (letters, numbers, dots, hyphens, underscores; max 32 chars)`
      }
      const urlErr = validateGitUrl(skill.url)
      if (urlErr) return `Repo skill "${skill.skillName}": ${urlErr}`
      const refErr = validateGitRef(skill.ref)
      if (refErr) return `Repo skill "${skill.skillName}": ${refErr}`
      const pathErr = validateSkillPath(skill.skillPath)
      if (pathErr) return `Repo skill "${skill.name}": ${pathErr}`
    } else if (skill.type === 'marketplace') {
      // Validate that skill.id is a non-empty string before generateManifest calls skill.id.split(':')
      if (typeof skill.id !== 'string' || skill.id.length === 0) {
        return `Marketplace skill "${skill.name || 'unknown'}": id must be a non-empty string`
      }
      const idParts = skill.id.split(':')
      if (idParts.length !== 3) {
        return `Marketplace skill "${skill.name || 'unknown'}": Invalid id format (expected marketplace:plugin:skill)`
      }
      // Validate marketplace and plugin names against path traversal — both are used in path.join in generateManifest
      if (!skill.marketplace || !SAFE_PATH_SEGMENT_RE.test(skill.marketplace)) {
        return `Marketplace skill "${skill.name}": Invalid marketplace name — must match ${SAFE_PATH_SEGMENT_RE}`
      }
      if (!skill.plugin || !SAFE_PATH_SEGMENT_RE.test(skill.plugin)) {
        return `Marketplace skill "${skill.name}": Invalid plugin name — must match ${SAFE_PATH_SEGMENT_RE}`
      }
    }
    if (skill.type === 'marketplace') {
      // Reject path traversal and absolute paths — these values are used in path.join inside generateManifest
      if (!skill.marketplace || skill.marketplace.includes('..') || path.isAbsolute(skill.marketplace)) {
        return `Marketplace skill "${skill.name}": Invalid marketplace name`
      }
      if (!SAFE_PATH_SEGMENT_RE.test(skill.marketplace)) {
        return `Marketplace skill "${skill.name}": Marketplace name contains invalid characters`
      }
      if (!skill.plugin || skill.plugin.includes('..') || path.isAbsolute(skill.plugin)) {
        return `Marketplace skill "${skill.name}": Invalid plugin name`
      }
      if (!SAFE_PATH_SEGMENT_RE.test(skill.plugin)) {
        return `Marketplace skill "${skill.name}": Plugin name contains invalid characters`
      }
    }

    if (skill.type === 'marketplace') {
      // Validate marketplace and plugin names to prevent path traversal when constructing
      // the installPath via path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', ...)
      if (!skill.marketplace || typeof skill.marketplace !== 'string') {
        return `Marketplace skill "${skill.id}": Marketplace name is required`
      }
      // Explicitly block '.' and '..' before the regex — SAFE_PATH_SEGMENT_RE allows dots
      // but a bare '.' or '..' would cause path.join to traverse out of the intended directory.
      if (skill.marketplace === '.' || skill.marketplace === '..') {
        return `Marketplace skill "${skill.id}": Marketplace name must not be '.' or '..'`
      }
      if (!SAFE_PATH_SEGMENT_RE.test(skill.marketplace)) {
        return `Marketplace skill "${skill.id}": Marketplace name contains invalid characters (only letters, numbers, dots, hyphens, underscores allowed)`
      }
      if (!skill.plugin || typeof skill.plugin !== 'string') {
        return `Marketplace skill "${skill.id}": Plugin name is required`
      }
      // Explicitly block '.' and '..' before the regex — same path traversal risk via plugin name.
      if (skill.plugin === '.' || skill.plugin === '..') {
        return `Marketplace skill "${skill.id}": Plugin name must not be '.' or '..'`
      }
      if (!SAFE_PATH_SEGMENT_RE.test(skill.plugin)) {
        return `Marketplace skill "${skill.id}": Plugin name contains invalid characters (only letters, numbers, dots, hyphens, underscores allowed)`
      }
    }

    if (skill.type === 'repo' && skill.skillPath) {
      // Reject path traversal sequences and absolute paths in core skill paths.
      // Split on '/' so multi-segment paths like "skills/my-skill" validate each segment independently.
      if (skill.skillPath.includes('..') || path.isAbsolute(skill.skillPath)) {
        return `Path traversal not allowed: ${skill.skillPath}`
      }
      const segments = skill.skillPath.split('/')
      if (segments.some(seg => !SAFE_PATH_SEGMENT_RE.test(seg))) {
        return `Invalid skillPath: ${skill.skillPath}`
      }
    }

    if (skill.type === 'marketplace') {
      // Require presence of marketplace and plugin fields before validating format —
      // without them the installPath constructed in generateManifest would be incomplete.
      if (!skill.id) return `Skill "${skill.id ?? ''}" missing id field`
      if (!skill.marketplace) return `Skill "${skill.id ?? ''}" missing marketplace field`
      if (!SAFE_PATH_SEGMENT_RE.test(skill.marketplace)) return `Invalid marketplace: ${skill.marketplace}`
      if (!skill.plugin) return `Skill "${skill.id ?? ''}" missing plugin field`
      if (!SAFE_PATH_SEGMENT_RE.test(skill.plugin)) return `Invalid plugin: ${skill.plugin}`
      // Validate the skill name component extracted from the id (format: marketplace:plugin:skillName).
      // Use .at(-1) (last part) — consistent with generateManifest which also takes parts[parts.length - 1].
      const skillName = skill.id.split(':').at(-1)
      if (skillName && !SAFE_PATH_SEGMENT_RE.test(skillName)) {
        return `Invalid skill name in id: ${skillName}`
      }
    }
  }

  return null
}

// ============================================================================
// Build result lifecycle (TTL + eviction)
// ============================================================================

async function evictStaleBuildResults(): Promise<void> {
  // Re-entrancy guard — eviction can be triggered by interval and by manual calls
  if (isEvicting) return
  isEvicting = true
  try {
    const now = Date.now()
    // Pass 1: remove entries older than the TTL
    for (const [id, result] of buildResults) {
      // Never evict a build that is still in progress — runBuild owns its directory lifecycle
      if (result.status === 'building') continue

      const age = now - new Date(result.createdAt).getTime()
      if (age > BUILD_TTL_MS) {
        // Read buildDir before deleting the map entry so we can clean up the mkdtemp directory
        const buildDir = result.buildDir
        buildResults.delete(id)
        // Best-effort cleanup of build directory — log failures so disk accumulation is visible
        if (buildDir) {
          fs.rm(buildDir, { recursive: true, force: true }).catch(err => {
            console.warn(`plugin-builder: failed to remove stale build directory ${buildDir}:`, err)
          })
        }
      }
    }

    // Pass 2: if still over limit, evict oldest completed/failed entries only
    if (buildResults.size > MAX_BUILD_RESULTS) {
      const entries = [...buildResults.entries()]
        .filter(([, result]) => result.status !== 'building')
        .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())
      const toRemove = entries.slice(0, entries.length - MAX_BUILD_RESULTS)
      for (const [id, result] of toRemove) {
        // Read buildDir from the already-captured result entry (before deleting from the map)
        const buildDir = result.buildDir
        buildResults.delete(id)
        if (buildDir) {
          fs.rm(buildDir, { recursive: true, force: true }).catch(err => {
            console.warn(`plugin-builder: failed to remove oldest build directory ${buildDir}:`, err)
          })
        }
      }
    }

    // Pass 3: if still over the hard limit, evict oldest of the SURVIVING (non-building) entries
    if (buildResults.size > MAX_BUILD_RESULTS) {
      const survivors = [...buildResults.entries()]
        .filter(([, result]) => result.status !== 'building')
        .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())
      const toRemoveCount = buildResults.size - MAX_BUILD_RESULTS
      for (let i = 0; i < toRemoveCount && i < survivors.length; i++) {
        const [id, result] = survivors[i]
        buildResults.delete(id)
        const buildDir = result.buildDir
        if (buildDir) {
          fs.rm(buildDir, { recursive: true, force: true }).catch(err => console.error(`Failed to remove evicted build dir ${buildDir}:`, err))
        }
      }
    }
  } finally {
    isEvicting = false
  }
  for (const id of staleIds) {
    buildResults.delete(id)
    // Best-effort cleanup of build directory — log failures so disk-space issues are
    // visible instead of silently accumulating stale directories.
    const buildDir = path.join(BUILDS_DIR, id)
    fs.rm(buildDir, { recursive: true, force: true }).catch(err => {
      console.warn(`[evictStaleBuildResults] Failed to remove stale build dir ${buildDir}:`, err)
    })
  }

  // Wait for all cleanup operations; allSettled ensures we never throw
  await Promise.allSettled(cleanupPromises)

  // Delete from the in-memory map only after filesystem cleanup has been attempted,
  // so the map accurately reflects filesystem state throughout the eviction window.
  for (const id of idsToDelete) {
    buildResults.delete(id)
  }
}

// Lazy eviction: only start the interval when the first build is created,
// so the timer does not run forever if no builds are ever created.
let evictionInterval: ReturnType<typeof setInterval> | null = null

function ensureEvictionStarted(): void {
  if (evictionInterval) return
  evictionInterval = setInterval(evictStaleBuildResults, 10 * 60 * 1000)
  evictionInterval.unref() // Don't prevent process exit
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Generate a plugin.manifest.json from the UI-provided build config.
 *
 * @param config - The build configuration from the UI.
 * @param buildDir - The temporary build directory where build-plugin.sh will run.
 *   Required so that marketplace skill paths can be expressed as paths relative
 *   to the build directory, which is how build-plugin.sh resolves "local" sources
 *   (it prepends $SCRIPT_DIR to every local path).
 */
export function generateManifest(config: PluginBuildConfig, buildDir: string): PluginManifest {
  const sources: PluginManifestSource[] = []

  // Group skills by source type
  const coreSkills = config.skills.filter((s): s is Extract<PluginSkillSelection, { type: 'core' }> => s.type === 'core')
  const marketplaceSkills = config.skills.filter((s): s is Extract<PluginSkillSelection, { type: 'marketplace' }> => s.type === 'marketplace')
  const repoSkills = config.skills.filter((s): s is Extract<PluginSkillSelection, { type: 'repo' }> => s.type === 'repo')

  // Core skills — local source from plugin/src/
  // When core skills are selected, they share a single source entry with the hooks mapping
  // (if hooks are enabled). When no core skills are selected but hooks are enabled, a
  // dedicated hooks-only source is added so hooks are never silently omitted.
  if (coreSkills.length > 0) {
    const map: Record<string, string> = {}
    for (const skill of coreSkills) {
      map[`skills/${skill.name}`] = `skills/${skill.name}`
    }
    sources.push({
      name: 'core',
      description: 'AI Maestro core skills',
      type: 'local',
      path: './src',
      map,
    })
  } else if (config.includeHooks !== false) {
    // No core skills selected but hooks are requested — add a hooks-only source so
    // the hooks directory is still included in the built plugin.
    sources.push({
      name: 'core-hooks',
      description: 'AI Maestro default hooks',
      type: 'local',
      path: './src',
      map: { 'hooks/*': 'hooks/' },
    })
  }

  // Marketplace skills — group by marketplace+plugin combo
  const marketplaceGroups = new Map<string, { marketplace: string; plugin: string; skills: Extract<PluginSkillSelection, { type: 'marketplace' }>[] }>()
  for (const skill of marketplaceSkills) {
    const key = `${skill.marketplace}\0${skill.plugin}` // NUL separator avoids colon conflicts
    const group = marketplaceGroups.get(key) || { marketplace: skill.marketplace, plugin: skill.plugin, skills: [] }
    group.skills.push(skill)
    marketplaceGroups.set(key, group)
  }

  for (const [, group] of marketplaceGroups) {
    // Path to the specific plugin within the marketplace — includes both marketplace and plugin name
    const installPath = path.join(CLAUDE_DIR, 'plugins', 'marketplaces', group.marketplace, group.plugin)
    const map: Record<string, string> = {}
    for (const skill of group.skills) {
      // Extract skill name from the id (marketplace:plugin:skillName)
      const parts = skill.id.split(':')
      const skillName = parts[parts.length - 1]
      // The skill directory lives at skills/<skillName>/ inside the plugin directory,
      // which is what `relativeStagingPath` resolves to in the build dir.
      map[`skills/${skillName}`] = `skills/${skillName}`
    }
    sources.push({
      name: `${sanitizedPlugin}-from-${sanitizedMarketplace}`,
      description: `Skills from ${sanitizedPlugin} plugin (${sanitizedMarketplace} marketplace)`,
      type: 'local',
      path: installPath,
      map,
    })
  }

  // Repo skills — group by repo URL
  const repoGroups = new Map<string, Extract<PluginSkillSelection, { type: 'repo' }>[]>()
  for (const skill of repoSkills) {
    const key = `${skill.url}\0${skill.ref}` // NUL separator
    const group = repoGroups.get(key) || []
    group.push(skill)
    repoGroups.set(key, group)
  }

  for (const [, skills] of repoGroups) {
    const first = skills[0]
    const map: Record<string, string> = {}
    for (const skill of skills) {
      // skillPath already validated against path traversal
      map[skill.skillPath] = `skills/${skill.skillName}`
    }
    // Append a short hash of the full URL to guarantee uniqueness after sanitization/truncation
    const urlHash = createHash('sha1').update(first.url).digest('hex').slice(0, 8)
    sources.push({
      name: `${sanitizeSourceName(first.url)}-${urlHash}`,
      description: `Skills from ${first.url}`,
      type: 'git',
      repo: first.url,
      ref: first.ref,
      map,
    })
  }

  return {
    output: `./plugins/${config.name}`,
    // name and version are at the PluginManifest top level; PluginManifestMetadata does not repeat them
    plugin: {
      name: config.name,
      version: config.version,
      description: config.description,
      author: { name: 'Plugin Builder' },
      license: 'MIT',
    },
    sources,
  }
}

/**
 * Build a plugin from a manifest.
 * Writes manifest to temp dir, runs build-plugin.sh, captures output.
 */
export async function buildPlugin(config: unknown): Promise<ServiceResult<PluginBuildResult>> {
  // Validate inputs — accepts unknown so callers never need an unsafe cast.
  // All field-level checks live inside validateBuildConfig.
  const validationError = validateBuildConfig(config)
  if (validationError) {
    return { error: validationError, status: 400 }
  }

  // Concurrency guard: acquireSlot() serialises the check-and-increment so
  // concurrent callers cannot both slip through the MAX_CONCURRENT_OPS guard.
  // buildPlugin returns 202 immediately and the slot is held until runBuild
  // completes asynchronously, so the release is attached to that async chain.
  const release = await acquireSlot()
  // Track whether runBuild has been dispatched so the catch block knows
  // not to decrement activeOps a second time (runBuild's finally handles it).
  let buildDispatched = false
  // Declared before try so the catch block can clean up the directory on early errors
  const buildId = randomUUID()
  const buildDir = path.join(BUILDS_DIR, buildId)

  // Increment before the try block so the catch always decrements exactly once if runBuild
  // was never started. If runBuild is successfully launched, it owns the decrement via its
  // finally block, and the outer catch is never reached (we return 202 before any throw).
  activeOps++

  // Track whether runBuild was initiated so activeOps is decremented exactly once.
  // If runBuild is successfully launched (async), its .finally() owns the decrement.
  // If an error occurs before runBuild is called, the catch block owns the decrement.
  let buildLaunched = false
  // Hoisted so the catch block can clean up a partially-created build directory on
  // early errors (after mkdir but before runBuild is launched).
  let buildDir: string | undefined

  // Increment before try so the catch-block decrement always matches this increment
  activeOps++

  // Increment before the try block so the finally/.catch path always decrements exactly once
  activeOps++

  // Evict stale builds before adding new ones
  evictStaleBuildResults()

  activeOps++
  const buildId = randomUUID()
  const buildDir = path.join(BUILDS_DIR, buildId)

  try {
    // Evict stale builds before adding new ones; await to ensure map is clean
    // before the new entry is inserted (prevents stale entries from racing with the new build)
    await evictStaleBuildResults()

    // Create build directory
    await fs.mkdir(buildDir, { recursive: true })

    // Generate manifest — buildDir must be passed so marketplace paths are relative to it
    const manifest = generateManifest(config, buildDir)

    // Write manifest to build directory
    await fs.writeFile(
      path.join(buildDir, 'plugin.manifest.json'),
      JSON.stringify(manifest, null, 2)
    )

    // Copy build script to build directory
    await fs.copyFile(BUILD_SCRIPT, path.join(buildDir, 'build-plugin.sh'))
    await fs.chmod(path.join(buildDir, 'build-plugin.sh'), 0o755)

    // Symlink the src directory if core skills are selected OR if hooks are included
    // (the hooks-only source also references ./src so the directory must be present).
    const hasCoreSkills = config.skills.some(s => s.type === 'core')
    const needsSrcDir = hasCoreSkills || config.includeHooks !== false
    if (needsSrcDir) {
      const srcDir = path.join(PLUGIN_DIR, 'src')
      const linkTarget = path.join(buildDir, 'src')
      try {
        await fs.symlink(srcDir, linkTarget, 'dir')
      } catch (symlinkErr) {
        // If symlink fails (e.g., cross-device or permissions), copy instead.
        // Log the symlink failure so the cause is visible; let copyDir errors propagate
        // so the build fails loudly rather than silently missing core skills.
        console.warn(`Build ${buildId}: symlink of core skills dir failed, falling back to copy:`, symlinkErr)
        await copyDir(srcDir, linkTarget)
      }
    }

    // Initialize build result — store buildDir so eviction can clean up the mkdtemp path
    const result: PluginBuildResult = {
      buildId,
      status: 'building',
      logs: [],
      manifest,
      createdAt: new Date().toISOString(),
      buildDir,
    }
    buildResults.set(buildId, result)
    ensureEvictionStarted()

    // Mark dispatched before firing so the catch block won't double-decrement
    buildDispatched = true

    // Run build asynchronously — runBuild's own finally block owns the activeOps decrement.
    // Do NOT attach a .finally() here: runBuild already decrements activeOps in its finally
    // block unconditionally (success, failure, or eviction). A second decrement here would
    // cause activeOps to go negative and break the concurrency guard.
    runBuild(buildId, buildDir, manifest).catch(err => {
      console.error(`Build ${buildId} failed:`, err)
      // Ensure status is updated even on unexpected errors that escape runBuild's catch block
      const r = buildResults.get(buildId)
      if (r && r.status === 'building') {
        buildResults.set(buildId, {
          ...r,
          status: 'failed',
          logs: [err instanceof Error ? err.message : String(err)],
          outputPath: undefined,
          stats: undefined,
        })
      }
    })
    // runBuild is now running — its finally block owns the activeOps decrement,
    // so we must not touch opIncremented or activeOps from this point forward.

    // Return the final build result now that the build has fully completed.
    const finalResult = buildResults.get(buildId)
    if (finalResult?.status === 'failed') {
      return { error: 'Plugin build failed', status: 500 }
    }
    return { data: finalResult || result, status: 200 }
  } catch (error) {
    // Clean up the build directory if it was created before the error occurred
    if (!buildDispatched) {
      fs.rm(buildDir, { recursive: true, force: true }).catch(err => {
        console.warn(`plugin-builder: failed to remove build directory ${buildDir} on early error:`, err)
      })
    }
    console.error('Error starting plugin build:', error)

    // If activeOps was incremented but runBuild was never launched (error between
    // the increment and the runBuild call), runBuild's finally block will never
    // run, so we must decrement here to keep the counter accurate.
    if (opIncremented) {
      activeOps = Math.max(0, activeOps - 1)
    }

    // Clean up any partially-created build directory so it does not accumulate
    // on disk across repeated early failures.
    if (buildDir) {
      await fs.rm(buildDir, { recursive: true, force: true }).catch(() => {})
    }

    return { error: 'Failed to start plugin build', status: 500 }
  } finally {
    // Decrement exactly once when synchronous setup fails before the async
    // build was launched.  If the async build was launched, the async chain's
    // own finally block above handles the decrement instead.
    if (!buildDispatched) {
      activeOps = Math.max(0, activeOps - 1)
    }
  }
}

/**
 * Get the status of a running or completed build.
 */
export async function getBuildStatus(buildId: string): Promise<ServiceResult<PluginBuildResult>> {
  if (!buildId || typeof buildId !== 'string') {
    return { error: 'Build ID is required', status: 400 }
  }
  const result = buildResults.get(buildId)
  if (!result) {
    return { error: 'Build not found', status: 404 }
  }
  return { data: result, status: 200 }
}

/**
 * Scan a git repo for skills and scripts.
 * Shallow-clones the repo, finds SKILL.md files, returns metadata.
 */
export async function scanRepo(url: string, ref: string = 'main'): Promise<ServiceResult<RepoScanResult>> {
  // Validate URL
  const urlErr = validateGitUrl(url)
  if (urlErr) return { error: urlErr, status: 400 }

  // Validate ref
  const refErr = validateGitRef(ref)
  if (refErr) return { error: refErr, status: 400 }

  // Atomically check-and-increment inside the mutex (same pattern as buildPlugin)
  let didIncrement = false
  await new Promise<void>(resolve => {
    activeOpsLock = activeOpsLock.then(() => {
      if (activeOps < MAX_CONCURRENT_OPS) {
        activeOps++
        didIncrement = true
      }
      resolve()
    })
  })

  if (!didIncrement) {
    return { error: 'Too many concurrent operations. Please wait and try again.', status: 429 }
  }

  // Use mkdtemp for a secure unique directory — prevents race conditions and symlink attacks
  const scanDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-maestro-scan-'))

  const release = await acquireSlot()
  try {
    // Shallow clone (use -- to prevent ref from being parsed as a flag)
    await execPromise('git', ['clone', '--depth', '1', '--branch', ref, '--', url, scanDir], {
      timeout: 30000,
    })

    // Find SKILL.md files
    const skills = await findSkillsInDir(scanDir)

    // Find scripts (*.sh files in scripts/ directory)
    const scripts = await findScriptsInDir(scanDir)

    return {
      data: { url, ref, skills, scripts },
      status: 200,
    }
  } catch (error: unknown) {
    // Clean up on error
    await fs.rm(scanDir, { recursive: true, force: true }).catch(err => {
      console.warn(`Failed to clean up temporary scan directory ${scanDir}:`, err)
    })

    const execError = error as { code?: number; message?: string; stderr?: string }
    const exitCode = execError.code
    let message = execError.message || String(error)
    if (execError.stderr) message += `\nStderr: ${execError.stderr}`

    // git exits with code 128 for "repository not found" / authentication failures
    if (exitCode === 128 || message.includes('not found')) {
      return { error: `Repository not found or access denied: ${url}. ${message}`, status: 404 }
    }
    // Detect process kill-on-timeout (execFile sets killed=true) or explicit timeout message
    if ((error as any)?.killed || message.includes('timed out')) {
      return { error: `Git clone timed out after 30 seconds for repository: ${url}`, status: 504 }
    }
    console.error('Error scanning repo:', error)
    const detail = stderr ? `${message}\n${stderr}` : message
    return { error: `Failed to scan repository: ${detail}`, status: 500 }
  } finally {
    release()
  }
}

/**
 * Push a generated manifest to the user's fork on GitHub.
 */
export async function pushToGitHub(config: PluginPushConfig): Promise<ServiceResult<PluginPushResult>> {
  // Validate fork URL
  if (!config.forkUrl || typeof config.forkUrl !== 'string') {
    return { error: 'Fork URL is required', status: 400 }
  }
  const urlErr = validateGitUrl(config.forkUrl)
  if (urlErr) return { error: urlErr, status: 400 }

  // Validate manifest — check presence and required structural fields
  if (!config.manifest || typeof config.manifest !== 'object') {
    return { error: 'Manifest is required', status: 400 }
  }
  if (!config.manifest.name || typeof config.manifest.name !== 'string') {
    return { error: 'Manifest must have a valid name', status: 400 }
  }
  if (!config.manifest.version || typeof config.manifest.version !== 'string') {
    return { error: 'Manifest must have a valid version', status: 400 }
  }
  if (!Array.isArray(config.manifest.sources)) {
    return { error: 'Manifest must have a sources array', status: 400 }
  }

  // Validate branch
  const branch = config.branch || 'main'
  const refErr = validateGitRef(branch)
  if (refErr) return { error: refErr, status: 400 }

  // Atomically check-and-increment inside the mutex (same pattern as buildPlugin)
  let didIncrement = false
  await new Promise<void>(resolve => {
    activeOpsLock = activeOpsLock.then(() => {
      if (activeOps < MAX_CONCURRENT_OPS) {
        activeOps++
        didIncrement = true
      }
      resolve()
    })
  })

  if (!didIncrement) {
    return { error: 'Too many concurrent operations. Please wait and try again.', status: 429 }
  }

  // Use mkdtemp for a secure unique directory — prevents race conditions and symlink attacks
  const pushDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-maestro-push-'))

  const release = await acquireSlot()
  try {

    // Build clone URL. If a token is provided, embed it for auth so private forks can be read.
    // Using URL parsing avoids string-replace pitfalls (e.g. double-auth when forkUrl already
    // contains credentials, or when the URL has unusual structure).
    let cloneUrl = config.forkUrl
    if (config.token) {
      try {
        const u = new URL(config.forkUrl)
        u.username = config.token
        u.password = ''
        cloneUrl = u.toString()
      } catch { /* use original URL if parsing fails */ }
    }

    // Clone the fork (use -- to prevent branch from being parsed as a flag)
    await execPromise('git', ['clone', '--depth', '1', '--branch', branch, '--', cloneUrl, pushDir], {
      timeout: 30000,
    })

    // Write the manifest
    await fs.writeFile(
      path.join(pushDir, 'plugin.manifest.json'),
      JSON.stringify(config.manifest, null, 2) + '\n'
    )

    // Stage and commit
    await execPromise('git', ['add', 'plugin.manifest.json'], { cwd: pushDir, timeout: 10000 })

    // Check whether the manifest was actually staged (not just whether the repo has unrelated dirty files).
    // `git diff --cached --quiet` exits 0 when nothing is staged, non-zero when there are staged changes.
    const hasStagedChanges = await execPromise('git', ['diff', '--cached', '--quiet'], { cwd: pushDir })
      .then(() => false)   // exit 0 → nothing staged
      .catch(() => true)   // exit non-0 → staged changes present
    if (!hasStagedChanges) {
      await fs.rm(pushDir, { recursive: true, force: true })
      return {
        data: {
          status: 'pushed',
          message: 'No changes to push — manifest is already up to date.',
        },
        status: 200,
      }
    }

    // Resolve git author from system config, falling back to a neutral identity
    // when no global git config is present (e.g., CI environments or fresh installs).
    const resolveGitConfigValue = async (key: string): Promise<string | null> => {
      try {
        const value = await execPromise('git', ['config', '--global', key], { cwd: pushDir })
        return value.trim() || null
      } catch {
        return null
      }
    }
    const authorName = (await resolveGitConfigValue('user.name')) ?? 'Plugin Builder'
    const authorEmail = (await resolveGitConfigValue('user.email')) ?? 'plugin-builder@aimaestro.local'

    // Commit with resolved author (explicit -c flags override any repo-level config cleanly)
    await execPromise('git', [
      '-c', `user.name=${authorName}`,
      '-c', `user.email=${authorEmail}`,
      'commit', '-m', 'build: update plugin manifest from Plugin Builder',
    ], { cwd: pushDir, timeout: 10000 })

    // Push (the remote origin URL already carries auth from the clone URL built above)
    await execPromise('git', ['push', 'origin', branch], { cwd: pushDir, timeout: 30000 })

    return {
      data: {
        status: 'pushed',
        message: `Manifest pushed to ${config.forkUrl} on branch ${branch}`,
      },
      status: 200,
    }
  } catch (error: unknown) {
    await fs.rm(pushDir, { recursive: true, force: true }).catch(() => {})
    // Include stderr from execPromise-thrown ExecError for actionable git failure messages
    let message = error instanceof Error ? error.message : String(error)
    const execErr = error as { code?: number; message?: string; stderr?: string }
    if (execErr.stderr) message += `\nStderr: ${execErr.stderr}`
    console.error('Error pushing to GitHub:', error)
    // Detect process kill-on-timeout (execFile sets killed=true) or explicit timeout message
    if ((error as any)?.killed || message.includes('timed out')) {
      return { error: `Git operation timed out after 30 seconds. Failed to push to GitHub: ${message}`, status: 504 }
    }
    return { error: `Failed to push to GitHub: ${message}`, status: 500 }
  } finally {
    release()
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Run build-plugin.sh in the build directory and capture output.
 * Uses atomic replacement of the map entry to avoid torn reads.
 */
async function runBuild(buildId: string, buildDir: string, manifest: PluginManifest): Promise<void> {
  // Early guard: if the entry was evicted before we even start, abort immediately
  if (!buildResults.get(buildId)) return

  // Outer try/catch/finally: catch ensures any unexpected error is reflected in
  // the build status; finally decrements activeOps exactly once when the build
  // truly completes or fails — keeping the counter accurate for the full async
  // duration rather than just until buildPlugin returns its 202 response.
  try {
    if (!manifest.output) {
      throw new Error('manifest.output is required but was not provided')
    }

    const output = await execPromise(
      path.join(buildDir, 'build-plugin.sh'),
      ['--clean'],
      { cwd: buildDir, timeout: 120000 }
    )

    // Combine stdout and stderr so no build output is lost
    const logs = [...(output.stdout || '').split('\n'), ...(output.stderr || '').split('\n')].filter(Boolean)

    // Parse output for stats
    const outputPath = path.join(buildDir, manifest.output)
    const stats = { skills: 0, scripts: 0, hooks: 0 }

    try {
      const skillEntries = await fs.readdir(path.join(outputPath, 'skills')).catch(err => {
        console.warn(`Failed to read skills directory for build ${buildId}:`, err)
        return [] as string[]
      })
      stats.skills = skillEntries.length

      const scriptEntries = await fs.readdir(path.join(outputPath, 'scripts')).catch(err => {
        console.warn(`Failed to read scripts directory for build ${buildId}:`, err)
        return [] as string[]
      })
      stats.scripts = scriptEntries.length

      try {
        await fs.access(path.join(outputPath, 'hooks', 'hooks.json'))
        stats.hooks = 1
      } catch (err) {
        console.warn(`Failed to access hooks.json for build ${buildId}:`, err)
        stats.hooks = 0
      }
    } catch (err) {
      // Stats collection failed — non-critical, but log for visibility
      console.warn(`Stats collection failed for build ${buildId}:`, err)
    }

    // Re-read current entry so we don't overwrite any fields updated since
    // runBuild was launched (the async build takes up to 120s).
    // Do NOT fall back to `existing` if the entry was evicted: re-adding an
    // evicted entry would resurrect a build that eviction deliberately removed.
    const current = buildResults.get(buildId)
    if (!current) {
      // Entry was evicted by evictStaleBuildResults while the build was
      // running — do not re-add it.
      return
    }
    buildResults.set(buildId, {
      ...current,
      status: 'complete',
      outputPath,
      logs,
      stats,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    // execFile attaches stderr to the error object. Only include it when it carries
    // information that isn't already contained in error.message, to avoid duplicate
    // log entries (execFile embeds stderr in the message for non-zero exit codes).
    const stderr: string | undefined = (error as any)?.stderr
    const logs = [message]
    if (stderr && !message.includes(stderr.trimEnd())) {
      logs.push(...stderr.split('\n').filter(line => line.trim() !== ''))
    }

    // Re-read current entry so we don't overwrite any fields updated since
    // runBuild was launched.  Same eviction guard as the success path above.
    const current = buildResults.get(buildId)
    if (!current) {
      // Entry was evicted — do not re-add it.
      return
    }
    buildResults.set(buildId, {
      ...current,
      status: 'failed',
      logs,
      buildDir: current.buildDir,
      outputPath: undefined,
      stats: undefined,
    })
  } finally {
    // Decrement here — runBuild is fire-and-forget from buildPlugin, so the slot
    // must be freed only when the actual build work completes (success or failure).
    activeOps = Math.max(0, activeOps - 1)
  }
}

/**
 * Find SKILL.md files in a directory and extract metadata.
 */
async function findSkillsInDir(dir: string): Promise<RepoSkillInfo[]> {
  const skills: RepoSkillInfo[] = []
  const realDir = await fs.realpath(dir)
  // Path prefix used for containment checks — always ends with separator so that
  // a directory like /foo/bar-evil does NOT falsely match prefix /foo/bar
  const realDirPrefix = realDir + path.sep

  async function scan(currentDir: string, depth: number = 0) {
    if (depth > 5) return
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        // Skip symlinks to prevent reading outside the cloned repo
        if (entry.isSymbolicLink()) continue

        const fullPath = path.join(currentDir, entry.name)
        if (entry.isFile() && entry.name === 'SKILL.md') {
          // Verify the file resolves within the scan root (prevents symlink escape)
          const realFilePath = await fs.realpath(fullPath)
          // Accept only paths that are exactly realDir or strictly under it
          if (realFilePath !== realDir && !realFilePath.startsWith(realDirPrefix)) continue
          const content = await fs.readFile(fullPath, 'utf-8')
          const parsed = matter(content)
          const frontmatter = parsed.data as Record<string, unknown>
          // Use the relative path from the scan root so that a SKILL.md located
          // directly at the repo root does not inherit the temporary scan
          // directory's name (e.g. 'ai-maestro-scan-abc123') as skillFolder.
          const relativeSkillDir = path.relative(dir, path.dirname(fullPath))
          const skillFolder = relativeSkillDir ? path.basename(relativeSkillDir) : 'root'
          const relativePath = relativeSkillDir

          // Use String() coercion (not type assertion) so non-string YAML values
          // (e.g., numeric `name: 123`) are properly converted to strings rather
          // than silently bypassing the `||` fallback as a truthy non-string.
          skills.push({
            // Use String() coercion to safely handle non-string frontmatter values (numbers, booleans, etc.)
            name: frontmatter.name != null ? String(frontmatter.name) : skillFolder,
            path: relativePath,
            description: frontmatter.description != null ? String(frontmatter.description) : '',
          })
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          // Resolve subdirectory realpath and verify it is strictly within the scan
          // root before recursing — prevents traversal via non-symlink bind mounts
          // or other filesystem trickery
          const realSubPath = await fs.realpath(fullPath)
          if (realSubPath !== realDir && !realSubPath.startsWith(realDirPrefix)) continue
          await scan(fullPath, depth + 1)
        }
      }
    } catch (err) {
      // Skip inaccessible directories, but log to aid troubleshooting
      console.debug(`Skipping directory due to file system error in ${currentDir}: ${(err as Error).message}`)
    }
  }

  await scan(dir)
  return skills
}

/**
 * Find script files (*.sh) in a directory.
 */
async function findScriptsInDir(dir: string): Promise<RepoScriptInfo[]> {
  const scripts: RepoScriptInfo[] = []

  // Resolve the canonical root so symlink traversal out of the scan directory
  // is detected even when the scripts/ subdir itself is a symlink.
  const realRoot = await fs.realpath(dir)
  const scriptsDir = path.join(dir, 'scripts')

  // Resolve scripts/ to its real path and verify it stays inside the root.
  // If scripts/ is a symlink pointing outside the scan directory we skip it entirely.
  const realScriptsDir = await fs.realpath(scriptsDir).catch(() => null)
  // A valid scripts dir must be the root itself or a strict descendant of it.
  if (!realScriptsDir || (!realScriptsDir.startsWith(realRoot + path.sep) && realScriptsDir !== realRoot)) {
    return scripts
  }

  try {
    // Resolve the real root of the repo to enforce containment of the scripts dir
    const realDir = await fs.realpath(dir)
    const realDirPrefix = realDir + path.sep

    // Resolve the real path of the scripts directory to use as a containment boundary
    const realScriptsDir = await fs.realpath(scriptsDir)

    // If the scripts/ directory itself is a symlink (or bind-mount) that resolves
    // outside the repo root, reject it entirely before reading any entries
    if (realScriptsDir !== realDir && !realScriptsDir.startsWith(realDirPrefix)) {
      return scripts
    }

    const realScriptsDirPrefix = realScriptsDir + path.sep
    const entries = await fs.readdir(scriptsDir, { withFileTypes: true })
    for (const entry of entries) {
      // Skip symlinks so individual script files cannot point outside the repo.
      if (entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.sh')) {
        // Verify the file resolves within the scripts directory (prevents symlink escape)
        const fullPath = path.join(scriptsDir, entry.name)
        const realFilePath = await fs.realpath(fullPath)
        // Accept only paths that are exactly realScriptsDir or strictly under it
        if (realFilePath !== realScriptsDir && !realFilePath.startsWith(realScriptsDirPrefix)) continue
        scripts.push({
          name: entry.name,
          path: `scripts/${entry.name}`,
        })
      }
    }
  } catch {
    // No scripts directory or inaccessible
  }

  return scripts
}

/**
 * Sanitize a URL into a valid source name.
 * When the sanitized form exceeds 40 characters, a short hash suffix is appended
 * to prevent two different URLs from producing the same truncated name.
 */
function sanitizeSourceName(url: string): string {
  const sanitized = url
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')

  if (sanitized.length <= 40) {
    return sanitized
  }

  // Append an 8-character hash of the original URL so that different URLs
  // that share the same 40-character prefix remain distinguishable.
  const hash = createHash('sha1').update(url).digest('hex').slice(0, 8)
  const suffix = `-${hash}` // 9 chars
  return sanitized.slice(0, 40 - suffix.length) + suffix
}

/**
 * Promisified execFile with stdout and stderr capture.
 * Resolves with both stdout and stderr so callers can log all build output.
 * On error, attaches stdout and stderr to the error object for diagnosis.
 */
function execPromise(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<{ stdout: string; stderr: string }> {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      timeout: options.timeout || 60000,
      maxBuffer: 10 * 1024 * 1024, // 10MB — git clone and verbose build scripts can produce large output
    }, (error, stdout, stderr) => {
      if (error) {
        const err = error as { code?: number; message?: string; stderr?: string }
        err.stderr = stderr
        reject(err)
      } else {
        resolve({ stdout, stderr })
      }
    })
  })
}

/**
 * Recursively copy a directory, skipping symlinks.
 * Symlinks are intentionally not followed to prevent copying files outside the
 * source tree. A warning is logged for each skipped symlink so that incomplete
 * plugin builds caused by symlinked entries are diagnosable.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  let entries: Dirent[]
  try {
    entries = await fs.readdir(src, { withFileTypes: true })
  } catch (err) {
    // Permission denied, device error, etc. — propagate so buildPlugin fails clearly.
    throw new Error(`copyDir: cannot read source directory "${src}": ${(err as Error).message}`)
  }
  for (const entry of entries) {
    // Skip symlinks to prevent copying files outside the source tree.
    // Log a warning so operators can diagnose missing entries in the build output.
    if (entry.isSymbolicLink()) {
      console.warn(`copyDir: skipping symlink '${path.join(src, entry.name)}' — it will not appear in the plugin output`)
      continue
    }

    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      // Copy the file and then apply the source file's permissions so that
      // executable scripts (e.g. *.sh) remain executable in the destination.
      // fs.stat may fail if the file is removed between readdir and stat (TOCTOU),
      // or due to permission errors — fall back to 0o755 so that executable scripts
      // do not silently lose their execute bit on stat failure.
      let mode = 0o755
      try {
        const srcStat = await fs.stat(srcPath)
        mode = srcStat.mode
      } catch (statErr) {
        console.warn(`plugin-builder: could not stat ${srcPath}, using default mode 0o755:`, statErr)
      }
      await fs.copyFile(srcPath, destPath)
      await fs.chmod(destPath, mode)
    }
  }
}
