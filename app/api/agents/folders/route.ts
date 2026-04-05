import { NextRequest, NextResponse } from 'next/server'
import { readdir, stat } from 'fs/promises'
import { join } from 'path'
import os from 'os'
import { loadAgents } from '@/lib/agent-registry'

export const dynamic = 'force-dynamic'

/**
 * GET /api/agents/folders?path=<dir>
 *
 * Lists subdirectories of the given path (default: $HOME).
 * Each entry includes a `selectable` flag based on agent working directory overlap rules:
 * - A folder already used by an agent → unselectable (exact match)
 * - A parent of any agent's folder → unselectable (child exists below)
 * - A child of any agent's folder → unselectable (parent already claimed)
 * - Forbidden system dirs (process.cwd(), $HOME root, /, /tmp, etc.) → unselectable
 *
 * Users can navigate INTO unselectable folders but cannot SELECT them.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const rawPath = searchParams.get('path') || os.homedir()
  const dirPath = rawPath.startsWith('~') ? rawPath.replace('~', os.homedir()) : rawPath

  // Security: reject path traversal
  if (dirPath.includes('..')) {
    return NextResponse.json({ error: 'Path traversal not allowed' }, { status: 400 })
  }

  try {
    const dirStat = await stat(dirPath)
    if (!dirStat.isDirectory()) {
      return NextResponse.json({ error: 'Not a directory' }, { status: 400 })
    }
  } catch {
    return NextResponse.json({ error: 'Directory not found' }, { status: 404 })
  }

  // Build the set of taken directories (all agent working dirs)
  const agents = loadAgents()
  const takenDirs = agents
    .map(a => (a.workingDirectory || '').replace(/\/+$/, ''))
    .filter(Boolean)

  // Forbidden system directories
  const HOME = os.homedir()
  const FORBIDDEN = new Set([
    process.cwd(),
    HOME,
    join(HOME, 'Desktop'),
    join(HOME, 'Documents'),
    join(HOME, 'Downloads'),
    join(HOME, 'Library'),
    '/',
    '/tmp',
    '/var',
    '/usr',
    '/etc',
    '/System',
    '/Applications',
  ].map(d => d.replace(/\/+$/, '')))

  // Check if a candidate path overlaps with any taken directory
  function isOverlapping(candidateRaw: string): { overlaps: boolean; reason?: string; agentName?: string } {
    const candidate = candidateRaw.replace(/\/+$/, '')
    const candidateSlash = candidate + '/'

    // Forbidden system dirs
    if (FORBIDDEN.has(candidate)) {
      return { overlaps: true, reason: 'system' }
    }

    for (const taken of takenDirs) {
      const takenSlash = taken + '/'

      // Exact match
      if (candidate === taken) {
        const agent = agents.find(a => (a.workingDirectory || '').replace(/\/+$/, '') === taken)
        return { overlaps: true, reason: 'exact', agentName: agent?.label || agent?.name }
      }

      // Candidate is child of taken (taken=/foo, candidate=/foo/bar)
      if (candidateSlash.startsWith(takenSlash)) {
        const agent = agents.find(a => (a.workingDirectory || '').replace(/\/+$/, '') === taken)
        return { overlaps: true, reason: 'child', agentName: agent?.label || agent?.name }
      }

      // Candidate is parent of taken (candidate=/foo, taken=/foo/bar)
      if (takenSlash.startsWith(candidateSlash)) {
        const agent = agents.find(a => (a.workingDirectory || '').replace(/\/+$/, '') === taken)
        return { overlaps: true, reason: 'parent', agentName: agent?.label || agent?.name }
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
