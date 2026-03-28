import { NextRequest, NextResponse } from 'next/server'
import { getAgent } from '@/lib/agent-registry'
import { execSync } from 'child_process'

// GET /api/agents/[id]/repos — Scan agent's working directory for git repos
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const agent = getAgent(id)
  if (!agent) {
    return NextResponse.json({ error: 'Agent not found' }, { status: 404 })
  }

  const workDir = agent.workingDirectory
  if (!workDir) {
    return NextResponse.json({ repos: [], message: 'No working directory set' })
  }

  try {
    // Find .git directories up to 2 levels deep
    const gitDirs = execSync(
      `find "${workDir}" -maxdepth 3 -name .git -type d 2>/dev/null`,
      { encoding: 'utf-8', timeout: 5000 }
    ).trim().split('\n').filter(Boolean)

    const repos = gitDirs.map(gitDir => {
      const repoDir = gitDir.replace(/\/\.git$/, '')
      const name = repoDir.split('/').pop() || ''
      let remote = ''
      let branch = ''
      let dirty = 0
      try {
        remote = execSync(`git -C "${repoDir}" remote get-url origin 2>/dev/null`, { encoding: 'utf-8' }).trim()
      } catch { /* no remote */ }
      try {
        branch = execSync(`git -C "${repoDir}" branch --show-current 2>/dev/null`, { encoding: 'utf-8' }).trim()
      } catch { /* detached */ }
      try {
        dirty = execSync(`git -C "${repoDir}" status --porcelain 2>/dev/null`, { encoding: 'utf-8' }).trim().split('\n').filter(Boolean).length
      } catch { /* error */ }
      return { path: repoDir, name, remote, branch, dirty }
    })

    return NextResponse.json({ repos })
  } catch (error) {
    return NextResponse.json(
      { error: `Repo scan failed: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}
