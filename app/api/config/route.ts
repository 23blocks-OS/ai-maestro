import { NextResponse } from 'next/server'
import { getSystemConfig } from '@/services/config-service'

// CC-P1-817: Add error handling consistent with other routes
export async function GET() {
  const result = getSystemConfig()
  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
