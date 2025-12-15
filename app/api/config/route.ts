import { NextResponse } from 'next/server'
import os from 'os'
import fs from 'fs'
import path from 'path'

export async function GET() {
  // Read the global logging configuration
  const globalLoggingEnabled = process.env.ENABLE_LOGGING === 'true'

  // Read version from version.json
  let version = 'unknown'
  try {
    const versionPath = path.join(process.cwd(), 'version.json')
    const versionData = JSON.parse(fs.readFileSync(versionPath, 'utf-8'))
    version = versionData.version || 'unknown'
  } catch (err) {
    console.error('[Config API] Failed to read version.json:', err)
  }

  // System information
  const systemInfo = {
    version,
    loggingEnabled: globalLoggingEnabled,
    platform: os.platform(),
    nodeVersion: process.version,
    port: process.env.PORT || '23000',
  }

  return NextResponse.json(systemInfo)
}
