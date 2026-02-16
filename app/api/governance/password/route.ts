import { NextRequest, NextResponse } from 'next/server'
import { loadGovernance, setPassword, verifyPassword } from '@/lib/governance'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json()
    const { password, currentPassword } = body

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }

    const config = loadGovernance()

    // If password already set, require current password
    if (config.passwordHash) {
      if (!currentPassword || !verifyPassword(currentPassword)) {
        return NextResponse.json({ error: 'Invalid current password' }, { status: 401 })
      }
    }

    setPassword(password)
    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to set password:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set password' },
      { status: 500 }
    )
  }
}
