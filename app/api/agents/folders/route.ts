import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join, resolve, sep } from 'path'
import os from 'os'
import { loadAgents } from '@/lib/agent-registry'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/folders?path=<dir>
 *
 * Lists subdirectories of the given path (default: $HOME).
 * Restricted to $HOME and below — cannot browse system directories.
 * Each entry includes a `selectable` flag based on agent working directory overlap rules.
 */
export async function GET(request: NextRequest) {
  const HOME = os.homedir()
  const { searchParams } = new URL(request.url)
  const rawPath = searchParams.get('path') || HOME
  const dirPath = resolve(rawPath.startsWith('~') ? rawPath.replace('~', HOME) : rawPath)

  // Security: must be within $HOME (no browsing /etc, /var, etc.)
  if (!dirPath.startsWith(HOME + sep) && dirPath !== HOME) {
    return NextResponse.json({ error: 'Browsing outside home directory is not allowed' }, { status: 403 })
  }

  try {
    const dirStat = await stat(dirPath)
    if (!dirStat.isDirectory()) {
      return NextResponse.json({ error: 'Not a directory' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Directory not found' }, { status: 404 })
  }

  // Build the set of taken directories (all agent working dirs), resolved to canonical paths
  const agents = loadAgents()
  const takenDirs = agents
    .map(a => resolve(a.workingDirectory || '.').replace(/\/+$/, ''))
    .filter(d => d !== '.')

  // Forbidden system directories (resolved)
  const FORBIDDEN = new Set([
    resolve(process.cwd()),
    resolve(HOME),
    resolve(join(HOME, 'Desktop')),
    resolve(join(HOME, 'Documents')),
    resolve(join(HOME, 'Downloads')),
    resolve(join(HOME, 'Library')),
  ].map(d => d.replace(/\/+$/, '')))

  // Check if a candidate path overlaps with any taken directory
  function isOverlapping(candidateRaw: string): { overlaps: boolean; reason?: string; agentName?: string } {
    const candidate = resolve(candidateRaw).replace(/\/+$/, '')
    const candidateSlash = candidate + sep

    // Forbidden system dirs (exact or child)
    for (const f of FORBIDDEN) {
      if (candidate === f || candidate.startsWith(f + sep) || f.startsWith(candidate + sep)) {
        return { overlaps: true, reason: 'system' }
      }
    }

    for (const taken of takenDirs) {
      const takenSlash = taken + sep
      const findAgent = () => agents.find(a => resolve(a.workingDirectory || '.').replace(/\/+$/, '') === taken)

      if (candidate === taken) {
        return { overlaps: true, reason: 'exact', agentName: findAgent()?.label || findAgent()?.name }
      }
      if (candidateSlash.startsWith(takenSlash)) {
        return { overlaps: true, reason: 'child', agentName: findAgent()?.label || findAgent()?.name }
      }
      if (takenSlash.startsWith(candidateSlash)) {
        return { overlaps: true, reason: 'parent', agentName: findAgent()?.label || findAgent()?.name }
      }
    }

    return { overlaps: false }
  }

  // Read directory contents — only subdirectories, skip hidden
  try {
    const entries = await readdir(dirPath, { withFileTypes: true })
    const dirs = entries
      .filter(e => e.isDirectory() && !e.name.startsWith('.'))
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(e => {
        const fullPath = join(dirPath, e.name)
        const overlap = isOverlapping(fullPath)
        return {
          name: e.name,
          path: fullPath,
          selectable: !overlap.overlaps,
          reason: overlap.reason || null,
          agentName: overlap.agentName || null,
        }
      })

    // Also check if the current directory itself is selectable
    const currentOverlap = isOverlapping(dirPath)

    return NextResponse.json({
      path: dirPath,
      selectable: !currentOverlap.overlaps,
      reason: currentOverlap.reason || null,
      agentName: currentOverlap.agentName || null,
      entries: dirs,
    })
  } catch (err) {
    return NextResponse.json({ error: `Cannot read directory: ${err instanceof Error ? err.message : err}` }, { status: 500 })
  }
}
