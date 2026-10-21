import * as fs from 'fs'
import * as path from 'path'

/** Claude Code names a project folder after its working directory with every character that is not a letter or digit turned into "-". */
export function encodeClaudeProjectDir(cwd: string): string {
  return cwd.replace(/[^a-zA-Z0-9]/g, '-')
}

/** Claude Code cuts a longer name at this length and appends "-" and a hash. */
const MAX_ENCODED_LENGTH = 200

/**
 * The folders under `~/.claude/projects` that can hold transcripts started in any of `cwds`.
 * A short name is one exact folder. A name past the length limit is stored cut and hashed, so it
 * is found by its first 200 characters.
 */
export function claudeProjectFolders(projectsDir: string, cwds: Iterable<string>): string[] {
  const found = new Set<string>()
  let entries: string[] | null = null
  for (const cwd of cwds) {
    const encoded = encodeClaudeProjectDir(cwd)
    if (encoded.length <= MAX_ENCODED_LENGTH) {
      const dir = path.join(projectsDir, encoded)
      if (fs.existsSync(dir)) found.add(dir)
      continue
    }
    if (entries === null) {
      try { entries = fs.readdirSync(projectsDir) } catch { entries = [] }
    }
    const prefix = encoded.slice(0, MAX_ENCODED_LENGTH)
    for (const name of entries) if (name.startsWith(prefix)) found.add(path.join(projectsDir, name))
  }
  return [...found]
}
