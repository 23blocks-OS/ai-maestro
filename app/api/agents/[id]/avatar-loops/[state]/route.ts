/**
 * GET /api/agents/:id/avatar-loops/:state — one living-avatar loop (mp4).
 * Honours Range requests: Safari will not play a video without them.
 */
import fs from 'fs'
import { Readable } from 'stream'
import { avatarLoopPath, parseRange } from '@/lib/avatar-loops'

export const dynamic = 'force-dynamic'

export async function GET(req: Request, { params }: { params: Promise<{ id: string; state: string }> }) {
  const { id, state } = await params
  const file = avatarLoopPath(id, state.replace(/\.mp4$/, ''))
  if (!file) return new Response('Not found', { status: 404 })
  const size = fs.statSync(file).size
  const range = parseRange(req.headers.get('range'), size)
  const headers: Record<string, string> = {
    'Content-Type': 'video/mp4',
    'Accept-Ranges': 'bytes',
    'Cache-Control': 'max-age=3600',
  }
  if (range) {
    headers['Content-Range'] = `bytes ${range.start}-${range.end}/${size}`
    headers['Content-Length'] = String(range.end - range.start + 1)
    const stream = Readable.toWeb(fs.createReadStream(file, { start: range.start, end: range.end })) as ReadableStream
    return new Response(stream, { status: 206, headers })
  }
  headers['Content-Length'] = String(size)
  return new Response(Readable.toWeb(fs.createReadStream(file)) as ReadableStream, { status: 200, headers })
}
