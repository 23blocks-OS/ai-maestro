/**
 * Project Registry - file-based CRUD for projects.
 *
 * Storage: ~/.aimaestro/projects/{projectId}/project.json (and tasks.json, which lib/task-registry.ts owns),
 * on the host of the project's owner agent.
 */

import fs from 'fs'
import path from 'path'
import os from 'os'
import { v4 as uuidv4 } from 'uuid'
import { isSafeScopeId } from '@/lib/task-registry'
import type { Project, ProjectStatus } from '@/types/project'

const PROJECTS_DIR = path.join(os.homedir(), '.aimaestro', 'projects')

export const PROJECT_STATUSES: ProjectStatus[] = ['active', 'paused', 'done']

function projectDir(id: string): string {
  if (!isSafeScopeId(id)) throw new Error('Invalid project id')
  return path.join(PROJECTS_DIR, id)
}

function projectFile(id: string): string {
  return path.join(projectDir(id), 'project.json')
}

function readProject(id: string): Project | null {
  try {
    const file = projectFile(id)
    if (!fs.existsSync(file)) return null
    const p = JSON.parse(fs.readFileSync(file, 'utf-8'))
    if (!p || typeof p !== 'object' || typeof p.name !== 'string') return null
    return { ...p, id, ownerAgentId: typeof p.ownerAgentId === 'string' ? p.ownerAgentId : null }
  } catch (error) {
    console.error(`Failed to read project ${id}:`, error)
    return null
  }
}

function writeProject(p: Project): boolean {
  try {
    fs.mkdirSync(projectDir(p.id), { recursive: true })
    fs.writeFileSync(projectFile(p.id), JSON.stringify(p, null, 2), 'utf-8')
    return true
  } catch (error) {
    console.error(`Failed to save project ${p.id}:`, error)
    return false
  }
}

export function loadProjects(): Project[] {
  try {
    if (!fs.existsSync(PROJECTS_DIR)) return []
    const names = fs.readdirSync(PROJECTS_DIR, { withFileTypes: true })
      .filter(d => d.isDirectory() && isSafeScopeId(d.name))
      .map(d => d.name)
    return names.map(readProject).filter((p): p is Project => p !== null)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
  } catch (error) {
    console.error('Failed to list projects:', error)
    return []
  }
}

export function getProject(id: string): Project | null {
  return isSafeScopeId(id) ? readProject(id) : null
}

export function createProject(data: { name: string; description?: string; ownerAgentId?: string | null }): Project {
  const now = new Date().toISOString()
  const p: Project = {
    id: uuidv4(),
    name: data.name,
    ...(data.description ? { description: data.description } : {}),
    ownerAgentId: data.ownerAgentId || null,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  }
  if (!writeProject(p)) throw new Error('Could not save the project')
  return p
}

export function updateProject(id: string, updates: Partial<Pick<Project, 'name' | 'description' | 'ownerAgentId' | 'status'>>): Project | null {
  const existing = getProject(id)
  if (!existing) return null
  const clean = Object.fromEntries(Object.entries(updates).filter(([, v]) => v !== undefined))
  const next: Project = { ...existing, ...clean, id, updatedAt: new Date().toISOString() }
  if (next.description === '') delete next.description
  if (!writeProject(next)) throw new Error('Could not save the project')
  return next
}

/** Remove a project and its cards. Only ever the one folder under the projects directory. */
export function deleteProject(id: string): boolean {
  if (!getProject(id)) return false
  const dir = projectDir(id)
  if (path.dirname(dir) !== PROJECTS_DIR) return false
  fs.rmSync(dir, { recursive: true, force: true })
  return true
}
