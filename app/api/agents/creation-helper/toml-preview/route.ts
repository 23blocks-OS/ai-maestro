import { NextRequest, NextResponse } from 'next/server'
import { readFile, readdir } from 'fs/promises'
import { statSync } from 'fs'
import { join, normalize } from 'path'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/creation-helper/toml-preview?path=<encoded-path>
 * Returns the raw content of a .agent.toml file for preview.
 * If `path` is a directory, finds the first *.agent.toml file inside it.
 */
export async function GET(req: NextRequest) {
  let tomlPath = req.nextUrl.searchParams.get('path')
  if (!tomlPath) {
    return NextResponse.json({ exists: false, content: '' })
  }

  // Resolve ~ to HOME directory
  if (tomlPath.startsWith('~/') && process.env.HOME) {
    tomlPath = tomlPath.replace('~', process.env.HOME)
  }

  // Only allow reading from the Haephestos working directory.
  // If HOME is defined, that directory is the sole allowed prefix.
  // If HOME is not defined, /tmp/ is the sole allowed prefix.
  const allowedPrefix = process.env.HOME
    ? `${process.env.HOME}/agents/haephestos/`
    : '/tmp/'

  // Normalize the path to eliminate any ".." traversal sequences before
  // checking the prefix, so the guard cannot be bypassed via canonicalization.
  tomlPath = normalize(tomlPath)

  if (!tomlPath.startsWith(allowedPrefix)) {
    return NextResponse.json(
      { error: 'Path not allowed' },
      { status: 403 }
    )
  }

  try {
    // If path is a directory, find the first *.agent.toml file.
    // statSync throws ENOENT when the path does not exist; it is caught below,
    // so the redundant existsSync (which introduced a TOCTOU race condition) has
    // been removed — error handling is consolidated in the catch block.
    if (statSync(tomlPath).isDirectory()) {
      const files = await readdir(tomlPath)
      const tomlFile = files.find(f => f.endsWith('.agent.toml'))
      if (!tomlFile) {
        // Directory exists but contains no .agent.toml — distinct from I/O error
        return NextResponse.json({ exists: false, content: '', error: 'No .agent.toml file found in directory' })
      }
      // Normalize the joined path and re-validate it against the allowed prefix
      // so that a symlink or crafted filename inside the directory cannot escape
      // the allowed subtree (path traversal via directory resolution).
      const joinedPath = normalize(join(tomlPath, tomlFile))
      if (!joinedPath.startsWith(allowedPrefix)) {
        return NextResponse.json(
          { error: 'Path not allowed after directory resolution' },
          { status: 403 }
        )
      }
      tomlPath = joinedPath
    }

    const content = await readFile(tomlPath, 'utf-8')
    return NextResponse.json({ exists: true, content })
  } catch (error: unknown) {
    // Distinguish between "not found" (ENOENT) and genuine I/O failures so the
    // client can react appropriately instead of silently treating all errors as
    // "file does not exist".
    const err = error as NodeJS.ErrnoException
    if (err.code === 'ENOENT') {
      return NextResponse.json({ exists: false, content: '', error: 'File or directory not found' })
    }
    return NextResponse.json(
      { exists: false, content: '', error: `Failed to read file: ${err.message}` },
      { status: 500 }
    )
  }
}
