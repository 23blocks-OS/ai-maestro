/**
 * POST /api/settings/global-elements/install-skill
 *
 * Install a skill globally at user scope.
 * Finds the skill from plugin cache or user skills, copies to ~/.claude/skills/.
 * Optionally install for a different client via targetClient param.
 *
 * Body: { name: string, source?: string, targetClient?: string }
 */

import { NextRequest, NextResponse } from 'next/server'
import { findSkillSource, convertElements } from '@/services/cross-client-conversion-service'
import { copyDir, ensureDir } from '@/lib/converter/utils/fs'
import path from 'path'
import os from 'os'

export const dynamic = 'force-dynamic'

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })

  const { name, targetClient } = body
  if (!name || typeof name !== 'string') {
    return NextResponse.json({ error: 'Skill name is required' }, { status: 400 })
  }

  // Find the skill in Claude's installed locations
  const source = await findSkillSource(name, 'claude')
  if (!source) {
    return NextResponse.json(
      { error: `Skill "${name}" not found in any installed plugin or skill directory` },
      { status: 404 }
    )
  }

  // If targetClient specified, use the converter to transform and install
  if (targetClient && targetClient !== 'claude' && targetClient !== 'claude-code') {
    const result = await convertElements({
      source: source.skillPath,
      targetClient: targetClient,
      elements: ['skills'],
      scope: 'user',
    })

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 400 })
    }

    return NextResponse.json({
      installed: true,
      name,
      targetClient,
      files: result.files.length,
      warnings: result.warnings,
    })
  }

  // Default: copy to Claude user-scope skills
  const targetDir = path.join(os.homedir(), '.claude', 'skills', name)
  try {
    await ensureDir(path.join(os.homedir(), '.claude', 'skills'))
    await copyDir(source.skillPath, targetDir)
    return NextResponse.json({
      installed: true,
      name,
      sourcePath: source.skillPath,
      targetPath: targetDir,
      scope: 'user',
    })
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'Failed to install skill' },
      { status: 500 }
    )
  }
}
