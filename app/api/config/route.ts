import { NextResponse } from 'next/server'
import { getSystemConfig } from '@/services/config-service'

export async function GET() {
  const result = getSystemConfig()
  return NextResponse.json(result.data, { status: result.status })
}
