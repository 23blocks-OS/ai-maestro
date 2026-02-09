/**
 * Document Registry - File-based CRUD for team document persistence
 *
 * Storage: ~/.aimaestro/teams/docs-{teamId}.json (one per team)
 * Mirrors the pattern from lib/task-registry.ts
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import type { TeamDocument, TeamDocumentsFile } from '@/types/document'

const TEAMS_DIR = path.join(os.homedir(), '.aimaestro', 'teams')

function ensureTeamsDir() {
  if (!fs.existsSync(TEAMS_DIR)) {
    fs.mkdirSync(TEAMS_DIR, { recursive: true })
  }
}

function docsFilePath(teamId: string): string {
  return path.join(TEAMS_DIR, `docs-${teamId}.json`)
}

export function loadDocuments(teamId: string): TeamDocument[] {
  try {
    ensureTeamsDir()
    const filePath = docsFilePath(teamId)
    if (!fs.existsSync(filePath)) {
      return []
    }
    const data = fs.readFileSync(filePath, 'utf-8')
    const parsed: TeamDocumentsFile = JSON.parse(data)
    return Array.isArray(parsed.documents) ? parsed.documents : []
  } catch (error) {
    console.error(`Failed to load documents for team ${teamId}:`, error)
    return []
  }
}

export function saveDocuments(teamId: string, documents: TeamDocument[]): boolean {
  try {
    ensureTeamsDir()
    const file: TeamDocumentsFile = { version: 1, documents }
    fs.writeFileSync(docsFilePath(teamId), JSON.stringify(file, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to save documents for team ${teamId}:`, error)
    return false
  }
}

export function getDocument(teamId: string, docId: string): TeamDocument | null {
  const documents = loadDocuments(teamId)
  return documents.find(d => d.id === docId) || null
}

export function createDocument(data: {
  teamId: string
  title: string
  content: string
  pinned?: boolean
  tags?: string[]
}): TeamDocument {
  const documents = loadDocuments(data.teamId)
  const now = new Date().toISOString()

  const doc: TeamDocument = {
    id: uuidv4(),
    teamId: data.teamId,
    title: data.title,
    content: data.content,
    pinned: data.pinned || false,
    tags: data.tags || [],
    createdAt: now,
    updatedAt: now,
  }

  documents.push(doc)
  saveDocuments(data.teamId, documents)
  return doc
}

export function updateDocument(
  teamId: string,
  docId: string,
  updates: Partial<Pick<TeamDocument, 'title' | 'content' | 'pinned' | 'tags'>>
): TeamDocument | null {
  const documents = loadDocuments(teamId)
  const index = documents.findIndex(d => d.id === docId)
  if (index === -1) return null

  documents[index] = {
    ...documents[index],
    ...updates,
    updatedAt: new Date().toISOString(),
  }

  saveDocuments(teamId, documents)
  return documents[index]
}

export function deleteDocument(teamId: string, docId: string): boolean {
  const documents = loadDocuments(teamId)
  const filtered = documents.filter(d => d.id !== docId)
  if (filtered.length === documents.length) return false
  saveDocuments(teamId, filtered)
  return true
}
