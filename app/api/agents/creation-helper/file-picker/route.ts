import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

// Uploaded files are saved inside the Haephestos working directory
// and cleaned up when the session is destroyed (the entire folder is wiped).
const UPLOAD_DIR = join(homedir(), 'agents', 'haephestos', 'uploads')

// Max file size: 1MB (these are .md and .toml text files)
const MAX_FILE_SIZE = 1_048_576

// Allowed extensions (sanitized server-side, not trusted from client)
const ALLOWED_EXTENSIONS = new Set(['md', 'txt', 'toml'])

/**
 * POST /api/agents/creation-helper/file-picker
 * Upload a file for the creation helper. Saves to a server-side temp directory
 * and returns the server path (never exposed to the browser).
 *
 * Accepts multipart/form-data with a single "file" field.
 * Returns: { path: string, filename: string }
 */
export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData()
    const file = formData.get('file')

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    // Validate file size
    if (file.size > MAX_FILE_SIZE) {
      // Display in MB for readability (MAX_FILE_SIZE is exactly 1MB = 1024*1024 bytes)
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / (1024 * 1024)}MB)` },
        { status: 400 }
      )
    }

    // Validate extension
    const originalName = file.name || 'unknown'
    const ext = originalName.split('.').pop()?.toLowerCase() || ''
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: `File type .${ext} not allowed. Use: ${[...ALLOWED_EXTENSIONS].join(', ')}` },
        { status: 400 }
      )
    }

    // Read file content as ArrayBuffer and convert to Buffer for binary-safe, encoding-neutral writes
    const arrayBuffer = await file.arrayBuffer()
    const content = Buffer.from(arrayBuffer)

    // Generate a safe filename: <random>-<sanitized-base>.<ext>
    // Extract base name (without extension) and sanitize it independently from the extension,
    // so that truncation to 100 chars never cuts off the extension.
    // Strip all non-alphanumeric chars (including path separators / and \) to prevent path traversal.
    const baseName = ext ? originalName.slice(0, originalName.length - ext.length - 1) : originalName
    const safeBase = baseName.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/[/\\]/g, '_').slice(0, 100)
    const uniquePrefix = randomBytes(4).toString('hex')
    const savedName = `${uniquePrefix}-${safeBase}${ext ? '.' + ext : ''}`

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true })

    const savedPath = join(UPLOAD_DIR, savedName)
    // Write Buffer directly — no encoding argument needed (Buffer is already binary-safe)
    await writeFile(savedPath, content)

    // Return the server path (for internal use) and the display filename
    return NextResponse.json({
      path: savedPath,
      filename: originalName,
    })
  } catch (error) {
    console.error('[creation-helper/file-picker] Upload failed:', error)
    return NextResponse.json(
      { error: 'Failed to upload file' },
      { status: 500 }
    )
  }
}
