/**
 * Agent Import API
 *
 * POST /api/agents/import — Import agent from ZIP file (multipart/form-data)
 *
 * Thin wrapper — business logic in services/agents-transfer-service.ts
 */

import { NextResponse } from 'next/server'
import { importAgent } from '@/services/agents-transfer-service'
import type { AgentImportOptions } from '@/types/portable'

export async function POST(request: Request) {
  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const optionsStr = formData.get('options') as string | null

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 })
    }

    const options: AgentImportOptions = optionsStr ? JSON.parse(optionsStr) : {}
    const arrayBuffer = await file.arrayBuffer()
    const buffer = Buffer.from(arrayBuffer)

    const result = await importAgent(buffer, options)
    return NextResponse.json(result.data, { status: result.status })
  } catch (error) {
    console.error('Failed to import agent:', error)
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    )
  }
}
