/**
 * Agents Repos Service
 *
 * Business logic for managing agent git repositories.
 * Routes are thin wrappers that call these functions.
 */

import { getAgent, getAgentByAlias, loadAgents, saveAgents } from '@/lib/agent-registry'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { Agent, Repository } from '@/types/agent'

// ── Types ───────────────────────────────────────────────────────────────────

export interface ServiceResult<T> {
  data?: T
  error?: string
  status: number
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function resolveAgent(idOrName: string): Agent | null {
  return getAgent(idOrName) || getAgentByAlias(idOrName) || null
}

function getGitRepoInfo(dirPath: string): Repository | null {
  try {
    const gitDir = path.join(dirPath, '.git')
    if (!fs.existsSync(gitDir)) return null

    let remoteUrl = ''
    try {
      remoteUrl = execSync('git config --get remote.origin.url', {
        cwd: dirPath, encoding: 'utf-8', timeout: 5000
      }).trim()
    } catch { /* No remote configured */ }

    if (!remoteUrl) return null

    let currentBranch = ''
    try {
      currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: dirPath, encoding: 'utf-8', timeout: 5000
      }).trim()
    } catch { currentBranch = 'unknown' }

    let defaultBranch = currentBranch
    try {
      const remoteBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""', {
        cwd: dirPath, encoding: 'utf-8', timeout: 5000, shell: '/bin/bash'
      }).trim()
      if (remoteBranch) {
        defaultBranch = remoteBranch.replace('refs/remotes/origin/', '')
      }
    } catch { /* Use current branch */ }

    let lastCommit = ''
    try {
      lastCommit = execSync('git rev-parse HEAD', {
        cwd: dirPath, encoding: 'utf-8', timeout: 5000
      }).trim().substring(0, 8)
    } catch { /* No commits */ }

    const name = path.basename(dirPath) || path.basename(remoteUrl.replace(/\.git$/, ''))

    return {
      name,
      remoteUrl,
      localPath: dirPath,
      defaultBranch,
      currentBranch,
      lastCommit,
      lastSynced: new Date().toISOString(),
      isPrimary: true
    }
  } catch (error) {
    console.error(`Error getting git info for ${dirPath}:`, error)
    return null
  }
}

function getAgentWorkingDir(agent: Agent): string | undefined {
  return agent.workingDirectory || agent.sessions?.[0]?.workingDirectory || agent.preferences?.defaultWorkingDirectory
}

// ── Public Functions ────────────────────────────────────────────────────────

/**
 * Get repositories associated with an agent.
 */
export function listRepos(agentIdOrName: string): ServiceResult<Record<string, unknown>> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  const configuredRepos = agent.tools.repositories || []
  const workingDir = getAgentWorkingDir(agent)
  let detectedRepo: Repository | null = null

  if (workingDir && fs.existsSync(workingDir)) {
    detectedRepo = getGitRepoInfo(workingDir)
  }

  const repos: Repository[] = [...configuredRepos]

  if (detectedRepo) {
    const existingIndex = repos.findIndex(r => r.remoteUrl === detectedRepo!.remoteUrl)
    if (existingIndex >= 0) {
      repos[existingIndex] = { ...repos[existingIndex], ...detectedRepo }
    } else {
      repos.unshift(detectedRepo)
    }
  }

  return {
    data: {
      repositories: repos,
      workingDirectory: workingDir,
      detectedFromWorkingDir: !!detectedRepo
    },
    status: 200
  }
}

/**
 * Add or update repositories for an agent.
 */
export function updateRepos(
  agentIdOrName: string,
  body: { repositories?: Repository[]; detectFromWorkingDir?: boolean }
): ServiceResult<Record<string, unknown>> {
  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  if (body.detectFromWorkingDir) {
    const workingDir = getAgentWorkingDir(agent)
    if (workingDir && fs.existsSync(workingDir)) {
      const detected = getGitRepoInfo(workingDir)
      if (detected) {
        const existingRepos = agent.tools.repositories || []
        const existingIndex = existingRepos.findIndex(r => r.remoteUrl === detected.remoteUrl)
        if (existingIndex >= 0) {
          existingRepos[existingIndex] = detected
        } else {
          existingRepos.unshift(detected)
        }

        const agents = loadAgents()
        const agentIndex = agents.findIndex(a => a.id === agent.id)
        if (agentIndex >= 0) {
          agents[agentIndex].tools.repositories = existingRepos
          saveAgents(agents)
        }

        return {
          data: { success: true, repositories: existingRepos, detected },
          status: 200
        }
      }
    }

    return { error: 'No git repository found in working directory', status: 400 }
  }

  if (!body.repositories || !Array.isArray(body.repositories)) {
    return { error: 'repositories array required', status: 400 }
  }

  const agents = loadAgents()
  const agentIndex = agents.findIndex(a => a.id === agent.id)
  if (agentIndex >= 0) {
    agents[agentIndex].tools.repositories = body.repositories
    saveAgents(agents)
  }

  return {
    data: { success: true, repositories: body.repositories },
    status: 200
  }
}

/**
 * Remove a repository from an agent.
 */
export function removeRepo(agentIdOrName: string, remoteUrl: string): ServiceResult<Record<string, unknown>> {
  if (!remoteUrl) {
    return { error: 'url parameter required', status: 400 }
  }

  const agent = resolveAgent(agentIdOrName)
  if (!agent) {
    return { error: 'Agent not found', status: 404 }
  }

  const repos = agent.tools.repositories || []
  const filteredRepos = repos.filter(r => r.remoteUrl !== remoteUrl)

  if (filteredRepos.length === repos.length) {
    return { error: 'Repository not found', status: 404 }
  }

  const agents = loadAgents()
  const agentIndex = agents.findIndex(a => a.id === agent.id)
  if (agentIndex >= 0) {
    agents[agentIndex].tools.repositories = filteredRepos
    saveAgents(agents)
  }

  return {
    data: { success: true, repositories: filteredRepos },
    status: 200
  }
}
