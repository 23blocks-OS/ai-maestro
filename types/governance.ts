/**
 * Team Governance types
 *
 * Defines open/closed team types, governance configuration,
 * and role-based access control for team messaging isolation.
 */

/** Team access type: open preserves current behavior, closed adds messaging isolation and ACL */
export type TeamType = 'open' | 'closed'

/** Governance configuration stored at ~/.aimaestro/governance.json */
export interface GovernanceConfig {
  version: 1
  passwordHash: string | null   // bcrypt hash of governance password, null = not set
  passwordSetAt: string | null  // ISO timestamp when password was last set
  managerId: string | null      // Agent UUID of the singleton MANAGER role
}

/** Default governance config for first-time initialization */
export const DEFAULT_GOVERNANCE_CONFIG: GovernanceConfig = {
  version: 1,
  passwordHash: null,
  passwordSetAt: null,
  managerId: null,
}
