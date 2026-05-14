import { NextRequest, NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import os from 'os'

/**
 * GET /api/browse?path=/Users/foo&host=mac-mini
 *
 * Directory listing API for the folder picker.
 * Returns only directories (no files). Security: rejects paths outside home directory tree.
 * For remote hosts, proxies the request via mesh.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)
  const hostParam = searchParams.get('host')
  const requestedPath = searchParams.get('path')

  // Remote host: proxy the request
  if (hostParam) {
    try {
      const { findHostByAnyIdentifier } = await import('@/lib/hosts-config')
      const host = findHostByAnyIdentifier(hostParam)
      if (!host) {
        return NextResponse.json({ error: 'Host not found' }, { status: 404 })
      }
      const proxyUrl = new URL('/api/browse', host.url)
      if (requestedPath) proxyUrl.searchParams.set('path', requestedPath)
      const resp = await fetch(proxyUrl.toString(), { signal: AbortSignal.timeout(5000) })
      const data = await resp.json()
      return NextResponse.json(data, { status: resp.status })
    } catch {
      return NextResponse.json({ error: 'Failed to reach remote host' }, { status: 502 })
    }
  }

  // Local browsing
  const homeDir = os.homedir()
  const browsePath = requestedPath || homeDir

  // Security: resolve the path and ensure it's under home directory or common roots
  const resolved = path.resolve(browsePath)
  const allowedRoots = [homeDir, '/tmp', '/Users', '/home']
  const isAllowed = allowedRoots.some(root => resolved.startsWith(root))
  if (!isAllowed) {
    return NextResponse.json({ error: 'Access denied: path outside allowed directories' }, { status: 403 })
  }

  try {
    const stat = fs.statSync(resolved)
    if (!stat.isDirectory()) {
      return NextResponse.json({ error: 'Not a directory' }, { status: 400 })
    }

    const entries = fs.readdirSync(resolved, { withFileTypes: true })
    const directories = entries
      .filter(entry => {
        // Only directories, skip hidden by default (unless explicitly browsing)
        if (!entry.isDirectory()) return false
        if (entry.name.startsWith('.') && entry.name !== '..') return false
        // Skip system directories
        if (['node_modules', '__pycache__', '.git'].includes(entry.name)) return false
        return true
      })
      .map(entry => ({
        name: entry.name,
        path: path.join(resolved, entry.name),
      }))
      .sort((a, b) => a.name.localeCompare(b.name))

    // Build shortcuts only when browsing home directory
    const shortcuts: Array<{ name: string; path: string; icon: string }> = []
    if (resolved === homeDir) {
      const shortcutCandidates = [
        { name: 'Desktop', subpath: 'Desktop', icon: 'monitor' },
        { name: 'Documents', subpath: 'Documents', icon: 'file-text' },
        { name: 'Projects', subpath: 'Projects', icon: 'code' },
        { name: 'Developer', subpath: 'Developer', icon: 'code' },
        { name: 'repos', subpath: 'repos', icon: 'git-branch' },
        { name: 'src', subpath: 'src', icon: 'code' },
      ]
      for (const sc of shortcutCandidates) {
        const fullPath = path.join(homeDir, sc.subpath)
        if (fs.existsSync(fullPath)) {
          shortcuts.push({ name: sc.name, path: fullPath, icon: sc.icon })
        }
      }
    }

    return NextResponse.json({
      path: resolved,
      homeDir,
      parent: resolved !== '/' ? path.dirname(resolved) : null,
      entries: directories,
      shortcuts,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to read directory'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
