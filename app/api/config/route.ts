import { NextResponse } from 'next/server'

export async function GET() {
  // Read the global logging configuration
  const globalLoggingEnabled = process.env.ENABLE_LOGGING === 'true'

  return NextResponse.json({
    loggingEnabled: globalLoggingEnabled
  })
}
