import { NextResponse } from 'next/server'
import os from 'os'

export async function GET() {
  // Read the global logging configuration
  const globalLoggingEnabled = process.env.ENABLE_LOGGING === 'true'

  // System information
  const systemInfo = {
    loggingEnabled: globalLoggingEnabled,
    platform: os.platform(),
    nodeVersion: process.version,
    port: process.env.PORT || '23000',
  }

  return NextResponse.json(systemInfo)
}
