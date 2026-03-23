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
import { randomUUID } from 'crypto'
import matter from 'gray-matter'
import type { ServiceResult } from '@/services/marketplace-service'
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

/** Max builds to keep in memory before evicting oldest */
const MAX_BUILD_RESULTS = 50
/** Auto-evict build results older than this (ms) */
const BUILD_TTL_MS = 60 * 60 * 1000 // 1 hour

/** Max concurrent build/scan operations */
const MAX_CONCURRENT_OPS = 3
let activeOps = 0

// In-memory build status tracking (with TTL eviction)
const buildResults = new Map<string, PluginBuildResult>()

// ============================================================================
// Validation helpers
// ============================================================================

const PLUGIN_NAME_RE = /^[a-zA-Z0-9][a-zA-Z0-9_-]*$/
const GIT_REF_RE = /^[a-zA-Z0-9._\/-]+$/
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

    // Check against allowed hosts
    if (!ALLOWED_GIT_HOSTS.some(allowed => host === allowed || host.endsWith(`.${allowed}`))) {
      return `Git host "${host}" is not in the allowed list (${ALLOWED_GIT_HOSTS.join(', ')})`
    }

    return null // valid
  } catch {
    return 'Invalid URL format'
  }
}

function validateGitRef(ref: string): string | null {
  if (!ref || typeof ref !== 'string') return 'Git ref is required'
  if (ref.startsWith('-')) return 'Git ref must not start with a dash'
  if (!GIT_REF_RE.test(ref)) return 'Git ref contains invalid characters'
  if (ref.includes('..')) return 'Git ref must not contain ".."'
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
  // Each segment must be safe
  const segments = skillPath.split('/')
  for (const seg of segments) {
    if (seg && !SAFE_PATH_SEGMENT_RE.test(seg)) {
      return `Skill path segment "${seg}" contains invalid characters`
    }
  }
  return null
}

function validateBuildConfig(config: unknown): string | null {
  // Guard against non-object inputs before accessing any property
  if (!config || typeof config !== 'object' || Array.isArray(config)) {
    return 'Request body must be a JSON object'
  }

  // Cast to a loose record so property accesses below are type-safe
  const c = config as Record<string, unknown>

  const nameErr = validatePluginName(c.name as string)
  if (nameErr) return nameErr

  if (!c.version || typeof c.version !== 'string') return 'Version is required'
  if (!SEMVER_RE.test(c.version)) return 'Version must be valid semver (e.g., 1.0.0)'

  if (!c.skills || !Array.isArray(c.skills) || c.skills.length === 0) {
    return 'At least one skill must be selected'
  }

  // Validate each skill selection
  for (const skill of c.skills) {
    if (!skill || typeof skill !== 'object' || Array.isArray(skill)) {
      return 'Each skill must be a JSON object'
    }
    const s = skill as Record<string, unknown>

    // All skill types must have a valid name — skill.name flows into manifest map keys,
    // so characters like '/' or '\0' would produce broken paths during the build.
    const nameErr = validatePluginName(s.name as string)
    if (nameErr) return `Skill "${s.name}": ${nameErr}`

    if (s.type === 'repo') {
      const urlErr = validateGitUrl(s.url as string)
      if (urlErr) return `Repo skill "${s.name}": ${urlErr}`
      const refErr = validateGitRef(s.ref as string)
      if (refErr) return `Repo skill "${s.name}": ${refErr}`
      const pathErr = validateSkillPath(s.skillPath as string)
      if (pathErr) return `Repo skill "${s.name}": ${pathErr}`
    } else if (s.type === 'marketplace') {
      // marketplace and plugin are concatenated into a local filesystem path via
      // path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', marketplace, plugin).
      // Without validation, a value like '../../etc' escapes the marketplaces root.
      const marketplaceErr = validateSkillPath(s.marketplace as string)
      if (marketplaceErr) return `Marketplace skill "${s.name}": marketplace — ${marketplaceErr}`
      const pluginErr = validateSkillPath(s.plugin as string)
      if (pluginErr) return `Marketplace skill "${s.name}": plugin — ${pluginErr}`
    }
  }

  return null
}

// ============================================================================
// Build result lifecycle (TTL + eviction)
// ============================================================================

function evictStaleBuildResults(): void {
  const now = Date.now()

  // Collect stale IDs first — deleting Map entries during for...of iteration can cause
  // entries that haven't been visited yet to be skipped (per ECMAScript Map iterator spec).
  const staleIds: string[] = []
  for (const [id, result] of buildResults) {
    const age = now - new Date(result.createdAt).getTime()
    if (age > BUILD_TTL_MS) {
      staleIds.push(id)
    }
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

  // If still over limit, evict oldest
  if (buildResults.size > MAX_BUILD_RESULTS) {
    const entries = [...buildResults.entries()]
      .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())
    const toRemove = entries.slice(0, entries.length - MAX_BUILD_RESULTS)
    for (const [id] of toRemove) {
      buildResults.delete(id)
      const buildDir = path.join(BUILDS_DIR, id)
      fs.rm(buildDir, { recursive: true, force: true }).catch(err => {
        console.warn(`[evictStaleBuildResults] Failed to remove over-limit build dir ${buildDir}:`, err)
      })
    }
  }
}

// Run eviction every 10 minutes
const evictionInterval = setInterval(evictStaleBuildResults, 10 * 60 * 1000)
evictionInterval.unref() // Don't prevent process exit

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
    // Path must point to the specific plugin directory, not the marketplace root.
    // Plugins are installed under marketplaces/<marketplace>/<plugin>.
    const installPath = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', group.marketplace, group.plugin)
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
    name: config.name,
    version: config.version,
    description: config.description,
    output: `./plugins/${config.name}`,
    plugin: {
      name: config.name,
      version: config.version,
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

  // After full validation the shape is guaranteed; narrow to the concrete type.
  const validatedConfig = config as PluginBuildConfig

  // Concurrency guard — increment before the try block so that the outer catch
  // can never decrement a counter that was never incremented (accounting error).
  if (activeOps >= MAX_CONCURRENT_OPS) {
    return { error: 'Too many concurrent builds. Please wait and try again.', status: 429 }
  }
  activeOps++

  try {
    // Evict stale builds before adding new ones
    evictStaleBuildResults()

    const buildId = randomUUID()
    const buildDir = path.join(BUILDS_DIR, buildId)

    // Create build directory
    await fs.mkdir(buildDir, { recursive: true })

    // Generate manifest
    const manifest = generateManifest(validatedConfig)

    // Write manifest to build directory
    await fs.writeFile(
      path.join(buildDir, 'plugin.manifest.json'),
      JSON.stringify(manifest, null, 2)
    )

    // Copy build script to build directory
    await fs.copyFile(BUILD_SCRIPT, path.join(buildDir, 'build-plugin.sh'))
    await fs.chmod(path.join(buildDir, 'build-plugin.sh'), 0o755)

    // If there are core skills, symlink the src directory
    const hasCoreSkills = validatedConfig.skills.some(s => s.type === 'core')
    if (hasCoreSkills) {
      const srcDir = path.join(PLUGIN_DIR, 'src')
      const linkTarget = path.join(buildDir, 'src')
      try {
        await fs.symlink(srcDir, linkTarget, 'dir')
      } catch (symlinkErr) {
        // If symlink fails (e.g., permissions, cross-device), copy instead (skipping symlinks in source).
        // Log the original error so disk/permission issues are visible rather than silently falling back.
        console.warn(`[buildPlugin] Failed to symlink core skills directory from ${srcDir} to ${linkTarget}. Falling back to copy.`, symlinkErr)
        await copyDir(srcDir, linkTarget)
      }
    }

    // Initialize build result
    const result: PluginBuildResult = {
      buildId,
      status: 'building',
      logs: [],
      manifest,
      createdAt: new Date().toISOString(),
    }
    buildResults.set(buildId, result)

    // Run build asynchronously. runBuild owns all buildResults state updates (both
    // success and failure paths) via its own internal try/catch, so the outer .catch
    // must never write to buildResults — doing so would race with runBuild's atomic
    // replacement and could overwrite a 'complete' or 'failed' result with a stale
    // snapshot taken before runBuild ran.
    runBuild(buildId, buildDir, manifest).catch(err => {
      console.error(`Build ${buildId} failed unexpectedly outside runBuild:`, err)
    }).finally(() => {
      activeOps = Math.max(0, activeOps - 1)
    })

    return { data: result, status: 202 }
  } catch (error) {
    activeOps = Math.max(0, activeOps - 1)
    console.error('Error starting plugin build:', error)
    return { error: 'Failed to start plugin build', status: 500 }
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

  const scanId = randomUUID().slice(0, 8)
  const scanDir = path.join(os.tmpdir(), `ai-maestro-scan-${scanId}`)

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

    const exitCode = (error as any)?.code
    let message = error instanceof Error ? error.message : String(error)
    // Append stderr from execPromise errors so callers get full git diagnostics
    const stderr = (error as any)?.stderr
    if (stderr) {
      message += `\nStderr: ${stderr}`
    }

    if (exitCode === 128 || message.includes('not found')) {
      return { error: `Repository not found or access denied: ${url}`, status: 404 }
    }
    console.error('Error scanning repo:', error)
    return { error: `Failed to scan repository: ${message}`, status: 500 }
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

  const pushId = randomUUID().slice(0, 8)
  const pushDir = path.join(os.tmpdir(), `ai-maestro-push-${pushId}`)

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

    // Check if there are staged changes to commit.
    // 'git status --porcelain' reports the entire working tree, including untracked and
    // unstaged changes in the cloned repo that have nothing to do with our manifest file.
    // This causes 'git commit' to fail with "nothing to commit" when the manifest file
    // was already up to date (not staged), but other dirt was present in the work tree.
    // 'git diff --cached --name-only' inspects only the staging area, so it is true if
    // and only if plugin.manifest.json was actually changed and staged by the 'git add' above.
    const diffOutput = await execPromise('git', ['diff', '--cached', '--name-only'], { cwd: pushDir })
    if (!diffOutput.trim()) {
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

    // Set the remote URL to include credentials when a token is provided.
    // This is required for authenticated pushes in non-interactive (server) environments.
    if (config.token) {
      const parsed = new URL(config.forkUrl)
      const authedUrl = `https://x-access-token:${config.token}@${parsed.host}${parsed.pathname}`
      await execPromise('git', ['remote', 'set-url', 'origin', authedUrl], { cwd: pushDir })
    }

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
    let message = error instanceof Error ? error.message : String(error)
    // Append stderr from execPromise errors so callers get full git diagnostics
    const stderr = (error as any)?.stderr
    if (stderr) {
      message += `\nStderr: ${stderr}`
    }
    console.error('Error pushing to GitHub:', error)
    return { error: `Failed to push to GitHub: ${message}`, status: 500 }
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
  const existing = buildResults.get(buildId)
  if (!existing) return

  try {
    const output = await execPromise(
      path.join(buildDir, 'build-plugin.sh'),
      ['--clean'],
      { cwd: buildDir, timeout: 120000 }
    )

    // Parse output for stats
    const outputPath = path.join(buildDir, manifest.output)
    const stats = { skills: 0, scripts: 0, hooks: 0 }

    try {
      // Suppress only ENOENT (directory absent) — log unexpected errors so disk/permission
      // issues are visible in logs rather than silently producing wrong zero counts.
      const skillEntries = await fs.readdir(path.join(outputPath, 'skills')).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') console.warn(`[runBuild] Error reading skills dir for build ${buildId}:`, err)
        return [] as string[]
      })
      stats.skills = skillEntries.length

      const scriptEntries = await fs.readdir(path.join(outputPath, 'scripts')).catch((err: NodeJS.ErrnoException) => {
        if (err.code !== 'ENOENT') console.warn(`[runBuild] Error reading scripts dir for build ${buildId}:`, err)
        return [] as string[]
      })
      stats.scripts = scriptEntries.length

      try {
        await fs.access(path.join(outputPath, 'hooks', 'hooks.json'))
        stats.hooks = 1
      } catch (err: unknown) {
        // Only suppress "file not found" — log unexpected errors (permissions, etc.)
        if ((err as NodeJS.ErrnoException).code !== 'ENOENT') {
          console.warn(`[runBuild] Error accessing hooks.json for build ${buildId}:`, err)
        }
        stats.hooks = 0
      }
    } catch (statsError) {
      // Outer catch: non-critical failure during stats collection — log for visibility
      console.warn(`[runBuild] Stats collection failed for build ${buildId}:`, statsError)
    }

    // Atomic replacement: avoids torn reads from polling clients
    buildResults.set(buildId, {
      ...existing,
      status: 'complete',
      outputPath,
      logs: output.split('\n'),
      stats,
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    const stderr = (error as any)?.stderr
    const logs = [message]
    if (stderr) logs.push(...String(stderr).split('\n'))

    // Atomic replacement
    buildResults.set(buildId, {
      ...existing,
      status: 'failed',
      logs,
    })
  }
}

/**
 * Find SKILL.md files in a directory and extract metadata.
 */
async function findSkillsInDir(dir: string): Promise<RepoSkillInfo[]> {
  const skills: RepoSkillInfo[] = []

  // Resolve the canonical root path upfront so symlink traversal can be detected.
  // If realpath fails (e.g. the directory was already removed) return empty — there
  // is nothing useful to scan.
  let realDir: string
  try {
    realDir = await fs.realpath(dir)
  } catch (err) {
    console.warn(`[findSkillsInDir] Failed to resolve real path for initial directory ${dir}:`, err)
    return []
  }

  async function scan(currentDir: string, depth: number = 0) {
    if (depth > 5) return
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        // Skip symlinks to prevent reading outside the cloned repo
        if (entry.isSymbolicLink()) continue

        const fullPath = path.join(currentDir, entry.name)
        if (entry.isFile() && entry.name === 'SKILL.md') {
          const content = await fs.readFile(fullPath, 'utf-8')
          const parsed = matter(content)
          const frontmatter = parsed.data as Record<string, unknown>
          const skillFolder = path.basename(path.dirname(fullPath))
          const relativePath = path.relative(dir, path.dirname(fullPath))

          // Use String() coercion (not type assertion) so non-string YAML values
          // (e.g., numeric `name: 123`) are properly converted to strings rather
          // than silently bypassing the `||` fallback as a truthy non-string.
          skills.push({
            name: frontmatter.name != null ? String(frontmatter.name) : skillFolder,
            path: relativePath,
            description: frontmatter.description != null ? String(frontmatter.description) : '',
          })
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          // Verify the directory is still within the scan root.
          // Wrap in its own try/catch so a broken symlink or permission error on one
          // sub-directory doesn't abort scanning of sibling directories.
          let realPath: string
          try {
            realPath = await fs.realpath(fullPath)
          } catch (realpathErr) {
            console.warn(`[findSkillsInDir] Failed to resolve real path for ${fullPath}. Skipping.`, realpathErr)
            continue
          }
          if (realPath.startsWith(realDir)) {
            await scan(fullPath, depth + 1)
          }
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
    const entries = await fs.readdir(scriptsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && !entry.isSymbolicLink() && entry.name.endsWith('.sh')) {
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
 * Falls back to 'unnamed-source' when all characters are stripped (e.g., input is "https://---.git").
 */
function sanitizeSourceName(url: string): string {
  const sanitized = url
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
  return sanitized || 'unnamed-source'
}

/**
 * Trusted commands that may be executed by this service.
 * execFile does not invoke a shell, but an unrestricted command string could still
 * allow callers to execute arbitrary binaries. An explicit allowlist prevents any
 * future code path from accidentally passing user-controlled input as the command.
 */
const ALLOWED_COMMANDS = new Set(['git'])

/**
 * Promisified execFile with stdout capture.
 * Rejects immediately if `command` is not in ALLOWED_COMMANDS and is not an
 * absolute path confined to BUILDS_DIR — preventing command-injection escalation.
 */
function execPromise(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<string> {
  // Guard: command must be a known safe binary name or an absolute path inside
  // the builds temp directory (the only non-git executable this service runs).
  if (!ALLOWED_COMMANDS.has(command)) {
    if (!path.isAbsolute(command)) {
      return Promise.reject(new Error(`execPromise: command must be an absolute path or a known safe command, got: "${command}"`))
    }
    const resolvedCommand = path.normalize(command)
    if (!resolvedCommand.startsWith(path.normalize(BUILDS_DIR) + path.sep)) {
      return Promise.reject(new Error(`execPromise: command path "${command}" is outside the allowed builds directory`))
    }
  }

  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      timeout: options.timeout || 60000,
      maxBuffer: 10 * 1024 * 1024, // 10MB — git clones and build-script output can be large
    }, (error, stdout, stderr) => {
      if (error) {
        const err = error as any
        err.stderr = stderr
        reject(err)
      } else {
        resolve(stdout)
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
      await fs.copyFile(srcPath, destPath)
    }
  }
}
