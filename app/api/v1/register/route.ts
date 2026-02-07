/**
 * AMP v1 Registration Endpoint
 *
 * POST /api/v1/register
 *
 * Registers a new agent with the local AMP provider.
 * This is the first step in establishing AMP identity for an agent.
 *
 * The agent provides:
 * - tenant: Organization identifier
 * - name: Desired agent name (must be unique within tenant)
 * - public_key: PEM-encoded Ed25519 public key
 * - key_algorithm: "Ed25519" (required)
 *
 * The provider returns:
 * - address: Full AMP address (name@tenant.aimaestro.local)
 * - api_key: Bearer token for authenticated requests (SHOWN ONLY ONCE)
 * - agent_id: Internal agent UUID
 */

import { NextRequest, NextResponse } from 'next/server'
import { createAgent, getAgentByName, markAgentAsAMPRegistered } from '@/lib/agent-registry'
import { createApiKey, hashApiKey } from '@/lib/amp-auth'
import { saveKeyPair, calculateFingerprint } from '@/lib/amp-keys'
import { getSelfHostId, getSelfHost, getOrganization } from '@/lib/hosts-config-server.mjs'
import { getAMPProviderDomain } from '@/lib/types/amp'
import type {
  AMPRegistrationRequest,
  AMPRegistrationResponse,
  AMPError,
  AMPNameTakenError
} from '@/lib/types/amp'

/**
 * Extract raw public key bytes from PEM format
 * Returns hex string of the 32-byte Ed25519 public key
 */
function extractPublicKeyHex(pemKey: string): string | null {
  try {
    const { createPublicKey } = require('crypto')
    const pubKeyObj = createPublicKey(pemKey)

    // Verify it's Ed25519
    if (pubKeyObj.asymmetricKeyType !== 'ed25519') {
      return null
    }

    const rawPubKey = pubKeyObj.export({ type: 'spki', format: 'der' })
    // Ed25519 SPKI format: 12-byte header + 32-byte key
    const publicKeyBytes = rawPubKey.subarray(12)
    return publicKeyBytes.toString('hex')
  } catch {
    return null
  }
}

/**
 * Validate agent name format
 * Must be 1-63 chars, alphanumeric + hyphens, cannot start/end with hyphen
 */
function isValidAgentName(name: string): boolean {
  const nameRegex = /^[a-z0-9][a-z0-9-]{0,61}[a-z0-9]$|^[a-z0-9]$/
  return nameRegex.test(name.toLowerCase())
}

/**
 * Generate alternative name suggestions when a name is taken
 */
function generateNameSuggestions(baseName: string): string[] {
  const adjectives = ['cosmic', 'stellar', 'quantum', 'cyber', 'nexus', 'prime', 'alpha', 'beta']
  const nouns = ['wolf', 'hawk', 'phoenix', 'dragon', 'titan', 'spark', 'nova', 'pulse']

  const suggestions: string[] = []

  // Add numbered suffix
  suggestions.push(`${baseName}-2`)
  suggestions.push(`${baseName}-3`)

  // Add random adjective-noun combinations
  const randAdj = adjectives[Math.floor(Math.random() * adjectives.length)]
  const randNoun = nouns[Math.floor(Math.random() * nouns.length)]
  suggestions.push(`${baseName}-${randAdj}-${randNoun}`)

  return suggestions.slice(0, 3)
}

export async function POST(request: NextRequest): Promise<NextResponse<AMPRegistrationResponse | AMPError | AMPNameTakenError>> {
  try {
    const body = await request.json() as AMPRegistrationRequest

    // Validate required fields
    if (!body.tenant || typeof body.tenant !== 'string') {
      return NextResponse.json({
        error: 'missing_field',
        message: 'tenant is required',
        field: 'tenant'
      } as AMPError, { status: 400 })
    }

    if (!body.name || typeof body.name !== 'string') {
      return NextResponse.json({
        error: 'missing_field',
        message: 'name is required',
        field: 'name'
      } as AMPError, { status: 400 })
    }

    if (!body.public_key || typeof body.public_key !== 'string') {
      return NextResponse.json({
        error: 'missing_field',
        message: 'public_key is required',
        field: 'public_key'
      } as AMPError, { status: 400 })
    }

    if (!body.key_algorithm || body.key_algorithm !== 'Ed25519') {
      return NextResponse.json({
        error: 'invalid_field',
        message: 'key_algorithm must be "Ed25519"',
        field: 'key_algorithm'
      } as AMPError, { status: 400 })
    }

    // Normalize name to lowercase
    const normalizedName = body.name.toLowerCase()

    // Validate name format
    if (!isValidAgentName(normalizedName)) {
      return NextResponse.json({
        error: 'invalid_field',
        message: 'name must be 1-63 characters, alphanumeric and hyphens only, cannot start or end with hyphen',
        field: 'name'
      } as AMPError, { status: 400 })
    }

    // Validate public key format
    const publicKeyHex = extractPublicKeyHex(body.public_key)
    if (!publicKeyHex) {
      return NextResponse.json({
        error: 'invalid_field',
        message: 'Invalid public key format. Must be PEM-encoded Ed25519 public key.',
        field: 'public_key'
      } as AMPError, { status: 400 })
    }

    // Calculate fingerprint
    const fingerprint = calculateFingerprint(publicKeyHex)

    // Get host info
    const selfHost = getSelfHost()
    const selfHostId = selfHost?.id || getSelfHostId()

    // Get organization from hosts config
    const configOrg = getOrganization()

    // PHASE 2: Require organization to be set before AMP registration
    // This ensures agents get proper AMP addresses (name@org.aimaestro.local)
    if (!configOrg) {
      return NextResponse.json({
        error: 'organization_not_set',
        message: 'Organization must be configured before registering agents. Please complete the AI Maestro setup first.',
        field: 'organization',
        setup_url: '/setup' // Frontend can redirect here
      } as AMPError, { status: 400 })
    }

    // Use the configured organization (ignore client-provided tenant if it differs)
    const tenant = configOrg
    if (body.tenant && body.tenant !== configOrg) {
      return NextResponse.json({
        error: 'invalid_field',
        message: `This AI Maestro instance is configured for organization '${configOrg}'. Cannot register under '${body.tenant}'.`,
        field: 'tenant',
        details: { expected_tenant: configOrg }
      } as AMPError, { status: 400 })
    }

    // Check if name already exists in this tenant (on this host)
    const existingAgent = getAgentByName(normalizedName, selfHostId)
    let agent: ReturnType<typeof createAgent>

    if (existingAgent) {
      // Agent exists - check if already AMP-registered
      const hasAMP = existingAgent.metadata?.amp?.registeredVia
      if (hasAMP) {
        // Verify if the same key is being re-registered (lost registration file scenario)
        // If the fingerprint matches, re-issue the API key instead of rejecting
        const existingFingerprint = existingAgent.metadata?.amp?.fingerprint
        if (existingFingerprint && existingFingerprint === fingerprint) {
          // Same key = same agent re-registering. Re-issue API key.
          agent = existingAgent
          console.log(`[AMP Register] Re-registering agent '${normalizedName}' (same key fingerprint, re-issuing API key)`)
        } else {
          return NextResponse.json({
            error: 'name_taken',
            message: `Agent name '${normalizedName}' is already registered`,
            suggestions: generateNameSuggestions(normalizedName)
          } as AMPNameTakenError, { status: 409 })
        }
      } else {
        // Agent exists (e.g. from tmux discovery) but not AMP-registered
        // Adopt it: add AMP metadata and issue an API key
        agent = existingAgent
        console.log(`[AMP Register] Adopting existing agent '${normalizedName}' (${agent.id.substring(0, 8)}...)`)
      }
    } else {
      // Create new agent in the registry
      try {
        agent = createAgent({
          name: normalizedName,
          label: body.alias,
          program: 'Claude Code',
          model: 'Claude',
          taskDescription: body.metadata?.description as string || `AMP-registered agent: ${normalizedName}`,
          workingDirectory: body.metadata?.working_directory as string || undefined,
          createSession: false, // AMP agents don't auto-create tmux sessions
          metadata: {
            amp: {
              tenant,
              scope: body.scope,
              delivery: body.delivery,
              fingerprint,
              registeredVia: 'amp-v1-api',
              registeredAt: new Date().toISOString()
            },
            ...body.metadata
          }
        })
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : 'Failed to create agent'
        return NextResponse.json({
          error: 'internal_error',
          message: errorMessage
        } as AMPError, { status: 500 })
      }
    }

    // Store the public key for this agent
    // We create a pseudo keypair with just the public key (agent owns the private key)
    try {
      saveKeyPair(agent.id, {
        privatePem: '', // Agent owns this, we don't have it
        publicPem: body.public_key,
        publicHex: publicKeyHex,
        fingerprint
      })
    } catch (err) {
      console.error('[AMP Register] Failed to save public key:', err)
      // Don't fail registration, just log
    }

    // Get provider domain based on organization
    const providerDomain = getAMPProviderDomain(tenant)

    // Generate API key for this agent
    const apiKey = createApiKey(agent.id, tenant, `${normalizedName}@${providerDomain}`)

    // PHASE 2: Mark agent as AMP-registered with full metadata
    // This distinguishes properly registered agents from legacy ones
    const registeredAt = new Date().toISOString()
    const fullAddress = body.scope?.repo && body.scope?.platform
      ? `${normalizedName}@${body.scope.repo}.${body.scope.platform}.${providerDomain}`
      : `${normalizedName}@${providerDomain}`

    markAgentAsAMPRegistered(agent.id, {
      address: fullAddress,
      tenant,
      fingerprint,
      registeredAt,
      apiKeyHash: hashApiKey(apiKey)
    })

    // Build response
    const hostEndpoint = selfHost?.url || `http://localhost:23000`

    const response: AMPRegistrationResponse = {
      address: fullAddress,
      short_address: `${normalizedName}@${providerDomain}`,
      local_name: normalizedName,
      agent_id: agent.id,
      tenant_id: tenant,
      tenant,  // S12 fix: CLI scripts expect 'tenant' field
      api_key: apiKey,
      provider: {
        name: providerDomain,
        endpoint: `${hostEndpoint}/api/v1`,
        route_url: `${hostEndpoint}/api/v1/route`
      },
      fingerprint,
      registered_at: registeredAt
    }

    console.log(`[AMP Register] Registered agent: ${fullAddress} (${agent.id.substring(0, 8)}...)`)

    return NextResponse.json(response, { status: 201 })

  } catch (error) {
    console.error('[AMP Register] Error:', error)

    return NextResponse.json({
      error: 'internal_error',
      message: error instanceof Error ? error.message : 'Internal server error'
    } as AMPError, { status: 500 })
  }
}
