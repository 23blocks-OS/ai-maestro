/**
 * GAP10 FIX: QualifiedAgent Type
 *
 * Type-safe representation of agent@host format for distributed agent systems.
 * Every agent in a distributed system should be uniquely identified by
 * their qualified name: agentName@hostId
 *
 * This prevents ambiguity when multiple hosts have agents with the same name.
 */

/**
 * A fully qualified agent identifier in the format: agentName@hostId
 * Examples:
 *   - "backend-api@macbook-pro"
 *   - "frontend-dev@mac-mini"
 *   - "23blocks-api-crm@local"
 */
export type QualifiedAgentId = `${string}@${string}`

/**
 * Parsed components of a qualified agent identifier
 */
export interface QualifiedAgentParts {
  /** The agent name/identifier (e.g., "backend-api", "23blocks-api-crm") */
  agentName: string
  /** The host identifier (e.g., "macbook-pro", "local", "mac-mini") */
  hostId: string
}

/**
 * Full qualified agent information with resolved details
 */
export interface QualifiedAgent {
  /** The qualified identifier: agent@host */
  qualifiedId: QualifiedAgentId
  /** The agent name/identifier */
  agentName: string
  /** The host identifier */
  hostId: string
  /** The agent's UUID (if known) */
  agentUuid?: string
  /** The host's display name (if different from hostId) */
  hostName?: string
  /** The host's API URL (if known) */
  hostUrl?: string
}

/**
 * Parse a qualified agent string (agent@host) into its components
 * Returns null if the format is invalid
 *
 * @param qualifiedStr - The qualified agent string (e.g., "backend-api@macbook-pro")
 * @returns Parsed parts or null if invalid
 */
export function parseQualifiedAgent(qualifiedStr: string): QualifiedAgentParts | null {
  if (!qualifiedStr || typeof qualifiedStr !== 'string') {
    return null
  }

  const atIndex = qualifiedStr.lastIndexOf('@')
  if (atIndex === -1 || atIndex === 0 || atIndex === qualifiedStr.length - 1) {
    return null
  }

  const agentName = qualifiedStr.substring(0, atIndex)
  const hostId = qualifiedStr.substring(atIndex + 1)

  if (!agentName.trim() || !hostId.trim()) {
    return null
  }

  return {
    agentName: agentName.trim(),
    hostId: hostId.trim(),
  }
}

/**
 * Create a qualified agent string from components
 *
 * @param agentName - The agent name/identifier
 * @param hostId - The host identifier
 * @returns Qualified agent string in format agent@host
 */
export function createQualifiedAgentId(agentName: string, hostId: string): QualifiedAgentId {
  if (!agentName || !hostId) {
    throw new Error('Both agentName and hostId are required')
  }
  return `${agentName}@${hostId}` as QualifiedAgentId
}

/**
 * Check if a string is a valid qualified agent identifier
 *
 * @param str - The string to check
 * @returns True if the string is a valid qualified agent identifier
 */
export function isQualifiedAgentId(str: string): str is QualifiedAgentId {
  return parseQualifiedAgent(str) !== null
}

/**
 * Extract agent name from a qualified identifier
 * If not qualified, returns the original string
 *
 * @param identifier - Either a qualified (agent@host) or simple identifier
 * @returns The agent name portion
 */
export function extractAgentName(identifier: string): string {
  const parsed = parseQualifiedAgent(identifier)
  return parsed ? parsed.agentName : identifier
}

/**
 * Extract host ID from a qualified identifier
 * If not qualified, returns null
 *
 * @param identifier - Either a qualified (agent@host) or simple identifier
 * @returns The host ID or null if not qualified
 */
export function extractHostId(identifier: string): string | null {
  const parsed = parseQualifiedAgent(identifier)
  return parsed ? parsed.hostId : null
}

/**
 * Compare two qualified agent identifiers for equality (case-insensitive)
 *
 * @param a - First qualified agent identifier
 * @param b - Second qualified agent identifier
 * @returns True if they refer to the same agent on the same host
 */
export function qualifiedAgentsEqual(a: string, b: string): boolean {
  const parsedA = parseQualifiedAgent(a)
  const parsedB = parseQualifiedAgent(b)

  if (!parsedA || !parsedB) {
    return a.toLowerCase() === b.toLowerCase()
  }

  return (
    parsedA.agentName.toLowerCase() === parsedB.agentName.toLowerCase() &&
    parsedA.hostId.toLowerCase() === parsedB.hostId.toLowerCase()
  )
}

/**
 * Check if a qualified identifier refers to a local agent
 *
 * @param identifier - The qualified agent identifier
 * @param localHostIds - Array of identifiers that represent the local host
 *                       (e.g., ['local', 'macbook-pro', 'macbook-pro.local'])
 * @returns True if the agent is on the local host
 */
export function isLocalAgent(identifier: string, localHostIds: string[]): boolean {
  const hostId = extractHostId(identifier)
  if (!hostId) {
    return true // Unqualified identifiers are assumed local
  }
  return localHostIds.some(
    (localId) => localId.toLowerCase() === hostId.toLowerCase()
  )
}

/**
 * Qualify an unqualified agent identifier with a host ID
 * If already qualified, returns as-is
 *
 * @param identifier - The agent identifier (may or may not include @host)
 * @param defaultHostId - The host ID to use if not already qualified
 * @returns Qualified agent identifier
 */
export function ensureQualified(identifier: string, defaultHostId: string): QualifiedAgentId {
  if (isQualifiedAgentId(identifier)) {
    return identifier
  }
  return createQualifiedAgentId(identifier, defaultHostId)
}
