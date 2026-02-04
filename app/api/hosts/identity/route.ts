import { NextResponse } from 'next/server'
import { getSelfHost, getOrganizationInfo } from '@/lib/hosts-config'
import { HostIdentityResponse } from '@/types/host-sync'

// Get package version
const packageJson = require('@/package.json')

/**
 * GET /api/hosts/identity
 *
 * Returns this host's identity information for peer registration.
 * Used by remote hosts to know who we are when registering.
 *
 * Uses centralized getPublicUrl() for consistent URL detection.
 * Includes organization info for mesh synchronization.
 */
export async function GET(): Promise<NextResponse<HostIdentityResponse>> {
  const selfHost = getSelfHost()
  const orgInfo = getOrganizationInfo()

  // ALWAYS use the configured URL from hosts.json
  // NEVER use localhost - it's useless in a mesh network
  // The URL in hosts.json should already be a reachable IP (set by getDefaultSelfHost)
  const url = selfHost.url

  // Detect if running on Tailscale (IPs start with 100.)
  const tailscale = selfHost.tailscale || url.includes('100.')

  return NextResponse.json({
    host: {
      id: selfHost.id,
      name: selfHost.name,
      url,
      description: selfHost.description,
      version: packageJson.version || '0.0.0',
      tailscale,
      isSelf: true,  // Always true - this is the host serving the API
    },
    // Include organization info for mesh sync
    organization: orgInfo.organization || undefined,
    organizationSetAt: orgInfo.setAt || undefined,
    organizationSetBy: orgInfo.setBy || undefined,
  })
}
