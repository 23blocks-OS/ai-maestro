/**
 * Browse Directory API
 *
 * GET /api/agents/browse-dir?path=/some/directory
 *   Lists files and directories at the given path.
 *   Returns { entries: Array<{ name, type, size }> }
 *
 * GET /api/agents/browse-dir?path=/some/file.md&mode=file
 *   Reads first 500 lines of a text file.
 *   Returns { path, content, truncated }
 *
 * Security: Only allows browsing under ~/agents/, ~/.claude/,
 *           and any path containing /.claude/ (project-local configs).
 */

import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat, readFile } from 'fs/promises'
import { join, resolve, normalize } from 'path'
import { homedir } from 'os'

export const dynamic = 'force-dynamic'

const HOME = homedir()

// Allowed path prefixes (security boundary)
const ALLOWED_PREFIXES = [
  join(HOME, 'agents'),
  join(HOME, '.claude'),
]

// Max lines to return for file preview
const MAX_PREVIEW_LINES = 500
// Max file size to attempt reading (512KB)
const MAX_FILE_SIZE = 512 * 1024
// Binary file extensions that should not be read as text
const BINARY_EXTENSIONS = new Set([
  // Images
  'png', 'jpg', 'jpeg', 'gif', 'bmp', 'ico', 'webp', 'avif', 'tiff', 'tif',
  'heic', 'heif', 'raw', 'cr2', 'nef', 'arw', 'dng', 'psd', 'ai', 'eps',
  'xcf', 'sketch', 'fig', 'indd',
  // Video
  'mp4', 'mkv', 'avi', 'mov', 'wmv', 'flv', 'webm', 'm4v', 'mpg', 'mpeg',
  '3gp', 'ogv', 'ts', 'vob',
  // Audio
  'mp3', 'wav', 'flac', 'aac', 'ogg', 'wma', 'm4a', 'opus', 'aiff', 'mid',
  'midi',
  // Archives & compressed
  'zip', 'gz', 'tar', 'bz2', 'xz', '7z', 'rar', 'zst', 'lz', 'lz4',
  'lzma', 'cab', 'iso', 'dmg', 'pkg', 'deb', 'rpm', 'apk', 'msi',
  'tgz', 'tbz2', 'txz',
  // Executables & native code
  'exe', 'dll', 'so', 'dylib', 'o', 'a', 'lib', 'obj', 'bin', 'elf',
  'com', 'out', 'app', 'mach',
  // Bytecode & compiled
  'wasm', 'pyc', 'pyo', 'class', 'jar', 'war', 'ear',
  // Databases
  'db', 'sqlite', 'sqlite3', 'mdb', 'accdb', 'frm', 'ibd', 'dbf',
  // Fonts
  'woff', 'woff2', 'ttf', 'otf', 'eot', 'pfb', 'pfm',
  // Documents (binary formats)
  'pdf', 'doc', 'docx', 'xls', 'xlsx', 'ppt', 'pptx', 'odt', 'ods', 'odp',
  'rtf', 'epub', 'mobi', 'azw', 'azw3',
  // Keys, certs, secrets
  'pem', 'der', 'p12', 'pfx', 'key', 'crt', 'cer', 'jks', 'keystore',
  'token',
  // Terraform state & lock
  'tfstate',
  // Node/build artifacts
  'tsbuildinfo', 'lcov',
  // Misc binary
  'dat', 'pak', 'bundle', 'nib', 'storyboardc',
  'swp', 'swo',
])

function isAllowedPath(normalizedPath: string): boolean {
  // Explicitly allowed prefixes (~/agents/, ~/.claude/)
  if (ALLOWED_PREFIXES.some(prefix => normalizedPath.startsWith(prefix))) return true
  // Also allow any path that contains /.claude/ (project-local .claude dirs)
  if (normalizedPath.includes('/.claude/') || normalizedPath.endsWith('/.claude')) return true
  return false
}

export async function GET(req: NextRequest) {
  const dirPath = req.nextUrl.searchParams.get('path')
  const mode = req.nextUrl.searchParams.get('mode')

  if (!dirPath) {
    return NextResponse.json({ error: 'Missing path parameter' }, { status: 400 })
  }

  const normalized = normalize(resolve(dirPath))

  if (!isAllowedPath(normalized)) {
    return NextResponse.json(
      { error: 'Path not allowed. Only ~/agents/, ~/.claude/, and project .claude/ folders are browsable.' },
      { status: 403 }
    )
  }

  try {
    const pathStat = await stat(normalized)

    // File read mode
    if (mode === 'file' || pathStat.isFile()) {
      if (!pathStat.isFile()) {
        return NextResponse.json({ error: 'Path is not a file' }, { status: 400 })
      }
      // Refuse binary files
      const ext = normalized.split('.').pop()?.toLowerCase() || ''
      if (BINARY_EXTENSIONS.has(ext)) {
        return NextResponse.json({
          path: normalized,
          content: `(Binary file: .${ext} — preview not supported)`,
          truncated: false,
        })
      }
      if (pathStat.size > MAX_FILE_SIZE) {
        return NextResponse.json({
          path: normalized,
          content: `(File too large for preview: ${(pathStat.size / 1024).toFixed(1)}KB, max ${MAX_FILE_SIZE / 1024}KB)`,
          truncated: true,
        })
      }
      const raw = await readFile(normalized, 'utf-8')
      // Detect binary content by null bytes in first 8KB
      if (raw.slice(0, 8192).includes('\0')) {
        return NextResponse.json({
          path: normalized,
          content: '(Binary file detected — preview not supported)',
          truncated: false,
        })
      }
      const lines = raw.split('\n')
      const truncated = lines.length > MAX_PREVIEW_LINES
      const content = truncated ? lines.slice(0, MAX_PREVIEW_LINES).join('\n') + '\n…' : raw

      return NextResponse.json({ path: normalized, content, truncated })
    }

    // Directory listing mode
    if (!pathStat.isDirectory()) {
      return NextResponse.json({ error: 'Path is not a directory' }, { status: 400 })
    }

    const names = await readdir(normalized)
    const entries: { name: string; type: 'file' | 'dir'; size: number }[] = []

    for (const name of names.sort()) {
      // Skip hidden files except .claude and .claude-plugin
      if (name.startsWith('.') && name !== '.claude' && name !== '.claude-plugin') continue
      try {
        const entryPath = join(normalized, name)
        const entryStat = await stat(entryPath)
        entries.push({
          name,
          type: entryStat.isDirectory() ? 'dir' : 'file',
          size: entryStat.isFile() ? entryStat.size : 0,
        })
      } catch {
        // Skip entries we can't stat (broken symlinks, permission issues)
      }
    }

    return NextResponse.json({ path: normalized, entries })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to read path'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
