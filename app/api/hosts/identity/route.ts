import { NextResponse } from 'next/server'
import { getLocalHost } from '@/lib/hosts-config'
import { HostIdentityResponse } from '@/types/host-sync'
import os from 'os'

// Get package version
const packageJson = require('@/package.json')

/**
 * GET /api/hosts/identity
 *
 * Returns this host's identity information for peer registration.
 * Used by remote hosts to know who we are when registering.
 */
export async function GET(request: Request): Promise<NextResponse<HostIdentityResponse>> {
  const localHost = getLocalHost()

  // Detect if running on Tailscale (IPs start with 100.)
  const networkInterfaces = os.networkInterfaces()
  let tailscale = false
  let publicUrl = localHost.url

  // Try to detect Tailscale IP and build a reachable URL
  for (const [name, interfaces] of Object.entries(networkInterfaces)) {
    if (!interfaces) continue
    for (const iface of interfaces) {
      if (iface.family === 'IPv4' && !iface.internal) {
        // Tailscale IPs are in the 100.x.x.x range
        if (iface.address.startsWith('100.')) {
          tailscale = true
          // Build URL using Tailscale IP
          publicUrl = `http://${iface.address}:23000`
          break
        }
      }
    }
    if (tailscale) break
  }

  // Get host identity from headers if provided (for external URL detection)
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    publicUrl = `${forwardedProto || 'http'}://${forwardedHost}`
  }

  return NextResponse.json({
    host: {
      id: localHost.id,
      name: localHost.name,
      url: publicUrl,
      description: localHost.description,
      type: 'local',
      version: packageJson.version || '0.0.0',
      tailscale,
    }
  })
}
