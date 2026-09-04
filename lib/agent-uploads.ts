/**
 * Files handed to an agent from the web UI — pasted screenshots, dropped PDFs.
 *
 * WHY A PATH AND NOT THE BYTES
 *
 * Agent CLIs read files from disk. Claude Code takes a path and opens it; so do
 * Codex and Aider. Pushing base64 into the pane would be both enormous and
 * wrong — a megabyte screenshot becomes 1.3 MB of text typed one keystroke-batch
 * at a time into a TUI that will mangle it. So the file is written to disk on
 * the agent's own host and the agent is told where it is.
 *
 * WHERE IT LANDS, AND WHY NOT THE WORKING DIRECTORY
 *
 * Under ~/.aimaestro/uploads/<agentId>/, never inside the agent's
 * workingDirectory. That directory is usually a git repository someone is
 * actually working in, and dropping screenshots into it means they show up in
 * `git status`, get committed by an agent tidying up, or collide with real
 * files. An absolute path outside the repo reads just as well to every CLI and
 * cannot pollute anything.
 *
 * VALIDATION IS THE SAME AS ATTACHMENTS
 *
 * Deliberately reuses lib/amp-attachments rather than growing a second, weaker
 * set of rules. This is a file arriving from a browser and being written to a
 * host's filesystem; it deserves at least what an AMP attachment gets —
 * filename sanitising, blocked executables, magic-byte checking against the
 * declared type, and a size ceiling.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import {
  MAX_ATTACHMENT_SIZE,
  checkMagicBytes,
  computeDigest,
  isBlockedType,
  sanitizeFilename,
} from '@/lib/amp-attachments'

/** Root for everything uploaded to agents on this host. */
export function uploadsRoot(): string {
  return path.join(os.homedir(), '.aimaestro', 'uploads')
}

export function agentUploadDir(agentId: string): string {
  return path.join(uploadsRoot(), agentId)
}

/**
 * A pasted screenshot has no filename — the clipboard gives a blob and a MIME
 * type. Generate something readable and sortable rather than a uuid, because
 * the agent quotes this path back to a human.
 */
export function defaultNameFor(contentType: string, now: Date): string {
  const ext = ({
    'image/png': 'png',
    'image/jpeg': 'jpg',
    'image/gif': 'gif',
    'image/webp': 'webp',
    'application/pdf': 'pdf',
    'text/plain': 'txt',
  } as Record<string, string>)[contentType.toLowerCase().split(';')[0].trim()] || 'bin'

  const stamp = now.toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
  return `pasted_${stamp}.${ext}`
}

export interface StoredUpload {
  path: string
  filename: string
  size: number
  digest: string
}

export type UploadRejection = { reason: string }

/**
 * Validate and store one file for an agent.
 *
 * `agentId` is used as a directory name, so it is checked rather than trusted:
 * this value arrives from a URL and would otherwise be a path traversal.
 */
export function storeUpload(
  agentId: string,
  bytes: Buffer,
  declared: { filename?: string | null; contentType?: string | null },
  now: Date = new Date()
): StoredUpload | UploadRejection {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(agentId)) {
    return { reason: 'invalid agent id' }
  }
  if (bytes.length === 0) {
    return { reason: 'file is empty' }
  }
  if (bytes.length > MAX_ATTACHMENT_SIZE) {
    return { reason: `file exceeds the ${Math.round(MAX_ATTACHMENT_SIZE / 1024 / 1024)} MB limit` }
  }

  const contentType = (declared.contentType || 'application/octet-stream').toLowerCase().split(';')[0].trim()

  // A pasted image has no name; a dropped file does. Either way the result must
  // survive being used as a filename.
  const filename = declared.filename
    ? sanitizeFilename(declared.filename) || defaultNameFor(contentType, now)
    : defaultNameFor(contentType, now)

  const blocked = isBlockedType(contentType, filename)
  if (blocked) return { reason: blocked }

  // The same primary-type check attachments get: content that disagrees with
  // its declared type, or is an executable however it is labelled.
  const magic = checkMagicBytes(bytes, contentType)
  if (magic) return { reason: magic }

  const dir = agentUploadDir(agentId)
  fs.mkdirSync(dir, { recursive: true })

  // Never overwrite. Two screenshots pasted in the same second must not silently
  // become one, and an agent told about a path should find what it was told
  // about.
  let target = path.join(dir, filename)
  if (fs.existsSync(target)) {
    const ext = path.extname(filename)
    const base = path.basename(filename, ext)
    let n = 2
    while (fs.existsSync(target) && n < 1000) {
      target = path.join(dir, `${base}_${n}${ext}`)
      n++
    }
  }

  // Write then rename, so a reader never sees a partial file under a name we
  // have already told an agent about.
  const tmp = `${target}.part`
  fs.writeFileSync(tmp, bytes, { mode: 0o600 })
  fs.renameSync(tmp, target)

  return {
    path: target,
    filename: path.basename(target),
    size: bytes.length,
    digest: computeDigest(bytes),
  }
}

export function isRejection(r: StoredUpload | UploadRejection): r is UploadRejection {
  return 'reason' in r
}

/**
 * What to type into the agent's pane.
 *
 * Phrased as a sentence rather than a bare path because it is submitted as a
 * PROMPT: a bare path is ambiguous ("what do you want me to do with it?"),
 * while this reads as an instruction and works for a screenshot and a PDF
 * alike. The path is quoted so spaces cannot split it, though sanitizeFilename
 * already rules them out.
 */
export function promptFor(uploads: StoredUpload[]): string {
  if (uploads.length === 1) {
    return `I've attached a file for you at "${uploads[0].path}" — please read it.`
  }
  const list = uploads.map(u => `"${u.path}"`).join(', ')
  return `I've attached ${uploads.length} files for you: ${list} — please read them.`
}
