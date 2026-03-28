import { NextResponse } from 'next/server'
import { redo, getStatus } from '@/lib/config-transaction'

export const dynamic = 'force-dynamic'

export async function POST() {
  try {
    const result = await redo()
    if (!result.success) {
      return NextResponse.json({ error: result.error }, { status: 404 })
    }
    const status = getStatus()
    return NextResponse.json({ success: true, description: result.description, ...status })
  } catch (error) {
    console.error('[config/redo] Failed:', error)
    return NextResponse.json({ error: 'Redo failed' }, { status: 500 })
  }
}
