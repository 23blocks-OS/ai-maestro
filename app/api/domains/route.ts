import { NextResponse } from 'next/server'
import { listAllDomains, createNewDomain } from '@/services/domains-service'

/**
 * GET /api/domains
 * List all email domains
 */
export async function GET() {
  const result = listAllDomains()

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data)
}

/**
 * POST /api/domains
 * Create a new email domain
 */
export async function POST(request: Request) {
  let body
  try { body = await request.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const result = createNewDomain(body)

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: result.status })
  }
  return NextResponse.json(result.data, { status: result.status })
}
