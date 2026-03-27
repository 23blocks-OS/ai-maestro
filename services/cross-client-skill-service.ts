/**
 * Cross-Client Skill Installation Service
 *
 * Downloads ai-maestro skills from the GitHub plugin repo and copies them
 * into non-Claude agents' skill directories (.codex/skills/, .gemini/skills/).
 *
 * Claude agents use the plugin system (claude plugin install ai-maestro) -- this service
 * handles Codex, Gemini, and Aider which have no native plugin mechanism.
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import { execFile } from 'child_process'
import { promisify } from 'util'
import type { ClientType } from '@/lib/client-capabilities'

const execFileAsync = promisify(execFile)

// Canonical GitHub repo containing the ai-maestro skills
const SKILL_REPO = 'https://github.com/Emasoft/ai-maestro-plugin.git'

// Skills that rely on Claude-specific APIs (hooks, scoped tool permissions)
const CLAUDE_ONLY_SKILLS = ['debug-hooks']

export interface SkillInstallResult {
  installed: string[]
  skipped: string[]
  errors: Array<{ skill: string; error: string }>
}

/**
 * Return the client-specific skill directory path, or null if the client
 * does not support skills or has no known path convention.
 */
export function getSkillTargetPath(clientType: ClientType, workDir: string): string | null {
  switch (clientType) {
    case 'codex':  return path.join(workDir, '.codex', 'skills')
    case 'gemini': return path.join(workDir, '.gemini', 'skills')
    case 'aider':  return path.join(workDir, 'skills')  // Aider uses project-local skills/ via aider-skills package
    default:       return null
  }
}

/**
 * Download the skills/ directory from the ai-maestro-plugin GitHub repo
 * into a temporary directory using a sparse git clone (only the skills/ tree).
 * Returns the path to the temporary skills directory.
 */
async function downloadSkillsFromGitHub(): Promise<string> {
  const tmpDir = path.join(os.tmpdir(), `aim-skills-${Date.now()}`)
  await fs.mkdir(tmpDir, { recursive: true })

  try {
    // Sparse clone: only fetch the skills/ directory (minimal bandwidth)
    await execFileAsync('git', [
      'clone', '--depth', '1', '--filter=blob:none', '--sparse',
      SKILL_REPO, tmpDir,
    ], { timeout: 60_000 })

    await execFileAsync('git', [
      '-C', tmpDir, 'sparse-checkout', 'set', 'skills',
    ], { timeout: 30_000 })

    const skillsDir = path.join(tmpDir, 'skills')
    // Verify the skills directory actually exists after checkout
    await fs.access(skillsDir)
    return skillsDir
  } catch (err) {
    // Clean up on failure so we don't leak temp directories
    await fs.rm(tmpDir, { recursive: true, force: true }).catch(() => {})
    throw new Error(
      `Failed to download skills from GitHub: ${err instanceof Error ? err.message : String(err)}`
    )
  }
}

/**
 * Recursively copy a directory tree (skill folder) to a target path.
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

/**
 * Install ai-maestro skills into a non-Claude agent's working directory.
 * Downloads from GitHub, copies each skill folder to the client-specific path.
 *
 * - Claude agents are skipped (they use the plugin system).
 * - Aider agents also get the `aider-skills` package installed into the project venv.
 * - Claude-only skills (debug-hooks) are skipped for all non-Claude clients.
 */
export async function installSkillsForClient(
  clientType: ClientType,
  workingDirectory: string
): Promise<SkillInstallResult> {
  // Claude uses its own plugin system
  if (clientType === 'claude') {
    return { installed: [], skipped: ['claude uses plugin system'], errors: [] }
  }

  const skillPath = getSkillTargetPath(clientType, workingDirectory)
  if (!skillPath) {
    return {
      installed: [],
      skipped: [],
      errors: [{ skill: '*', error: `No skill path for client type "${clientType}"` }],
    }
  }

  // Ensure target directory exists
  await fs.mkdir(skillPath, { recursive: true })

  let skillsSourceDir: string
  let tmpRoot: string | null = null
  try {
    skillsSourceDir = await downloadSkillsFromGitHub()
    // The tmpRoot is the parent of the skills/ dir inside the clone
    tmpRoot = path.dirname(skillsSourceDir)
  } catch (err) {
    return {
      installed: [],
      skipped: [],
      errors: [{ skill: '*', error: err instanceof Error ? err.message : String(err) }],
    }
  }

  const result: SkillInstallResult = { installed: [], skipped: [], errors: [] }

  try {
    const skillFolders = await fs.readdir(skillsSourceDir, { withFileTypes: true })

    for (const entry of skillFolders) {
      if (!entry.isDirectory()) continue
      const skillName = entry.name

      // Skip Claude-only skills for non-Claude clients
      if (CLAUDE_ONLY_SKILLS.includes(skillName)) {
        result.skipped.push(skillName)
        continue
      }

      try {
        const src = path.join(skillsSourceDir, skillName)
        const dest = path.join(skillPath, skillName)
        await copyDir(src, dest)
        result.installed.push(skillName)
      } catch (err) {
        result.errors.push({
          skill: skillName,
          error: err instanceof Error ? err.message : String(err),
        })
      }
    }
  } finally {
    // Always clean up the temporary clone directory
    if (tmpRoot) {
      await fs.rm(tmpRoot, { recursive: true, force: true }).catch(() => {})
    }
  }

  // For Aider: ensure the aider-skills package is installed in the project venv
  // so the agent can load skills via `aider --read $(aider-skills tmpfile ./skills)`
  if (clientType === 'aider' && result.installed.length > 0) {
    try {
      // Create venv if it doesn't exist, then install aider-skills into it
      const venvDir = path.join(workingDirectory, '.venv')
      try { await fs.access(venvDir) } catch {
        await execFileAsync('uv', ['venv', '--python', '3.12', venvDir], {
          cwd: workingDirectory, timeout: 60_000,
        })
      }
      await execFileAsync('uv', ['pip', 'install', '--python', path.join(venvDir, 'bin', 'python'), 'aider-skills'], {
        cwd: workingDirectory, timeout: 60_000,
      })
      console.log('[cross-client] Installed aider-skills package into agent venv')
    } catch (err) {
      // Non-blocking — skills are copied, package install is best-effort
      console.warn('[cross-client] Failed to install aider-skills package:', err instanceof Error ? err.message : err)
      result.errors.push({ skill: 'aider-skills-package', error: `Package install failed: ${err instanceof Error ? err.message : String(err)}` })
    }
  }

  return result
}

/**
 * Update (overwrite) skills for a non-Claude client.
 * Same as install but explicitly for re-installation when marketplace updates.
 */
export async function updateSkillsForClient(
  clientType: ClientType,
  workingDirectory: string
): Promise<SkillInstallResult> {
  // Identical to install -- copyDir overwrites existing files
  return installSkillsForClient(clientType, workingDirectory)
}
