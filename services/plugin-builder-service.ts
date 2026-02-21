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
    if (skill.type === 'repo') {
      const urlErr = validateGitUrl(skill.url)
      if (urlErr) return `Repo skill "${skill.name}": ${urlErr}`
      const refErr = validateGitRef(skill.ref)
      if (refErr) return `Repo skill "${skill.name}": ${refErr}`
      const pathErr = validateSkillPath(skill.skillPath)
      if (pathErr) return `Repo skill "${skill.name}": ${pathErr}`
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
    const age = now - new Date(result.createdAt).getTime()
    if (age > BUILD_TTL_MS) {
      buildResults.delete(id)
      // Best-effort cleanup of build directory
      const buildDir = path.join(BUILDS_DIR, id)
      fs.rm(buildDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  // If still over limit, evict oldest
  if (buildResults.size > MAX_BUILD_RESULTS) {
    const entries = [...buildResults.entries()]
      .sort((a, b) => new Date(a[1].createdAt).getTime() - new Date(b[1].createdAt).getTime())
    const toRemove = entries.slice(0, entries.length - MAX_BUILD_RESULTS)
    for (const [id] of toRemove) {
      buildResults.delete(id)
      const buildDir = path.join(BUILDS_DIR, id)
      fs.rm(buildDir, { recursive: true, force: true }).catch(() => {})
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
    const installPath = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', group.marketplace)
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

  try {
    // Evict stale builds before adding new ones
    evictStaleBuildResults()

    activeOps++
    const buildId = randomUUID()
    const buildDir = path.join(BUILDS_DIR, buildId)

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
      } catch {
        // If symlink fails (e.g., permissions), copy instead (skipping symlinks in source)
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

    // Run build asynchronously
    runBuild(buildId, buildDir, manifest).catch(err => {
      console.error(`Build ${buildId} failed:`, err)
      // Ensure status is updated even on unexpected errors
      const r = buildResults.get(buildId)
      if (r && r.status === 'building') {
        buildResults.set(buildId, {
          ...r,
          status: 'failed',
          logs: [err instanceof Error ? err.message : String(err)],
        })
      }
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
    const message = error instanceof Error ? error.message : String(error)

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
    const message = error instanceof Error ? error.message : String(error)
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
      const skillEntries = await fs.readdir(path.join(outputPath, 'skills')).catch(() => [] as string[])
      stats.skills = skillEntries.length

      const scriptEntries = await fs.readdir(path.join(outputPath, 'scripts')).catch(() => [] as string[])
      stats.scripts = scriptEntries.length

      try {
        await fs.access(path.join(outputPath, 'hooks', 'hooks.json'))
        stats.hooks = 1
      } catch {
        stats.hooks = 0
      }
    } catch {
      // Stats collection failed — non-critical
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
  const realDir = await fs.realpath(dir)

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

          skills.push({
            name: (frontmatter.name as string) || skillFolder,
            path: relativePath,
            description: (frontmatter.description as string) || '',
          })
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
          // Verify the directory is still within the scan root
          const realPath = await fs.realpath(fullPath)
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
 */
function sanitizeSourceName(url: string): string {
  return url
    .replace(/^https?:\/\//, '')
    .replace(/\.git$/, '')
    .replace(/[^a-zA-Z0-9-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

/**
 * Promisified execFile with stdout capture.
 */
function execPromise(
  command: string,
  args: string[],
  options: { cwd?: string; timeout?: number } = {}
): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(command, args, {
      cwd: options.cwd,
      timeout: options.timeout || 60000,
      maxBuffer: 2 * 1024 * 1024, // 2MB (reduced from 10MB)
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
