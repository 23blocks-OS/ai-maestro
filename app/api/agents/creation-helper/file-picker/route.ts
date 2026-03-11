import { NextRequest, NextResponse } from 'next/server'
import { execSync } from 'child_process'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/creation-helper/file-picker
 * Opens a native macOS file picker dialog via osascript and returns the selected path.
 * Body: { fileTypes?: string[] } — optional file type filter (e.g. ["md", "toml"])
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))
    const fileTypes = Array.isArray(body.fileTypes) ? body.fileTypes : ['md', 'toml', 'txt']

    // Build the AppleScript file type filter
    const typeFilter = fileTypes.map((t: string) => `"${t}"`).join(', ')
    const script = `choose file with prompt "Select a file" of type {${typeFilter}}`

    const result = execSync(
      `osascript -e '${script}'`,
      { encoding: 'utf-8', timeout: 60000 }
    ).trim()

    // osascript returns POSIX-like path but with "alias" format — convert
    // e.g. "alias Macintosh HD:Users:joe:file.md" → "/Users/joe/file.md"
    let filePath = result
    if (filePath.startsWith('alias ')) {
      // Convert HFS path to POSIX
      const posixResult = execSync(
        `osascript -e 'POSIX path of (${JSON.stringify(result)} as alias)'`,
        { encoding: 'utf-8', timeout: 5000 }
      ).trim()
      filePath = posixResult
    }

    return NextResponse.json({ path: filePath })
  } catch (error) {
    // User cancelled the dialog — osascript exits with code 1
    const msg = error instanceof Error ? error.message : String(error)
    if (msg.includes('User canceled') || msg.includes('(-128)')) {
      return NextResponse.json({ path: null, cancelled: true })
    }
    return NextResponse.json(
      { error: 'Failed to open file picker' },
      { status: 500 }
    )
  }
}
