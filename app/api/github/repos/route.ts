import { NextRequest, NextResponse } from 'next/server'
import { listRepos, createRepo, listOrgs } from '@/lib/github-cli'

// GET /api/github/repos — List repos (optionally for an owner)
export async function GET(request: NextRequest) {
  try {
    const owner = request.nextUrl.searchParams.get('owner') || undefined
    const repos = listRepos(owner)
    return NextResponse.json({ repos })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to list repos: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}

// POST /api/github/repos — Create a new repo
export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { name, org, isPrivate, description, addReadme } = body
    if (!name) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }
    const repo = createRepo(name, { org, isPrivate, description, addReadme })
    return NextResponse.json({ repo })
  } catch (error) {
    return NextResponse.json(
      { error: `Failed to create repo: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}
