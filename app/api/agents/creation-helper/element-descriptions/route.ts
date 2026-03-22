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

  const platform = process.platform === 'darwin' ? 'darwin' : 'linux'
  const arch = process.arch === 'arm64' ? 'arm64' : 'x86_64'

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
    const names: string[] = body.names
    if (!Array.isArray(names) || names.length === 0) {
      return NextResponse.json({ descriptions: {} })
    }

    const pssBin = findPssBinary()
    if (!pssBin) {
      return NextResponse.json({ descriptions: {}, error: 'PSS binary not found' })
    }

    // Batch query — comma-separated names
    const query = names.join(',')
    const { stdout } = await execFileAsync(pssBin, ['get-description', query, '--batch', '--format', 'json'], {
      timeout: 10000,
    })

    const results: Array<{ name: string; description: string; type: string; plugin: string | null } | null> = JSON.parse(stdout)

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
  } catch {
    return NextResponse.json({ descriptions: {} })
  }
}
