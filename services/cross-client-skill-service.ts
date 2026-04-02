/**
 * Cross-Client Skill Conversion Service
 *
 * Converts skills between AI clients by copying skill folders from the source
 * client's installed location to the target client's skill directory.
 *
 * Supported clients: Claude, Codex, Gemini (Aider dropped — dead platform).
 * All clients use the same SKILL.md format (YAML frontmatter + markdown body),
 * so conversion is a direct copy — no format transformation needed.
 *
 * Source locations searched (in order):
 * 1. Plugin cache: ~/.claude/plugins/cache/.../skills/<name>/
 * 2. User-scope skills: ~/.<client>/skills/<name>/
 * 3. Project-scope skills: ./<client>/skills/<name>/ (relative to workDir)
 */

import fs from 'fs/promises'
import path from 'path'
import os from 'os'
import type { ClientType } from '@/lib/client-capabilities'

export interface SkillConvertResult {
  success: boolean
  skillName: string
  sourceClient: ClientType
  targetClient: ClientType
  sourcePath: string
  targetPath: string
  error?: string
}

export interface SkillLocation {
  skillName: string
  skillPath: string
  scope: 'plugin' | 'user' | 'project'
  client: ClientType
}

/** Client skill directory paths (user scope) */
const USER_SKILL_DIRS: Partial<Record<ClientType, string>> = {
  claude: path.join(os.homedir(), '.claude', 'skills'),
  codex: path.join(os.homedir(), '.codex', 'skills'),
  gemini: path.join(os.homedir(), '.gemini', 'skills'),
}

/** Supported target clients for conversion */
const SUPPORTED_TARGETS: ClientType[] = ['claude', 'codex', 'gemini']

/**
 * Find a skill on disk by name, searching all known locations for a given client.
 * Returns the path to the skill folder, or null if not found.
 */
export async function findSkillSource(
  skillName: string,
  sourceClient: ClientType,
  projectDir?: string
): Promise<SkillLocation | null> {
  const locations: Array<{ path: string; scope: SkillLocation['scope'] }> = []

  // 1. Plugin cache (Claude only — other clients don't use plugins)
  if (sourceClient === 'claude') {
    const cacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache')
    try {
      // Search all marketplace/plugin dirs for a skill folder matching the name
      const marketplaces = await fs.readdir(cacheDir, { withFileTypes: true })
      for (const mp of marketplaces) {
        if (!mp.isDirectory()) continue
        const mpPath = path.join(cacheDir, mp.name)
        // Walk plugin dirs inside marketplace
        const plugins = await fs.readdir(mpPath, { withFileTypes: true }).catch(() => [])
        for (const plugin of plugins) {
          if (!plugin.isDirectory()) continue
          // Plugin may have version subdirs
          const pluginPath = path.join(mpPath, plugin.name)
          const versions = await fs.readdir(pluginPath, { withFileTypes: true }).catch(() => [])
          for (const ver of versions) {
            if (!ver.isDirectory()) continue
            const skillDir = path.join(pluginPath, ver.name, 'skills', skillName)
            const skillMd = path.join(skillDir, 'SKILL.md')
            try {
              await fs.access(skillMd)
              locations.push({ path: skillDir, scope: 'plugin' })
            } catch { /* not here */ }
          }
          // Also check if skills/ is directly under the plugin (no version subdir)
          const directSkillDir = path.join(pluginPath, 'skills', skillName)
          try {
            await fs.access(path.join(directSkillDir, 'SKILL.md'))
            locations.push({ path: directSkillDir, scope: 'plugin' })
          } catch { /* not here */ }
        }
      }
    } catch { /* cache dir doesn't exist */ }
  }

  // 2. User-scope skills dir
  const userDir = USER_SKILL_DIRS[sourceClient]
  if (userDir) {
    const skillDir = path.join(userDir, skillName)
    try {
      await fs.access(path.join(skillDir, 'SKILL.md'))
      locations.push({ path: skillDir, scope: 'user' })
    } catch { /* not here */ }
  }

  // 3. Project-scope skills dir
  if (projectDir) {
    const clientPrefix = sourceClient === 'claude' ? '.claude' : sourceClient === 'codex' ? '.codex' : '.gemini'
    const projSkillDir = path.join(projectDir, clientPrefix, 'skills', skillName)
    try {
      await fs.access(path.join(projSkillDir, 'SKILL.md'))
      locations.push({ path: projSkillDir, scope: 'project' })
    } catch { /* not here */ }
  }

  if (locations.length === 0) return null

  // Prefer plugin > user > project (plugin cache has the most up-to-date version)
  const best = locations.find(l => l.scope === 'plugin')
    || locations.find(l => l.scope === 'user')
    || locations[0]

  return {
    skillName,
    skillPath: best.path,
    scope: best.scope,
    client: sourceClient,
  }
}

/**
 * Recursively copy a directory tree.
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
 * Convert a skill from one client to another.
 * Finds the skill in the source client's directories, copies it to the target client's user-scope dir.
 */
export async function convertSkill(
  skillName: string,
  sourceClient: ClientType,
  targetClient: ClientType,
  projectDir?: string
): Promise<SkillConvertResult> {
  // Validate target
  if (!SUPPORTED_TARGETS.includes(targetClient)) {
    return {
      success: false, skillName, sourceClient, targetClient,
      sourcePath: '', targetPath: '',
      error: `Unsupported target client: ${targetClient}. Supported: ${SUPPORTED_TARGETS.join(', ')}`,
    }
  }

  // Same client — nothing to do
  if (sourceClient === targetClient) {
    return {
      success: false, skillName, sourceClient, targetClient,
      sourcePath: '', targetPath: '',
      error: 'Source and target client are the same',
    }
  }

  // Find the skill on disk
  const source = await findSkillSource(skillName, sourceClient, projectDir)
  if (!source) {
    return {
      success: false, skillName, sourceClient, targetClient,
      sourcePath: '', targetPath: '',
      error: `Skill "${skillName}" not found in ${sourceClient} (searched plugin cache, user skills, project skills)`,
    }
  }

  // Determine target path
  const targetDir = USER_SKILL_DIRS[targetClient]
  if (!targetDir) {
    return {
      success: false, skillName, sourceClient, targetClient,
      sourcePath: source.skillPath, targetPath: '',
      error: `No user-scope skill directory defined for ${targetClient}`,
    }
  }

  const targetSkillDir = path.join(targetDir, skillName)

  try {
    // Ensure target parent dir exists
    await fs.mkdir(targetDir, { recursive: true })

    // Copy the skill folder
    await copyDir(source.skillPath, targetSkillDir)

    return {
      success: true,
      skillName,
      sourceClient,
      targetClient,
      sourcePath: source.skillPath,
      targetPath: targetSkillDir,
    }
  } catch (err) {
    return {
      success: false, skillName, sourceClient, targetClient,
      sourcePath: source.skillPath, targetPath: targetSkillDir,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

/**
 * List all skills installed for a given client (user-scope only).
 * Returns skill names.
 */
export async function listClientSkills(clientType: ClientType): Promise<string[]> {
  const dir = USER_SKILL_DIRS[clientType]
  if (!dir) return []

  try {
    const entries = await fs.readdir(dir, { withFileTypes: true })
    const skills: string[] = []
    for (const entry of entries) {
      if (!entry.isDirectory()) continue
      // Verify it has a SKILL.md
      try {
        await fs.access(path.join(dir, entry.name, 'SKILL.md'))
        skills.push(entry.name)
      } catch { /* not a valid skill dir */ }
    }
    return skills.sort()
  } catch {
    return []
  }
}

/**
 * Check which target clients a skill can be converted to
 * (i.e., where it's NOT already installed).
 */
export async function getConversionTargets(
  skillName: string,
  sourceClient: ClientType
): Promise<ClientType[]> {
  const targets: ClientType[] = []
  for (const client of SUPPORTED_TARGETS) {
    if (client === sourceClient) continue
    const dir = USER_SKILL_DIRS[client]
    if (!dir) continue
    try {
      await fs.access(path.join(dir, skillName, 'SKILL.md'))
      // Already installed — not a valid target
    } catch {
      targets.push(client)
    }
  }
  return targets
}
