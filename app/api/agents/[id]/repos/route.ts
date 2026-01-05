import { NextResponse } from 'next/server'
import { getAgent, getAgentByAlias, loadAgents, saveAgents } from '@/lib/agent-registry'
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import type { Repository } from '@/types/agent'

/**
 * Get git repository info from a directory
 */
function getGitRepoInfo(dirPath: string): Repository | null {
  try {
    // Check if it's a git repo
    const gitDir = path.join(dirPath, '.git')
    if (!fs.existsSync(gitDir)) {
      return null
    }

    // Get remote URL
    let remoteUrl = ''
    try {
      remoteUrl = execSync('git config --get remote.origin.url', {
        cwd: dirPath,
        encoding: 'utf-8',
        timeout: 5000
      }).trim()
    } catch {
      // No remote configured
    }

    if (!remoteUrl) {
      return null // Skip repos without remotes
    }

    // Get current branch
    let currentBranch = ''
    try {
      currentBranch = execSync('git rev-parse --abbrev-ref HEAD', {
        cwd: dirPath,
        encoding: 'utf-8',
        timeout: 5000
      }).trim()
    } catch {
      currentBranch = 'unknown'
    }

    // Get default branch (usually main or master)
    let defaultBranch = currentBranch
    try {
      // Try to get the default branch from remote
      const remoteBranch = execSync('git symbolic-ref refs/remotes/origin/HEAD 2>/dev/null || echo ""', {
        cwd: dirPath,
        encoding: 'utf-8',
        timeout: 5000,
        shell: '/bin/bash'
      }).trim()
      if (remoteBranch) {
        defaultBranch = remoteBranch.replace('refs/remotes/origin/', '')
      }
    } catch {
      // Use current branch as default
    }

    // Get last commit hash
    let lastCommit = ''
    try {
      lastCommit = execSync('git rev-parse HEAD', {
        cwd: dirPath,
        encoding: 'utf-8',
        timeout: 5000
      }).trim().substring(0, 8)
    } catch {
      // No commits
    }

    // Derive name from directory or remote URL
    const name = path.basename(dirPath) || path.basename(remoteUrl.replace(/\.git$/, ''))

    return {
      name,
      remoteUrl,
      localPath: dirPath,
      defaultBranch,
      currentBranch,
      lastCommit,
      lastSynced: new Date().toISOString(),
      isPrimary: true // The working directory repo is primary
    }
  } catch (error) {
    console.error(`Error getting git info for ${dirPath}:`, error)
    return null
  }
}

/**
 * GET /api/agents/[id]/repos
 * Get repositories associated with an agent (detected from working directory)
 */
export async function GET(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    let agent = getAgent(params.id)
    if (!agent) {
      agent = getAgentByAlias(params.id)
    }

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    // Get repositories from agent config
    const configuredRepos = agent.tools.repositories || []

    // Detect repo from working directory if not already configured
    const workingDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory || agent.preferences?.defaultWorkingDirectory
    let detectedRepo: Repository | null = null

    if (workingDir && fs.existsSync(workingDir)) {
      detectedRepo = getGitRepoInfo(workingDir)
    }

    // Merge configured and detected repos
    const repos: Repository[] = [...configuredRepos]

    if (detectedRepo) {
      // Check if this repo is already in the list
      const existingIndex = repos.findIndex(r => r.remoteUrl === detectedRepo!.remoteUrl)
      if (existingIndex >= 0) {
        // Update existing entry with fresh info
        repos[existingIndex] = { ...repos[existingIndex], ...detectedRepo }
      } else {
        // Add as new primary repo
        repos.unshift(detectedRepo)
      }
    }

    return NextResponse.json({
      repositories: repos,
      workingDirectory: workingDir,
      detectedFromWorkingDir: !!detectedRepo
    })
  } catch (error) {
    console.error('Error getting agent repos:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to get repositories'
    }, { status: 500 })
  }
}

/**
 * POST /api/agents/[id]/repos
 * Add or update repositories for an agent
 */
export async function POST(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    let agent = getAgent(params.id)
    if (!agent) {
      agent = getAgentByAlias(params.id)
    }

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const body = await request.json()
    const { repositories, detectFromWorkingDir } = body

    // If detectFromWorkingDir is true, auto-detect repos
    if (detectFromWorkingDir) {
      const workingDir = agent.workingDirectory || agent.sessions?.[0]?.workingDirectory || agent.preferences?.defaultWorkingDirectory
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

          // Update agent
          const agents = loadAgents()
          const agentIndex = agents.findIndex(a => a.id === agent.id)
          if (agentIndex >= 0) {
            agents[agentIndex].tools.repositories = existingRepos
            saveAgents(agents)
          }

          return NextResponse.json({
            success: true,
            repositories: existingRepos,
            detected
          })
        }
      }

      return NextResponse.json({
        success: false,
        error: 'No git repository found in working directory'
      }, { status: 400 })
    }

    // Otherwise, save provided repositories
    if (!repositories || !Array.isArray(repositories)) {
      return NextResponse.json({
        error: 'repositories array required'
      }, { status: 400 })
    }

    // Update agent
    const agents = loadAgents()
    const agentIndex = agents.findIndex(a => a.id === agent.id)
    if (agentIndex >= 0) {
      agents[agentIndex].tools.repositories = repositories
      saveAgents(agents)
    }

    return NextResponse.json({
      success: true,
      repositories
    })
  } catch (error) {
    console.error('Error updating agent repos:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to update repositories'
    }, { status: 500 })
  }
}

/**
 * DELETE /api/agents/[id]/repos?url=<remoteUrl>
 * Remove a repository from an agent
 */
export async function DELETE(
  request: Request,
  { params }: { params: { id: string } }
) {
  try {
    const { searchParams } = new URL(request.url)
    const remoteUrl = searchParams.get('url')

    if (!remoteUrl) {
      return NextResponse.json({ error: 'url parameter required' }, { status: 400 })
    }

    let agent = getAgent(params.id)
    if (!agent) {
      agent = getAgentByAlias(params.id)
    }

    if (!agent) {
      return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
    }

    const repos = agent.tools.repositories || []
    const filteredRepos = repos.filter(r => r.remoteUrl !== remoteUrl)

    if (filteredRepos.length === repos.length) {
      return NextResponse.json({ error: 'Repository not found' }, { status: 404 })
    }

    // Update agent
    const agents = loadAgents()
    const agentIndex = agents.findIndex(a => a.id === agent.id)
    if (agentIndex >= 0) {
      agents[agentIndex].tools.repositories = filteredRepos
      saveAgents(agents)
    }

    return NextResponse.json({
      success: true,
      repositories: filteredRepos
    })
  } catch (error) {
    console.error('Error removing repo:', error)
    return NextResponse.json({
      error: error instanceof Error ? error.message : 'Failed to remove repository'
    }, { status: 500 })
  }
}
