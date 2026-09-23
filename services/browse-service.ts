/**
 * Folder browsing for the "where should this agent work?" picker.
 *
 *   GET  /api/browse?path=…[&host=…]   list the sub-folders of a folder
 *   POST /api/browse  { parent, name }  create a folder (the picker's "New folder")
 *
 * Only directories, never files. Browsing is limited to the home tree, /tmp,
 * /Users and /home, plus, on Windows (WSL), the Windows drives under /mnt, so
 * someone can see their C:\ folders; the picker then explains why a Linux folder
 * is the better place (lib/working-directory.ts).
 *
 * Served by the Next route and the headless router alike: the picker used to
 * fail on headless hosts because only the Next route existed.
 */

import fs from 'fs'
import os from 'os'
import path from 'path'
import { type ServiceResult, invalidField, serviceError } from '@/services/service-errors'
import { wslInfo, windowsPathFor, windowsToWslPath, isWindowsDriveMount, WINDOWS_FOLDER_WARNING } from '@/lib/working-directory'

export interface BrowseResult {
  path: string
  homeDir: string
  parent: string | null
  entries: Array<{ name: string; path: string }>
  shortcuts: Array<{ name: string; path: string; icon: string }>
  /** Running inside WSL (Windows) */
  isWsl: boolean
  /** On WSL: where Windows Explorer can open this folder */
  windowsPath: string | null
  /** On WSL, for a folder on a Windows drive: why a Linux folder is better */
  warning: string | null
}

function allowedRoots(): string[] {
  const roots = [os.homedir(), '/tmp', '/Users', '/home']
  if (wslInfo().isWsl) roots.push('/mnt')
  return roots
}

/** Under one of the roots: equal to it or inside it (not merely sharing a prefix: /homeX is not /home) */
export function isAllowedPath(resolved: string, roots = allowedRoots()): boolean {
  return roots.some(root => resolved === root || resolved.startsWith(root.endsWith('/') ? root : `${root}/`))
}

export async function browseRemote(hostParam: string, requestedPath: string | null): Promise<ServiceResult<unknown>> {
  try {
    const { findHostByAnyIdentifier } = await import('@/lib/hosts-config')
    const host = findHostByAnyIdentifier(hostParam)
    if (!host) return serviceError('not_found', 'Host not found', 404)
    const proxyUrl = new URL('/api/browse', host.url)
    if (requestedPath) proxyUrl.searchParams.set('path', requestedPath)
    const resp = await fetch(proxyUrl.toString(), { signal: AbortSignal.timeout(5000) })
    return { data: await resp.json(), status: resp.status }
  } catch {
    return serviceError('operation_failed', 'Failed to reach remote host', 502)
  }
}

export function browseDirectory(requestedPath: string | null): ServiceResult<BrowseResult> {
  const homeDir = os.homedir()
  let browsePath = requestedPath || homeDir
  if (browsePath === '~' || browsePath.startsWith('~/')) browsePath = path.join(homeDir, browsePath.slice(1))
  const wsl = wslInfo()
  // A pasted C:\… path, on Windows: browse its WSL form (/mnt/c/…)
  if (wsl.isWsl) browsePath = windowsToWslPath(browsePath) ?? browsePath
  const resolved = path.resolve(browsePath)

  if (!isAllowedPath(resolved)) {
    return serviceError('forbidden', wsl.isWsl
      ? 'Folders here are outside your Linux home. Pick a folder under your home (recommended), or a Windows folder under /mnt/c.'
      : 'Access denied: pick a folder inside your home directory.', 403)
  }

  let stat: fs.Stats
  try {
    stat = fs.statSync(resolved)
  } catch {
    return serviceError('not_found', `The folder ${resolved} does not exist`, 404)
  }
  if (!stat.isDirectory()) return serviceError('invalid_field', 'Not a directory', 400)

  try {
    const directories = fs.readdirSync(resolved, { withFileTypes: true })
      .filter(entry => entry.isDirectory() && !entry.name.startsWith('.') && !['node_modules', '__pycache__'].includes(entry.name))
      .map(entry => ({ name: entry.name, path: path.join(resolved, entry.name) }))
      .sort((a, b) => a.name.localeCompare(b.name))

    const shortcuts: BrowseResult['shortcuts'] = []
    if (resolved === homeDir) {
      const candidates = [
        { name: 'agents', subpath: 'agents', icon: 'code' },
        { name: 'Desktop', subpath: 'Desktop', icon: 'monitor' },
        { name: 'Documents', subpath: 'Documents', icon: 'file-text' },
        { name: 'Projects', subpath: 'Projects', icon: 'code' },
        { name: 'Developer', subpath: 'Developer', icon: 'code' },
        { name: 'repos', subpath: 'repos', icon: 'git-branch' },
        { name: 'src', subpath: 'src', icon: 'code' },
      ]
      for (const sc of candidates) {
        const full = path.join(homeDir, sc.subpath)
        if (fs.existsSync(full)) shortcuts.push({ name: sc.name, path: full, icon: sc.icon })
      }
    }

    const parent = resolved !== '/' ? path.dirname(resolved) : null
    return {
      data: {
        path: resolved,
        homeDir,
        // Going up is offered only where browsing is allowed
        parent: parent && isAllowedPath(parent) ? parent : null,
        entries: directories,
        shortcuts,
        isWsl: wsl.isWsl,
        windowsPath: wsl.isWsl ? windowsPathFor(resolved, wsl.distro) : null,
        warning: wsl.isWsl && isWindowsDriveMount(resolved) ? WINDOWS_FOLDER_WARNING : null,
      },
      status: 200,
    }
  } catch (err) {
    return serviceError('operation_failed', err instanceof Error ? err.message : 'Failed to read directory', 500)
  }
}

/** The picker's "New folder": one level, a plain name, inside an allowed folder. */
export function createFolder(parent: string | undefined, name: string | undefined): ServiceResult<{ path: string }> {
  if (!parent) return invalidField('parent', 'Missing parent folder')
  const clean = (name || '').trim()
  if (!clean || clean === '.' || clean === '..' || /[/\\\0]/.test(clean)) {
    return invalidField('name', 'Use a plain folder name (no slashes)')
  }
  const home = os.homedir()
  const base = path.resolve(parent === '~' || parent.startsWith('~/') ? path.join(home, parent.slice(1)) : parent)
  const target = path.join(base, clean)
  if (!isAllowedPath(target)) return serviceError('forbidden', 'Folders can only be created inside your home directory', 403)
  if (fs.existsSync(target)) return { data: { path: target }, status: 200 }
  try {
    fs.mkdirSync(target)
    return { data: { path: target }, status: 201 }
  } catch (err) {
    return serviceError('operation_failed', `Could not create ${target}: ${(err as Error).message}`, 500)
  }
}
