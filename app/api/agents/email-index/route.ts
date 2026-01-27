import { NextResponse } from 'next/server'
import { getEmailIndex, findAgentByEmail, getAgent, getAgentEmailAddresses } from '@/lib/agent-registry'
import { getHosts, getSelfHostId, isSelf } from '@/lib/hosts-config'
import { getPublicUrl } from '@/lib/host-sync'
import type { EmailIndexResponse, FederatedEmailIndexResponse } from '@/types/agent'

const FEDERATED_TIMEOUT = 5000 // 5 seconds per host

/**
 * Fetch email index from a remote host
 */
async function fetchRemoteEmailIndex(
  hostUrl: string,
  addressQuery?: string
): Promise<{ success: boolean; data?: EmailIndexResponse; error?: string }> {
  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), FEDERATED_TIMEOUT)

    // Build URL with optional address filter
    let url = `${hostUrl}/api/agents/email-index`
    if (addressQuery) {
      url += `?address=${encodeURIComponent(addressQuery)}`
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'X-Federated-Query': 'true', // Prevent infinite recursion
      },
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}` }
    }

    const data: EmailIndexResponse = await response.json()
    return { success: true, data }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return { success: false, error: message }
  }
}

/**
 * Perform federated email index lookup across all known hosts
 */
async function federatedEmailLookup(
  addressQuery?: string
): Promise<FederatedEmailIndexResponse> {
  const startTime = Date.now()
  const hosts = getHosts()
  const selfHostId = getSelfHostId()
  const selfUrl = getPublicUrl()

  const aggregatedEmails: EmailIndexResponse = {}
  const hostsFailed: string[] = []
  let hostsSucceeded = 0

  // Get local emails first
  let localIndex: EmailIndexResponse
  if (addressQuery) {
    const agentId = findAgentByEmail(addressQuery)
    if (agentId) {
      const agent = getAgent(agentId)
      const addresses = getAgentEmailAddresses(agentId)
      const matchingAddr = addresses.find(
        a => a.address.toLowerCase() === addressQuery.toLowerCase()
      )
      if (agent && matchingAddr) {
        localIndex = {
          [matchingAddr.address.toLowerCase()]: {
            agentId: agent.id,
            agentName: agent.name || agent.alias || 'unknown',
            hostId: agent.hostId || selfHostId,
            hostUrl: selfUrl,
            displayName: matchingAddr.displayName,
            primary: matchingAddr.primary || false,
            metadata: matchingAddr.metadata,
          }
        }
      } else {
        localIndex = {}
      }
    } else {
      localIndex = {}
    }
  } else {
    localIndex = getEmailIndex()
  }

  // Add hostUrl to local entries
  for (const [email, entry] of Object.entries(localIndex)) {
    aggregatedEmails[email] = {
      ...entry,
      hostUrl: selfUrl,
    }
  }
  hostsSucceeded++

  // Query remote hosts in parallel
  const remoteHosts = hosts.filter(h => !isSelf(h.id) && h.enabled)

  const remoteResults = await Promise.all(
    remoteHosts.map(async (host) => {
      const result = await fetchRemoteEmailIndex(host.url, addressQuery)
      return { hostId: host.id, hostUrl: host.url, ...result }
    })
  )

  // Aggregate results
  for (const result of remoteResults) {
    if (result.success && result.data) {
      hostsSucceeded++
      // Add entries with hostUrl
      for (const [email, entry] of Object.entries(result.data)) {
        // Don't overwrite if we already have this email (first host wins)
        if (!aggregatedEmails[email]) {
          aggregatedEmails[email] = {
            ...entry,
            hostUrl: result.hostUrl,
          }
        }
      }
    } else {
      hostsFailed.push(result.hostId)
      console.warn(`[Email Index] Failed to query ${result.hostId}: ${result.error}`)
    }
  }

  return {
    emails: aggregatedEmails,
    meta: {
      federated: true,
      hostsQueried: 1 + remoteHosts.length, // self + remotes
      hostsSucceeded,
      hostsFailed,
      queryTime: Date.now() - startTime,
    }
  }
}

/**
 * GET /api/agents/email-index
 *
 * Returns a mapping of email addresses to agent identity.
 * Used by external gateways to build routing tables.
 *
 * Query parameters:
 *   ?address=email@example.com - Lookup single address
 *   ?agentId=uuid-123 - Get all addresses for an agent
 *   ?federated=true - Query all known hosts (not just local)
 *
 * Response format (standard):
 * {
 *   "email@example.com": {
 *     "agentId": "uuid-...",
 *     "agentName": "my-agent",
 *     "hostId": "mac-mini",
 *     "hostUrl": "http://100.x.x.x:23000",
 *     "displayName": "My Agent",
 *     "primary": true
 *   }
 * }
 *
 * Response format (federated):
 * {
 *   "emails": { ... },
 *   "meta": {
 *     "federated": true,
 *     "hostsQueried": 3,
 *     "hostsSucceeded": 2,
 *     "hostsFailed": ["offline-host"],
 *     "queryTime": 234
 *   }
 * }
 */
export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const addressQuery = searchParams.get('address')
    const agentIdQuery = searchParams.get('agentId')
    const federated = searchParams.get('federated') === 'true'

    // Check if this is a federated sub-query (prevent infinite recursion)
    const isFederatedSubQuery = request.headers.get('X-Federated-Query') === 'true'

    // Federated lookup (query all hosts)
    if (federated && !isFederatedSubQuery) {
      const result = await federatedEmailLookup(addressQuery || undefined)
      return NextResponse.json(result)
    }

    // Single address lookup (local only)
    if (addressQuery) {
      const agentId = findAgentByEmail(addressQuery)
      if (!agentId) {
        return NextResponse.json({}, { status: 200 })
      }

      const agent = getAgent(agentId)
      if (!agent) {
        return NextResponse.json({}, { status: 200 })
      }

      const addresses = getAgentEmailAddresses(agentId)
      const matchingAddr = addresses.find(
        a => a.address.toLowerCase() === addressQuery.toLowerCase()
      )

      if (!matchingAddr) {
        return NextResponse.json({}, { status: 200 })
      }

      const result: EmailIndexResponse = {
        [matchingAddr.address.toLowerCase()]: {
          agentId: agent.id,
          agentName: agent.name || agent.alias || 'unknown',
          hostId: agent.hostId || 'local',
          hostUrl: getPublicUrl(),
          displayName: matchingAddr.displayName,
          primary: matchingAddr.primary || false,
          metadata: matchingAddr.metadata,
        }
      }

      return NextResponse.json(result)
    }

    // Get all addresses for a specific agent
    if (agentIdQuery) {
      const agent = getAgent(agentIdQuery)
      if (!agent) {
        return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
      }

      const addresses = getAgentEmailAddresses(agentIdQuery)
      const result: EmailIndexResponse = {}
      const hostUrl = getPublicUrl()

      for (const addr of addresses) {
        result[addr.address.toLowerCase()] = {
          agentId: agent.id,
          agentName: agent.name || agent.alias || 'unknown',
          hostId: agent.hostId || 'local',
          hostUrl,
          displayName: addr.displayName,
          primary: addr.primary || false,
          metadata: addr.metadata,
        }
      }

      return NextResponse.json(result)
    }

    // Return full index (local only)
    const index = getEmailIndex()
    const hostUrl = getPublicUrl()

    // Add hostUrl to each entry
    const enrichedIndex: EmailIndexResponse = {}
    for (const [email, entry] of Object.entries(index)) {
      enrichedIndex[email] = {
        ...entry,
        hostUrl,
      }
    }

    return NextResponse.json(enrichedIndex)

  } catch (error) {
    console.error('Failed to get email index:', error)
    return NextResponse.json(
      { error: 'Failed to get email index' },
      { status: 500 }
    )
  }
}
