import { NextRequest, NextResponse } from 'next/server'
import { writeFile, mkdir } from 'fs/promises'
import { join } from 'path'
import { homedir } from 'os'
import { randomBytes } from 'crypto'

export const dynamic = 'force-dynamic'

// Uploaded files are saved to a temp directory under ~/.aimaestro/tmp/creation-helper/
// and cleaned up when the session is destroyed.
const UPLOAD_DIR = join(homedir(), '.aimaestro', 'tmp', 'creation-helper')

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
      return NextResponse.json(
        { error: `File too large (max ${MAX_FILE_SIZE / 1024}KB)` },
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

    // Read file content as text
    const content = await file.text()

    // Generate a safe filename: <random>-<sanitized-original>
    const safeBase = originalName.replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 100)
    const uniquePrefix = randomBytes(4).toString('hex')
    const savedName = `${uniquePrefix}-${safeBase}`

    // Ensure upload directory exists
    await mkdir(UPLOAD_DIR, { recursive: true })

    const savedPath = join(UPLOAD_DIR, savedName)
    await writeFile(savedPath, content, 'utf-8')

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
