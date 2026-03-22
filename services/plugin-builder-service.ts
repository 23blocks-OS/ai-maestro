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

import { promises as fs } from 'fs'
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

/** Max builds to keep in memory before evicting oldest */
const MAX_BUILD_RESULTS = 50
/** Auto-evict build results older than this (ms) */
const BUILD_TTL_MS = 60 * 60 * 1000 // 1 hour

/** Max concurrent build/scan operations */
const MAX_CONCURRENT_OPS = 3
let activeOps = 0

/** Guard flag to prevent re-entrant calls to evictStaleBuildResults */
let isEvicting = false

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
const SAFE_PATH_SEGMENT_RE = /^[a-zA-Z0-9._-]+$/

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

function validateBuildConfig(config: PluginBuildConfig): string | null {
  const nameErr = validatePluginName(config.name)
  if (nameErr) return nameErr

  if (!config.version || typeof config.version !== 'string') return 'Version is required'
  if (!SEMVER_RE.test(config.version)) return 'Version must be valid semver (e.g., 1.0.0)'

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
      if (urlErr) return `Repo skill "${skill.name}": ${urlErr}`
      const refErr = validateGitRef(skill.ref)
      if (refErr) return `Repo skill "${skill.name}": ${refErr}`
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
  }

  return null
}

// ============================================================================
// Build result lifecycle (TTL + eviction)
// ============================================================================

function evictStaleBuildResults(): void {
  const now = Date.now()
  for (const [id, result] of buildResults) {
    // Never evict a build that is still in progress — runBuild owns its directory lifecycle
    if (result.status === 'building') continue

    const age = now - new Date(result.createdAt).getTime()
    if (age > BUILD_TTL_MS) {
      // Read buildDir before deleting the map entry so we can clean up the mkdtemp directory
      const buildDir = result.buildDir
      buildResults.delete(id)
      // Best-effort cleanup of build directory — log failures so disk accumulation is visible
      const buildDir = path.join(BUILDS_DIR, id)
      fs.rm(buildDir, { recursive: true, force: true }).catch(err => {
        console.warn(`plugin-builder: failed to remove stale build directory ${buildDir}:`, err)
      })
    }
  }

  // If still over limit, evict oldest completed/failed entries only
  if (buildResults.size > MAX_BUILD_RESULTS) {
    const entries = [...buildResults.entries()]
      .filter(([, result]) => result.status !== 'building')
      .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())
    const toRemove = entries.slice(0, entries.length - MAX_BUILD_RESULTS)
    for (const [id, result] of toRemove) {
      // Read buildDir from the already-captured result entry (before deleting from the map)
      const buildDir = result.buildDir
      buildResults.delete(id)
      const buildDir = path.join(BUILDS_DIR, id)
      fs.rm(buildDir, { recursive: true, force: true }).catch(err => {
        console.warn(`plugin-builder: failed to remove oldest build directory ${buildDir}:`, err)
      })
    }

    // Pass 2: if still over the hard limit, evict oldest of the SURVIVING (non-stale) entries
    // This avoids removing entries that were already removed in pass 1 from an out-of-date list.
    if (buildResults.size > MAX_BUILD_RESULTS) {
      const sorted = survivors
        .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())
      const toRemoveCount = buildResults.size - MAX_BUILD_RESULTS
      for (let i = 0; i < toRemoveCount; i++) {
        const [id] = sorted[i]
        buildResults.delete(id)
        const buildDir = path.join(BUILDS_DIR, id)
        fs.rm(buildDir, { recursive: true, force: true }).catch(err => console.error(`Failed to remove evicted build dir ${buildDir}:`, err))
      }
    }
  } finally {
    isEvicting = false
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
 */
export function generateManifest(config: PluginBuildConfig): PluginManifest {
  const sources: PluginManifestSource[] = []

  // Group skills by source type
  const coreSkills = config.skills.filter((s): s is Extract<PluginSkillSelection, { type: 'core' }> => s.type === 'core')
  const marketplaceSkills = config.skills.filter((s): s is Extract<PluginSkillSelection, { type: 'marketplace' }> => s.type === 'marketplace')
  const repoSkills = config.skills.filter((s): s is Extract<PluginSkillSelection, { type: 'repo' }> => s.type === 'repo')

  // Core skills — local source from plugin/src/
  if (coreSkills.length > 0) {
    const map: Record<string, string> = {}
    for (const skill of coreSkills) {
      map[`skills/${skill.name}`] = `skills/${skill.name}`
    }
    if (config.includeHooks !== false) {
      map['hooks/*'] = 'hooks/'
    }
    sources.push({
      name: 'core',
      description: 'AI Maestro core skills',
      type: 'local',
      path: './src',
      map,
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
      map[`skills/${skillName}`] = `skills/${skillName}`
    }
    sources.push({
      name: `${group.plugin}-from-${group.marketplace}`,
      description: `Skills from ${group.plugin} plugin (${group.marketplace} marketplace)`,
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
      map[skill.skillPath] = `skills/${skill.name}`
    }
    sources.push({
      name: sanitizeSourceName(first.url),
      description: `Skills from ${first.url}`,
      type: 'git',
      repo: first.url,
      ref: first.ref,
      map,
    })
  }

  return {
    output: `./plugins/${config.name}`,
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
export async function buildPlugin(config: PluginBuildConfig): Promise<ServiceResult<PluginBuildResult>> {
  // Validate inputs (protects both Next.js routes and headless router)
  const validationError = validateBuildConfig(config)
  if (validationError) {
    return { error: validationError, status: 400 }
  }

  // Concurrency guard
  if (activeOps >= MAX_CONCURRENT_OPS) {
    return { error: 'Too many concurrent builds. Please wait and try again.', status: 429 }
  }

  // Track whether runBuild has been dispatched so the catch block knows
  // not to decrement activeOps a second time (runBuild's finally handles it).
  let buildDispatched = false
  // Declared before try so the catch block can clean up the directory on early errors
  const buildId = randomUUID()
  const buildDir = path.join(BUILDS_DIR, buildId)

  try {
    // Evict stale builds before adding new ones
    evictStaleBuildResults()

    activeOps++

    // Create build directory
    await fs.mkdir(buildDir, { recursive: true })

    // Generate manifest
    const manifest = generateManifest(config)

    // Write manifest to build directory
    await fs.writeFile(
      path.join(buildDir, 'plugin.manifest.json'),
      JSON.stringify(manifest, null, 2)
    )

    // Copy build script to build directory
    await fs.copyFile(BUILD_SCRIPT, path.join(buildDir, 'build-plugin.sh'))
    await fs.chmod(path.join(buildDir, 'build-plugin.sh'), 0o755)

    // If there are core skills, symlink the src directory
    const hasCoreSkills = config.skills.some(s => s.type === 'core')
    if (hasCoreSkills) {
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
        })
      }
    })

    return { data: result, status: 202 }
  } catch (error) {
    // Only decrement if runBuild was never dispatched; otherwise its finally handles it
    if (!buildDispatched) {
      activeOps = Math.max(0, activeOps - 1)
      // Clean up the build directory if it was created before the error occurred
      fs.rm(buildDir, { recursive: true, force: true }).catch(err => {
        console.warn(`plugin-builder: failed to remove build directory ${buildDir} on early error:`, err)
      })
    }
    console.error('Error starting plugin build:', error)
    return { error: 'Failed to start plugin build', status: 500 }
  } finally {
    // Decrement exactly once when synchronous setup fails before the async
    // build was launched.  If the async build was launched, the async chain's
    // own finally block above handles the decrement instead.
    if (!asyncBuildLaunched) {
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

  // Concurrency guard
  if (activeOps >= MAX_CONCURRENT_OPS) {
    return { error: 'Too many concurrent operations. Please wait and try again.', status: 429 }
  }

  // Use mkdtemp for a secure unique directory — prevents race conditions and symlink attacks
  const scanDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-maestro-scan-'))

  try {
    activeOps++

    // Shallow clone (use -- to prevent ref from being parsed as a flag)
    await execPromise('git', ['clone', '--depth', '1', '--branch', ref, '--', url, scanDir], {
      timeout: 30000,
    })

    // Find SKILL.md files
    const skills = await findSkillsInDir(scanDir)

    // Find scripts (*.sh files in scripts/ directory)
    const scripts = await findScriptsInDir(scanDir)

    // Clean up
    await fs.rm(scanDir, { recursive: true, force: true })

    return {
      data: { url, ref, skills, scripts },
      status: 200,
    }
  } catch (error: unknown) {
    // Clean up on error
    await fs.rm(scanDir, { recursive: true, force: true }).catch(() => {})

    const execError = error as ExecError
    const exitCode = execError.code
    let message = execError.message || String(error)
    if (execError.stderr) message += `\nStderr: ${execError.stderr}`

    if (exitCode === 128 || message.includes('not found')) {
      return { error: `Repository not found or access denied: ${url}`, status: 404 }
    }
    console.error('Error scanning repo:', error)
    return { error: `Failed to scan repository: ${fullMessage}`, status: 500 }
  } finally {
    activeOps = Math.max(0, activeOps - 1)
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

  // Validate manifest
  if (!config.manifest || typeof config.manifest !== 'object') {
    return { error: 'Manifest is required', status: 400 }
  }

  // Validate branch
  const branch = config.branch || 'main'
  const refErr = validateGitRef(branch)
  if (refErr) return { error: refErr, status: 400 }

  // Concurrency guard
  if (activeOps >= MAX_CONCURRENT_OPS) {
    return { error: 'Too many concurrent operations. Please wait and try again.', status: 429 }
  }

  // Use mkdtemp for a secure unique directory — prevents race conditions and symlink attacks
  const pushDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ai-maestro-push-'))

  try {
    activeOps++

    // Clone the fork (use -- to prevent branch from being parsed as a flag)
    await execPromise('git', ['clone', '--depth', '1', '--branch', branch, '--', config.forkUrl, pushDir], {
      timeout: 30000,
    })

    // Write the manifest
    await fs.writeFile(
      path.join(pushDir, 'plugin.manifest.json'),
      JSON.stringify(config.manifest, null, 2) + '\n'
    )

    // Stage and commit
    await execPromise('git', ['add', 'plugin.manifest.json'], { cwd: pushDir })

    // Check if there are changes to commit
    const statusOutput = await execPromise('git', ['status', '--porcelain'], { cwd: pushDir })
    if (!statusOutput.trim()) {
      await fs.rm(pushDir, { recursive: true, force: true })
      return {
        data: {
          status: 'pushed',
          message: 'No changes to push — manifest is already up to date.',
        },
        status: 200,
      }
    }

    // Commit with explicit author (avoids failures when no global git config)
    await execPromise('git', [
      '-c', 'user.name=Plugin Builder',
      '-c', 'user.email=plugin-builder@aimaestro.local',
      'commit', '-m', 'build: update plugin manifest from Plugin Builder',
    ], { cwd: pushDir })

    // Push
    await execPromise('git', ['push', 'origin', branch], { cwd: pushDir, timeout: 30000 })

    // Clean up
    await fs.rm(pushDir, { recursive: true, force: true })

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
    const execErr = error as ExecError
    if (execErr.stderr) message += `\nStderr: ${execErr.stderr}`
    console.error('Error pushing to GitHub:', error)
    return { error: `Failed to push to GitHub: ${fullMessage}`, status: 500 }
  } finally {
    activeOps = Math.max(0, activeOps - 1)
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
    const logs = [...stdout.split('\n'), ...stderr.split('\n')].filter(Boolean)

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
      buildDir: existing.buildDir,
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

          skills.push({
            name: (frontmatter.name as string) || skillFolder,
            path: relativePath,
            description: (frontmatter.description as string) || '',
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
    } catch {
      // Skip inaccessible directories
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
  const scriptsDir = path.join(dir, 'scripts')

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
    // No scripts directory
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
        const err = error as ExecError
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
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    // Skip symlinks to prevent copying files outside the source tree
    if (entry.isSymbolicLink()) continue

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
