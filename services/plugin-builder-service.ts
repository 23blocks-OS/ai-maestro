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

// In-memory build status tracking
const buildResults = new Map<string, PluginBuildResult>()

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

  // Marketplace skills — group by marketplace:plugin combo
  const marketplaceGroups = new Map<string, Extract<PluginSkillSelection, { type: 'marketplace' }>[]>()
  for (const skill of marketplaceSkills) {
    const key = `${skill.marketplace}:${skill.plugin}`
    const group = marketplaceGroups.get(key) || []
    group.push(skill)
    marketplaceGroups.set(key, group)
  }

  for (const [key, skills] of marketplaceGroups) {
    const [marketplace, plugin] = key.split(':')
    // Marketplace plugins are installed at ~/.claude/plugins/marketplaces/<marketplace>
    const installPath = path.join(os.homedir(), '.claude', 'plugins', 'marketplaces', marketplace)
    const map: Record<string, string> = {}
    for (const skill of skills) {
      // Extract skill name from the id (marketplace:plugin:skillName)
      const skillName = skill.id.split(':')[2]
      map[`skills/${skillName}`] = `skills/${skillName}`
    }
    sources.push({
      name: `${plugin}-from-${marketplace}`,
      description: `Skills from ${plugin} plugin (${marketplace} marketplace)`,
      type: 'local',
      path: installPath,
      map,
    })
  }

  // Repo skills — group by repo URL
  const repoGroups = new Map<string, Extract<PluginSkillSelection, { type: 'repo' }>[]>()
  for (const skill of repoSkills) {
    const key = `${skill.url}@${skill.ref}`
    const group = repoGroups.get(key) || []
    group.push(skill)
    repoGroups.set(key, group)
  }

  for (const [, skills] of repoGroups) {
    const first = skills[0]
    const map: Record<string, string> = {}
    for (const skill of skills) {
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
  try {
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
        // If symlink fails (e.g., permissions), copy instead
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
    })

    return { data: result, status: 202 }
  } catch (error) {
    console.error('Error starting plugin build:', error)
    return { error: 'Failed to start plugin build', status: 500 }
  }
}

/**
 * Get the status of a running or completed build.
 */
export async function getBuildStatus(buildId: string): Promise<ServiceResult<PluginBuildResult>> {
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
  const scanId = randomUUID().slice(0, 8)
  const scanDir = path.join(os.tmpdir(), `ai-maestro-scan-${scanId}`)

  try {
    // Validate URL format
    if (!url.match(/^https?:\/\/.+/) && !url.match(/^git@.+/)) {
      return { error: 'Invalid repository URL. Must be an HTTPS or SSH git URL.', status: 400 }
    }

    // Shallow clone
    await execPromise('git', ['clone', '--depth', '1', '--branch', ref, url, scanDir], {
      timeout: 30000,
    })

    // Find SKILL.md files
    const skills = await findSkillsInDir(scanDir)

    // Find scripts (*.sh files in scripts/ directory)
    const scripts = await findScriptsInDir(scanDir)

    // Clean up
    await fs.rm(scanDir, { recursive: true, force: true })

    return {
      data: {
        url,
        ref,
        skills,
        scripts,
      },
      status: 200,
    }
  } catch (error: any) {
    // Clean up on error
    await fs.rm(scanDir, { recursive: true, force: true }).catch(() => {})

    if (error.message?.includes('not found') || error.message?.includes('128')) {
      return { error: `Repository not found or access denied: ${url}`, status: 404 }
    }
    console.error('Error scanning repo:', error)
    return { error: `Failed to scan repository: ${error.message || 'Unknown error'}`, status: 500 }
  }
}

/**
 * Push a generated manifest to the user's fork on GitHub.
 */
export async function pushToGitHub(config: PluginPushConfig): Promise<ServiceResult<PluginPushResult>> {
  const pushId = randomUUID().slice(0, 8)
  const pushDir = path.join(os.tmpdir(), `ai-maestro-push-${pushId}`)

  try {
    const branch = config.branch || 'main'

    // Clone the fork
    await execPromise('git', ['clone', '--depth', '1', '--branch', branch, config.forkUrl, pushDir], {
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

    await execPromise('git', [
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
  } catch (error: any) {
    await fs.rm(pushDir, { recursive: true, force: true }).catch(() => {})
    console.error('Error pushing to GitHub:', error)
    return {
      error: `Failed to push to GitHub: ${error.message || 'Unknown error'}`,
      status: 500,
    }
  }
}

// ============================================================================
// INTERNAL HELPERS
// ============================================================================

/**
 * Run build-plugin.sh in the build directory and capture output.
 */
async function runBuild(buildId: string, buildDir: string, manifest: PluginManifest): Promise<void> {
  const result = buildResults.get(buildId)
  if (!result) return

  try {
    const output = await execPromise(
      path.join(buildDir, 'build-plugin.sh'),
      ['--clean'],
      { cwd: buildDir, timeout: 120000 }
    )

    // Parse output for stats
    const outputPath = path.join(buildDir, manifest.output)
    let stats = { skills: 0, scripts: 0, hooks: 0 }

    try {
      // Count skills
      const skillsDir = path.join(outputPath, 'skills')
      const skillEntries = await fs.readdir(skillsDir).catch(() => [] as string[])
      stats.skills = skillEntries.length

      // Count scripts
      const scriptsDir = path.join(outputPath, 'scripts')
      const scriptEntries = await fs.readdir(scriptsDir).catch(() => [] as string[])
      stats.scripts = scriptEntries.length

      // Check hooks
      const hooksFile = path.join(outputPath, 'hooks', 'hooks.json')
      try {
        await fs.access(hooksFile)
        stats.hooks = 1
      } catch {
        stats.hooks = 0
      }
    } catch {
      // Stats collection failed — non-critical
    }

    result.status = 'complete'
    result.outputPath = outputPath
    result.logs = output.split('\n')
    result.stats = stats
  } catch (error: any) {
    result.status = 'failed'
    result.logs = [error.message || 'Build failed']
    if (error.stderr) {
      result.logs.push(...error.stderr.split('\n'))
    }
  }
}

/**
 * Find SKILL.md files in a directory and extract metadata.
 */
async function findSkillsInDir(dir: string): Promise<RepoSkillInfo[]> {
  const skills: RepoSkillInfo[] = []

  async function scan(currentDir: string, depth: number = 0) {
    if (depth > 5) return
    try {
      const entries = await fs.readdir(currentDir, { withFileTypes: true })
      for (const entry of entries) {
        const fullPath = path.join(currentDir, entry.name)
        if (entry.isFile() && entry.name === 'SKILL.md') {
          const content = await fs.readFile(fullPath, 'utf-8')
          const parsed = matter(content)
          const frontmatter = parsed.data as Record<string, any>
          const skillFolder = path.basename(path.dirname(fullPath))
          const relativePath = path.relative(dir, path.dirname(fullPath))

          skills.push({
            name: frontmatter.name || skillFolder,
            path: relativePath,
            description: frontmatter.description || '',
          })
        } else if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
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
    const entries = await fs.readdir(scriptsDir, { withFileTypes: true })
    for (const entry of entries) {
      if (entry.isFile() && entry.name.endsWith('.sh')) {
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
      maxBuffer: 10 * 1024 * 1024, // 10MB
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
 * Recursively copy a directory.
 */
async function copyDir(src: string, dest: string): Promise<void> {
  await fs.mkdir(dest, { recursive: true })
  const entries = await fs.readdir(src, { withFileTypes: true })
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      await copyDir(srcPath, destPath)
    } else {
      await fs.copyFile(srcPath, destPath)
    }
  }
}
