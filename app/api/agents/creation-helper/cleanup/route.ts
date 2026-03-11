import { NextResponse } from 'next/server'
import { rm } from 'fs/promises'
import { existsSync } from 'fs'
import { join } from 'path'

export const dynamic = 'force-dynamic'

/**
 * POST /api/agents/creation-helper/cleanup
 * Removes temp files created during the Haephestos session:
 * - ~/.aimaestro/tmp/haephestos-draft.toml
 * - ~/.aimaestro/tmp/creation-helper/ (uploaded files)
 */
export async function POST() {
  const home = process.env.HOME
  if (!home) {
    return NextResponse.json({ cleaned: false, reason: 'HOME not set' })
  }

  const tmpDir = join(home, '.aimaestro', 'tmp')
  const draftPath = join(tmpDir, 'haephestos-draft.toml')
  const uploadsDir = join(tmpDir, 'creation-helper')

  const cleaned: string[] = []

  if (existsSync(draftPath)) {
    await rm(draftPath).catch(() => {})
    cleaned.push('haephestos-draft.toml')
  }

  if (existsSync(uploadsDir)) {
    await rm(uploadsDir, { recursive: true }).catch(() => {})
    cleaned.push('creation-helper/')
  }

  return NextResponse.json({ cleaned: true, files: cleaned })
}
