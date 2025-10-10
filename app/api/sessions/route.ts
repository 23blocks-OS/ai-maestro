import { NextResponse } from 'next/server'
import { exec } from 'child_process'
import { promisify } from 'util'
import type { Session } from '@/types/session'

const execAsync = promisify(exec)

export async function GET() {
  try {
    // Execute tmux list-sessions command
    const { stdout } = await execAsync('tmux list-sessions 2>/dev/null || echo ""')

    if (!stdout.trim()) {
      // No sessions found
      return NextResponse.json({ sessions: [] })
    }

    // Parse tmux output
    const sessions = stdout
      .trim()
      .split('\n')
      .map((line) => {
        // Format: "session-name: 1 windows (created Wed Jan 10 14:23:45 2025) (attached)"
        // Or: "session-name: 1 windows (created Wed Jan 10 14:23:45 2025)"
        const match = line.match(/^([^:]+):\s+(\d+)\s+windows?\s+\(created\s+(.+?)\)/)

        if (!match) return null

        const [, name, windows, createdStr] = match

        // Parse tmux date format: "Thu Oct  9 12:24:58 2025"
        // Normalize multiple spaces to single space for parsing
        const normalizedDate = createdStr.trim().replace(/\s+/g, ' ')

        // Try to parse the date, fallback to current time if it fails
        let createdAt: string
        try {
          const parsedDate = new Date(normalizedDate)
          createdAt = isNaN(parsedDate.getTime())
            ? new Date().toISOString()
            : parsedDate.toISOString()
        } catch {
          createdAt = new Date().toISOString()
        }

        return {
          id: name,
          name,
          workingDirectory: '', // Not available from tmux ls
          status: 'active' as const,
          createdAt,
          lastActivity: new Date().toISOString(),
          windows: parseInt(windows, 10),
        }
      })
      .filter(session => session !== null) as Session[]

    return NextResponse.json({ sessions })
  } catch (error) {
    console.error('Failed to fetch sessions:', error)
    return NextResponse.json(
      { error: 'Failed to fetch sessions', sessions: [] },
      { status: 500 }
    )
  }
}
