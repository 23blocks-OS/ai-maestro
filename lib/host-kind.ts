/**
 * Is this host another machine, or the one serving this dashboard?
 *
 * The `type` field on a host ('local' | 'remote') is deprecated and absent on most
 * hosts (types/host.ts), so nothing may decide on it. A host is this machine when the
 * server marked it `isSelf` or its URL points at localhost; every other host is remote.
 */
import type { Host } from '@/types/host'

type HostLike = Pick<Host, 'isSelf' | 'url'>

function isLocalhostUrl(url: string | undefined): boolean {
  if (!url) return true
  const lowered = url.toLowerCase()
  return lowered.includes('localhost') || lowered.includes('127.0.0.1')
}

export function isRemoteHost(host: HostLike | null | undefined): boolean {
  if (!host) return false
  return !host.isSelf && !isLocalhostUrl(host.url)
}

export function isSelfHost(host: HostLike | null | undefined): boolean {
  if (!host) return false
  return !!host.isSelf || isLocalhostUrl(host.url)
}
