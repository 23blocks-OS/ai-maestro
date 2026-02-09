/**
 * Meeting Registry - File-based CRUD for meeting persistence
 *
 * Storage: ~/.aimaestro/teams/meetings.json
 * Mirrors the pattern from lib/team-registry.ts
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { Meeting, MeetingsFile, SidebarMode } from '@/types/team'

const AIMAESTRO_DIR = path.join(os.homedir(), '.aimaestro')
const TEAMS_DIR = path.join(AIMAESTRO_DIR, 'teams')
const MEETINGS_FILE = path.join(TEAMS_DIR, 'meetings.json')

const PRUNE_DAYS = 7

function ensureTeamsDir() {
  if (!fs.existsSync(TEAMS_DIR)) {
    fs.mkdirSync(TEAMS_DIR, { recursive: true })
  }
}

function pruneOldEnded(meetings: Meeting[]): Meeting[] {
  const cutoff = Date.now() - PRUNE_DAYS * 24 * 60 * 60 * 1000
  return meetings.filter(m => {
    if (m.status !== 'ended' || !m.endedAt) return true
    return new Date(m.endedAt).getTime() > cutoff
  })
}

export function loadMeetings(): Meeting[] {
  try {
    ensureTeamsDir()
    if (!fs.existsSync(MEETINGS_FILE)) {
      return []
    }
    const data = fs.readFileSync(MEETINGS_FILE, 'utf-8')
    const parsed: MeetingsFile = JSON.parse(data)
    const meetings = Array.isArray(parsed.meetings) ? parsed.meetings : []
    // Auto-prune old ended meetings
    const pruned = pruneOldEnded(meetings)
    if (pruned.length !== meetings.length) {
      saveMeetings(pruned)
    }
    return pruned
  } catch (error) {
    console.error('Failed to load meetings:', error)
    return []
  }
}

export function saveMeetings(meetings: Meeting[]): boolean {
  try {
    ensureTeamsDir()
    const file: MeetingsFile = { version: 1, meetings }
    fs.writeFileSync(MEETINGS_FILE, JSON.stringify(file, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error('Failed to save meetings:', error)
    return false
  }
}

export function getMeeting(id: string): Meeting | null {
  const meetings = loadMeetings()
  return meetings.find(m => m.id === id) || null
}

export function createMeeting(data: {
  name: string
  agentIds: string[]
  teamId: string | null
  sidebarMode?: SidebarMode
}): Meeting {
  const meetings = loadMeetings()
  const now = new Date().toISOString()

  const meeting: Meeting = {
    id: uuidv4(),
    teamId: data.teamId,
    name: data.name,
    agentIds: data.agentIds,
    status: 'active',
    activeAgentId: data.agentIds[0] || null,
    sidebarMode: data.sidebarMode || 'grid',
    startedAt: now,
    lastActiveAt: now,
  }

  meetings.push(meeting)
  saveMeetings(meetings)
  return meeting
}

export function updateMeeting(
  id: string,
  updates: Partial<Pick<Meeting, 'name' | 'agentIds' | 'status' | 'activeAgentId' | 'sidebarMode' | 'lastActiveAt' | 'endedAt' | 'teamId'>>
): Meeting | null {
  const meetings = loadMeetings()
  const index = meetings.findIndex(m => m.id === id)
  if (index === -1) return null

  meetings[index] = {
    ...meetings[index],
    ...updates,
  }

  saveMeetings(meetings)
  return meetings[index]
}

export function deleteMeeting(id: string): boolean {
  const meetings = loadMeetings()
  const filtered = meetings.filter(m => m.id !== id)
  if (filtered.length === meetings.length) return false
  saveMeetings(filtered)
  return true
}
