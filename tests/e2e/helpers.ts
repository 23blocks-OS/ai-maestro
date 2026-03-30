/**
 * Shared helpers for AI Maestro E2E tests.
 *
 * All functions operate against the running server at BASE_URL.
 * Helpers use the Playwright Page object for browser interactions
 * and plain fetch for API-level setup/teardown.
 */
import { type Page, expect } from '@playwright/test'

export const BASE_URL = 'http://localhost:23000'
export const GOVERNANCE_PASSWORD = 'mYkri1-xoxrap-gogtan'

// Known test agents — must exist in the running instance
export const AGENT_ALEXANDRE = 'alexandre'
export const AGENT_GENNY = 'genny-bot'

// Test team/group names — cleaned up after each run
export const TEST_TEAM_NAME = 'alpha-squad'
export const TEST_TEAM_DESC = 'Integration testing team'
export const TEST_GROUP_NAME = 'test-broadcast-group'
export const TEST_GROUP_DESC = 'E2E testing group'

// ---------------------------------------------------------------------------
// API helpers (for setup/teardown — not browser-based)
// ---------------------------------------------------------------------------

/** Fetch all teams from the API and return as array. */
export async function apiGetTeams(): Promise<{ id: string; name: string; agentIds: string[]; chiefOfStaffId?: string; orchestratorId?: string }[]> {
  const res = await fetch(`${BASE_URL}/api/teams`)
  const data = await res.json()
  return data.teams || []
}

/** Fetch all groups from the API and return as array. */
export async function apiGetGroups(): Promise<{ id: string; name: string; subscriberIds: string[] }[]> {
  const res = await fetch(`${BASE_URL}/api/groups`)
  const data = await res.json()
  return data.groups || []
}

/** Delete a team by ID via API. */
export async function apiDeleteTeam(teamId: string): Promise<void> {
  // Team deletion requires governance password header
  await fetch(`${BASE_URL}/api/teams/${teamId}`, {
    method: 'DELETE',
    headers: {
      'Content-Type': 'application/json',
      'x-governance-password': GOVERNANCE_PASSWORD,
    },
  })
}

/** Delete a group by ID via API. */
export async function apiDeleteGroup(groupId: string): Promise<void> {
  await fetch(`${BASE_URL}/api/groups/${groupId}`, { method: 'DELETE' })
}

/** Find a team by name and return it, or null. */
export async function apiFindTeam(name: string) {
  const teams = await apiGetTeams()
  return teams.find(t => t.name === name) || null
}

/** Find a group by name and return it, or null. */
export async function apiFindGroup(name: string) {
  const groups = await apiGetGroups()
  return groups.find(g => g.name === name) || null
}

/** Fetch all sessions/agents. */
export async function apiGetSessions(): Promise<{ agentId: string; name: string; label?: string; alias?: string }[]> {
  const res = await fetch(`${BASE_URL}/api/sessions`)
  const data = await res.json()
  return data.sessions || []
}

/** Fetch a single agent by ID. */
export async function apiGetAgent(agentId: string): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${BASE_URL}/api/agents/${agentId}`)
  if (!res.ok) return null
  const data = await res.json()
  return data.agent || null
}

/** Reset an agent's governance title to null (AUTONOMOUS) via PATCH. */
export async function apiResetAgentTitle(agentId: string): Promise<void> {
  await fetch(`${BASE_URL}/api/agents/${agentId}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ governanceTitle: null, role: 'autonomous' }),
  })
}

/** Ensure the governance password is set to the known test value. */
export async function apiEnsureGovernancePassword(): Promise<void> {
  await fetch(`${BASE_URL}/api/governance/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password: GOVERNANCE_PASSWORD }),
  })
}

// ---------------------------------------------------------------------------
// Cleanup helpers — remove test artifacts
// ---------------------------------------------------------------------------

/** Delete all teams named TEST_TEAM_NAME. */
export async function cleanupTestTeams(): Promise<void> {
  const teams = await apiGetTeams()
  for (const t of teams) {
    if (t.name === TEST_TEAM_NAME) {
      await apiDeleteTeam(t.id)
    }
  }
}

/** Delete all groups named TEST_GROUP_NAME. */
export async function cleanupTestGroups(): Promise<void> {
  const groups = await apiGetGroups()
  for (const g of groups) {
    if (g.name === TEST_GROUP_NAME) {
      await apiDeleteGroup(g.id)
    }
  }
}

/** Full cleanup: remove test teams, groups, and reset agent titles. */
export async function fullCleanup(): Promise<void> {
  // Delete test teams first (this may auto-reset agent titles to AUTONOMOUS)
  await cleanupTestTeams()
  await cleanupTestGroups()

  // Also reset agent titles explicitly in case team deletion didn't do it
  const sessions = await apiGetSessions()
  for (const s of sessions) {
    if (s.name === AGENT_ALEXANDRE || s.name === AGENT_GENNY) {
      await apiResetAgentTitle(s.agentId)
    }
  }
}

// ---------------------------------------------------------------------------
// Browser interaction helpers
// ---------------------------------------------------------------------------

/** Navigate to the dashboard and wait for it to load. */
export async function navigateToDashboard(page: Page): Promise<void> {
  await page.goto('/')
  // Wait for the sidebar to appear (the "Agents" tab text in the view switcher)
  await page.waitForSelector('text=Agents', { timeout: 15_000 })
}

/** Click a sidebar tab (Agents, Teams, Groups, Meetings). */
export async function clickSidebarTab(page: Page, tabName: 'Agents' | 'Teams' | 'Groups' | 'Meetings'): Promise<void> {
  // The SidebarViewSwitcher renders buttons with the tab label text
  const tabButton = page.locator('button').filter({ hasText: tabName })
  await tabButton.click()
  // Small wait for the view to switch
  await page.waitForTimeout(500)
}

/** Click the "Create Team" button in the Teams sidebar view. */
export async function clickCreateTeam(page: Page): Promise<void> {
  await page.locator('button:has-text("Create Team")').click()
  // Wait for modal to appear
  await page.waitForSelector('text=Create Team', { timeout: 5_000 })
}

/** Click the "Create Group" button in the Groups sidebar view. */
export async function clickCreateGroup(page: Page): Promise<void> {
  await page.locator('button:has-text("Create Group")').click()
  await page.waitForSelector('text=Create Group', { timeout: 5_000 })
}

/**
 * Fill the team form modal and submit.
 * Assumes the modal is already open.
 */
export async function fillTeamForm(
  page: Page,
  name: string,
  description: string,
  agentNames: string[],
): Promise<void> {
  // Fill name field (first text input in the modal, has placeholder "Backend Squad")
  const nameInput = page.locator('input[placeholder="Backend Squad"]')
  await nameInput.clear()
  await nameInput.fill(name)

  // Fill description field (placeholder "API and infrastructure team")
  const descInput = page.locator('input[placeholder="API and infrastructure team"]')
  await descInput.clear()
  await descInput.fill(description)

  // Select agents by clicking their buttons in the agent list
  for (const agentName of agentNames) {
    // Agent buttons contain a span with the agent label/name
    const agentButton = page.locator('button').filter({ hasText: agentName }).first()
    await agentButton.click()
    await page.waitForTimeout(200)
  }
}

/**
 * Fill the group form modal and submit.
 * Assumes the modal is already open.
 */
export async function fillGroupForm(
  page: Page,
  name: string,
  description: string,
  agentNames: string[],
): Promise<void> {
  // Name input — both team and group forms share similar structure
  const nameInput = page.locator('.fixed input[type="text"]').first()
  await nameInput.clear()
  await nameInput.fill(name)

  // Description input — second text input in the modal
  const descInput = page.locator('.fixed input[type="text"]').nth(1)
  await descInput.clear()
  await descInput.fill(description)

  // Select agents
  for (const agentName of agentNames) {
    const agentButton = page.locator('.fixed button').filter({ hasText: agentName }).first()
    await agentButton.click()
    await page.waitForTimeout(200)
  }
}

/** Submit the team/group create/edit form. */
export async function submitForm(page: Page, buttonText: string = 'Create Team'): Promise<void> {
  await page.locator(`button[type="submit"]:has-text("${buttonText}")`).click()
  // Wait for modal to close
  await page.waitForTimeout(1500)
}

/**
 * Click on an agent in the sidebar agent list to open their profile.
 * The agent name/label is the text shown in the list.
 */
export async function clickAgent(page: Page, agentName: string): Promise<void> {
  // Agent cards in the sidebar contain the agent name as text.
  // We need to click on the card itself. The agent list items are in the sidebar.
  const agentItem = page.locator('[class*="cursor-pointer"]').filter({ hasText: agentName }).first()
  await agentItem.click()
  await page.waitForTimeout(1000)
}

/** Wait for the profile panel to load for a given agent name. */
export async function waitForProfile(page: Page, agentName: string): Promise<void> {
  // The profile header shows "Agent Profile" text
  await page.waitForSelector('text=Agent Profile', { timeout: 10_000 })
  await page.waitForTimeout(500)
}

/**
 * Read the current governance title badge text from the profile panel.
 * Returns the uppercase title text (e.g., "ORCHESTRATOR", "MEMBER", "AUTONOMOUS").
 */
export async function readTitleBadge(page: Page): Promise<string> {
  // The TitleBadge component renders UPPERCASE text like "MANAGER", "MEMBER", etc.
  // It is located near the "Governance Title" label in the identity section.
  // Look for the clickable badge button (the one in the identity section, not the header)
  const titleBadge = page.locator('button:has-text("MANAGER"), button:has-text("CHIEF-OF-STAFF"), button:has-text("ORCHESTRATOR"), button:has-text("ARCHITECT"), button:has-text("INTEGRATOR"), button:has-text("MEMBER"), button:has-text("AUTONOMOUS")').last()
  const text = await titleBadge.textContent()
  return (text || '').trim()
}

/**
 * Open the title assignment dialog by clicking the governance title badge.
 */
export async function openTitleDialog(page: Page): Promise<void> {
  // The clickable TitleBadge is a button near "Governance Title" label
  // It renders text like "MEMBER", "ORCHESTRATOR", etc.
  // We look for the button inside the identity section (after the Governance Title label)
  const governanceRow = page.locator('text=Governance Title').locator('..')
  const titleButton = governanceRow.locator('button').first()
  await titleButton.click()
  // Wait for the dialog to appear
  await page.waitForSelector('text=Assign Governance Title', { timeout: 5_000 })
}

/**
 * Select a title in the TitleAssignmentDialog.
 * The title label is uppercase, e.g., "ORCHESTRATOR".
 */
export async function selectTitle(page: Page, titleLabel: string): Promise<void> {
  // Title options are rendered as buttons with the label text
  const titleOption = page.locator('button').filter({ hasText: titleLabel }).first()
  await titleOption.click()
  await page.waitForTimeout(300)
}

/**
 * Click the "Confirm" button in the TitleAssignmentDialog to proceed to password phase.
 */
export async function clickTitleConfirm(page: Page): Promise<void> {
  // The confirm button is in the dialog footer
  const confirmBtn = page.locator('button:has-text("Confirm")').last()
  await confirmBtn.click()
  // Wait for password dialog to appear
  await page.waitForSelector('#governance-password', { timeout: 5_000 })
}

/**
 * Enter the governance password and submit.
 */
export async function enterGovernancePassword(page: Page, password: string = GOVERNANCE_PASSWORD): Promise<void> {
  const passwordInput = page.locator('#governance-password')
  await passwordInput.fill(password)
  // Click the confirm/submit button in the password dialog footer
  // The button text is "Confirm" in confirm mode
  const submitBtn = page.locator('button:has-text("Confirm")').last()
  await submitBtn.click()
  // Wait for the dialog to close and the change to take effect
  await page.waitForTimeout(3000)
}

/**
 * Full title change flow: open dialog, select title, confirm, enter password.
 */
export async function changeTitle(page: Page, titleLabel: string): Promise<void> {
  await openTitleDialog(page)
  await selectTitle(page, titleLabel)
  await clickTitleConfirm(page)
  await enterGovernancePassword(page)
}

/**
 * Check if a title option is disabled in the TitleAssignmentDialog.
 * Returns the disabled reason text, or null if enabled.
 */
export async function getTitleDisabledReason(page: Page, titleLabel: string): Promise<string | null> {
  // Find the title button
  const titleButton = page.locator('button').filter({ hasText: titleLabel }).first()
  const isDisabled = await titleButton.isDisabled()
  if (!isDisabled) return null

  // The disabled reason text is a <p> element after the button with amber color
  const reasonText = page.locator(`text=${titleLabel}`).locator('..').locator('..').locator('p.text-amber-400\\/80')
  if (await reasonText.count() > 0) {
    return await reasonText.textContent()
  }
  return 'disabled (reason not found)'
}

/** Click on a tab in the profile panel (Overview, Config, Advanced). */
export async function clickProfileTab(page: Page, tabName: 'Overview' | 'Config' | 'Advanced'): Promise<void> {
  const tab = page.locator('button').filter({ hasText: tabName })
  await tab.first().click()
  await page.waitForTimeout(500)
}

/**
 * Edit a team: hover over team card, click edit, modify agents, save.
 */
export async function editTeamAgents(
  page: Page,
  teamName: string,
  agentNamesToToggle: string[],
): Promise<void> {
  // Find the team card and hover to reveal action buttons
  const teamCard = page.locator('[class*="group"]').filter({ hasText: teamName }).first()
  await teamCard.hover()
  await page.waitForTimeout(300)

  // Click the edit (pencil) button — it has title="Edit team"
  const editBtn = teamCard.locator('button[title="Edit team"]')
  await editBtn.click()
  await page.waitForSelector('text=Edit Team', { timeout: 5_000 })

  // Toggle each agent in the modal
  for (const agentName of agentNamesToToggle) {
    const agentButton = page.locator('.fixed button').filter({ hasText: agentName }).first()
    await agentButton.click()
    await page.waitForTimeout(200)
  }

  // Save changes
  await page.locator('button[type="submit"]:has-text("Save Changes")').click()
  await page.waitForTimeout(1500)
}
