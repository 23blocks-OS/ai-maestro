/**
 * Team Registry - File-based CRUD for team persistence
 *
 * Storage: ~/.aimaestro/teams/teams.json
 * Mirrors the pattern from lib/agent-registry.ts
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Team, TeamsFile } from '@/types/team'
import type { TeamType } from '@/types/governance'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const TEAMS_DIR = path.join(AIMAESTRO_DIR, 'teams')
const TEAMS_FILE = path.join(TEAMS_DIR, 'teams.json')

function ensureTeamsDir() {
  if (!fs.existsSync(TEAMS_DIR)) {
    fs.mkdirSync(TEAMS_DIR, { recursive: true })
  }
}

export function loadTeams(): Team[] {
  try {
    ensureTeamsDir()
    if (!fs.existsSync(TEAMS_FILE)) {
      return []
    }
    const data = fs.readFileSync(TEAMS_FILE, 'utf-8')
    const parsed: TeamsFile = JSON.parse(data)
    const teams = Array.isArray(parsed.teams) ? parsed.teams : []

    // Migration: ensure all teams have a type field (default to 'open')
    let needsSave = false
    for (const team of teams) {
      if (!team.type) {
        team.type = 'open'
        needsSave = true
      }
    }
    if (needsSave) {
      saveTeams(teams)
    }

    return teams
  } catch (error) {
    console.error('Failed to load teams:', error)
    return []
  }
}

export function saveTeams(teams: Team[]): boolean {
  try {
    ensureTeamsDir()
    const file: TeamsFile = { version: 1, teams }
    fs.writeFileSync(TEAMS_FILE, JSON.stringify(file, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save teams:', error)
    return false
  }
}

export function getTeam(id: string): Team | null {
  const teams = loadTeams()
  return teams.find(t => t.id === id) || null
}

export function createTeam(data: { name: string; description?: string; agentIds: string[]; type?: TeamType; chiefOfStaffId?: string }): Team {
  const teams = loadTeams()
  const now = new Date().toISOString()

  const team: Team = {
    id: uuidv4(),
    name: data.name,
    description: data.description,
    agentIds: data.agentIds,
    type: data.type || 'open',
    chiefOfStaffId: data.chiefOfStaffId,
    createdAt: now,
    updatedAt: now,
  }

  teams.push(team)
  saveTeams(teams)
  return team
}

export function updateTeam(id: string, updates: Partial<Pick<Team, 'name' | 'description' | 'agentIds' | 'lastMeetingAt' | 'instructions' | 'lastActivityAt' | 'type' | 'chiefOfStaffId'>>): Team | null {
  const teams = loadTeams()
  const index = teams.findIndex(t => t.id === id)
  if (index === -1) return null

  teams[index] = {
    ...teams[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }

  saveTeams(teams)
  return teams[index]
}

export function deleteTeam(id: string): boolean {
  const teams = loadTeams()
  const filtered = teams.filter(t => t.id !== id)
  if (filtered.length === teams.length) return false
  saveTeams(filtered)
  return true
}
