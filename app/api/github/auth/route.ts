import { NextRequest, NextResponse } from 'next/server'
import { getAuthStatus, switchIdentity, hasProjectScope } from '@/lib/github-cli'

// GET /api/github/auth — Get GitHub auth status
export async function GET() {
  try {
    const accounts = getAuthStatus()
    const projectScope = hasProjectScope()
    return NextResponse.json({ accounts, hasProjectScope: projectScope })
  } catch (error) {
    return NextResponse.json(
      { error: `GitHub auth check failed: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}

// POST /api/github/auth — Switch GitHub identity
export async function POST(request: NextRequest) {
  try {
    const { username } = await request.json()
    if (!username) {
      return NextResponse.json({ error: 'username is required' }, { status: 400 })
    }
    switchIdentity(username)
    return NextResponse.json({ success: true, activeUser: username })
  } catch (error) {
    return NextResponse.json(
      { error: `Identity switch failed: ${(error as Error).message}` },
      { status: 500 }
    )
  }
}
