import { NextRequest, NextResponse } from 'next/server'
import { loadGovernance, setPassword, verifyPassword } from '@/lib/governance'
import { checkRateLimit, recordFailure, resetRateLimit } from '@/lib/rate-limit'

export async function POST(request: NextRequest) {
  try {
    let body
    try { body = await request.json() } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { password, currentPassword } = body

    if (!password || typeof password !== 'string' || password.length < 6) {
      return NextResponse.json({ error: 'Password must be at least 6 characters' }, { status: 400 })
    }
    if (password.length > 72) {
      return NextResponse.json({ error: 'Password must not exceed 72 characters (bcrypt limit)' }, { status: 400 })
    }

    const config = loadGovernance()

    // If password already set, require current password
    if (config.passwordHash) {
      // Rate limit password verification to prevent brute-force attacks
      const rateCheck = checkRateLimit('governance-password-change')
      if (!rateCheck.allowed) {
        return NextResponse.json(
          { error: `Too many failed password attempts. Try again in ${Math.ceil(rateCheck.retryAfterMs / 1000)}s` },
          { status: 429 }
        )
      }

      if (!currentPassword || typeof currentPassword !== 'string') {
        recordFailure('governance-password-change')
        return NextResponse.json({ error: 'Invalid current password' }, { status: 400 })
      }
      if (!(await verifyPassword(currentPassword))) {
        recordFailure('governance-password-change')
        return NextResponse.json({ error: 'Invalid current password' }, { status: 401 })
      }
      // Password verified successfully — reset rate limit counter
      resetRateLimit('governance-password-change')
    }

    const isChange = !!config.passwordHash
    await setPassword(password)

    if (isChange) {
      console.log('[governance] Password changed at', new Date().toISOString())
    } else {
      console.log('[governance] Password set at', new Date().toISOString())
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Failed to set password:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to set password' },
      { status: 500 }
    )
  }
}
