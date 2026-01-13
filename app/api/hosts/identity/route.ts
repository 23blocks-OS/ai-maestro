import { NextResponse } from 'next/server'
import { getSelfHost } from '@/lib/hosts-config'
import { getPublicUrl } from '@/lib/host-sync'
import { HostIdentityResponse } from '@/types/host-sync'
import os from 'os'

// Get package version
const packageJson = require('@/package.json')

/**
 * GET /api/hosts/identity
 *
 * Returns this host's identity information for peer registration.
 * Used by remote hosts to know who we are when registering.
 *
 * Uses centralized getPublicUrl() for consistent URL detection.
 */
export async function GET(request: Request): Promise<NextResponse<HostIdentityResponse>> {
  const selfHost = getSelfHost()

  // Use centralized URL detection
  const publicUrl = getPublicUrl(selfHost)

  // Detect if running on Tailscale (IPs start with 100.)
  let tailscale = false
  try {
    const networkInterfaces = os.networkInterfaces()
    for (const interfaces of Object.values(networkInterfaces)) {
      if (!interfaces) continue
      for (const iface of interfaces) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('100.')) {
          tailscale = true
          break
        }
      }
      if (tailscale) break
    }
  } catch {
    // Ignore network interface errors
  }

  // Check if URL contains Tailscale IP pattern
  if (!tailscale && publicUrl.includes('100.')) {
    tailscale = true
  }

  // Get host identity from headers if provided (for external URL detection)
  let finalUrl = publicUrl
  const forwardedHost = request.headers.get('x-forwarded-host')
  const forwardedProto = request.headers.get('x-forwarded-proto')
  if (forwardedHost) {
    finalUrl = `${forwardedProto || 'http'}://${forwardedHost}`
  }

  return NextResponse.json({
    host: {
      id: selfHost.id,
      name: selfHost.name,
      url: finalUrl,
      description: selfHost.description,
      version: packageJson.version || '0.0.0',
      tailscale,
      isSelf: true,  // Always true - this is the host serving the API
    }
  })
}
