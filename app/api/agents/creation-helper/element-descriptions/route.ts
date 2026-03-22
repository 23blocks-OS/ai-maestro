import { NextRequest, NextResponse } from 'next/server'
import { execFile } from 'child_process'
import { promisify } from 'util'
import * as path from 'path'
import * as fs from 'fs'
import * as os from 'os'

const execFileAsync = promisify(execFile)

// Discover the PSS binary from the plugin cache
function findPssBinary(): string | null {
  const cacheDir = path.join(os.homedir(), '.claude', 'plugins', 'cache', 'emasoft-plugins', 'perfect-skill-suggester')
  if (!fs.existsSync(cacheDir)) return null

  // Find the latest version directory
  const versions = fs.readdirSync(cacheDir)
    .filter(d => /^\d+\.\d+\.\d+$/.test(d))
    .sort((a, b) => {
      const pa = a.split('.').map(Number)
      const pb = b.split('.').map(Number)
      for (let i = 0; i < 3; i++) {
        if (pa[i] !== pb[i]) return pb[i] - pa[i]
      }
      return 0
    })

  if (versions.length === 0) return null

  // Map Node.js platform values to binary naming convention; return null for unsupported platforms
  const platform = process.platform === 'darwin' ? 'darwin' : (process.platform === 'linux' ? 'linux' : null)
  if (!platform) return null

  // Node.js reports x86_64 as 'x64'; map to binary naming convention; return null for unsupported archs
  const arch = process.arch === 'arm64' ? 'arm64' : (process.arch === 'x64' ? 'x86_64' : null)
  if (!arch) return null

  for (const ver of versions) {
    // Try platform-specific binary first
    const binPath = path.join(cacheDir, ver, 'src', 'skill-suggester', 'bin', `pss-${platform}-${arch}`)
    if (fs.existsSync(binPath)) return binPath

    // Try generic release binary
    const releasePath = path.join(cacheDir, ver, 'src', 'skill-suggester', 'target', 'release', 'pss')
    if (fs.existsSync(releasePath)) return releasePath
  }

  return null
}

// POST /api/agents/creation-helper/element-descriptions
// Body: { names: string[] }
// Returns: { descriptions: Record<string, { description: string; type: string; plugin: string | null }> }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    // Guard against non-object bodies (null, primitives) before accessing properties
    if (typeof body !== 'object' || body === null || !('names' in body)) {
      return NextResponse.json({ descriptions: {}, error: 'Invalid request body: "names" array is missing' }, { status: 400 })
    }
    const names: string[] = body.names
    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ descriptions: {} })
    }

    const pssBin = findPssBinary()
    if (!pssBin) {
      return NextResponse.json({ descriptions: {}, error: 'PSS binary not found' }, { status: 500 })
    }

    // Batch query — comma-separated names
    const query = names.join(',')
    const { stdout } = await execFileAsync(pssBin, ['get-description', query, '--batch', '--format', 'json'], {
      timeout: 10000,
    })

    // Guard against empty output before attempting JSON parse
    if (!stdout.trim()) {
      console.warn('PSS binary returned empty stdout for query:', query)
      return NextResponse.json({ descriptions: {}, error: 'PSS binary returned no data' }, { status: 500 })
    }

    let results: Array<{ name: string; description: string; type: string; plugin: string | null } | null>
    try {
      results = JSON.parse(stdout)
    } catch (jsonError) {
      console.error('Failed to parse JSON from PSS binary output:', jsonError, 'Stdout:', stdout)
      return NextResponse.json({ descriptions: {}, error: 'Failed to parse PSS binary output' }, { status: 500 })
    }

    // Build lookup map
    const descriptions: Record<string, { description: string; type: string; plugin: string | null }> = {}
    for (const item of results) {
      if (item && item.name && item.description) {
        descriptions[item.name] = {
          description: item.description,
          type: item.type,
          plugin: item.plugin,
        }
      }
    }

    return NextResponse.json({ descriptions })
  } catch (error: unknown) {
    console.error('Error in POST /api/agents/creation-helper/element-descriptions:', error)
    return NextResponse.json(
      { descriptions: {}, error: error instanceof Error ? error.message : 'An unknown error occurred' },
      { status: 500 }
    )
  }
}
