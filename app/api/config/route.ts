import { NextResponse } from 'next/server'
import { getSystemConfig } from '@/services/config-service'

export async function GET() {
  try {
    const result = getSystemConfig()
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: result.status })
    }
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('[Config] Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
