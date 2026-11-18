/** PATCH /api/voiceprints/[personId] { name }: the person was renamed. DELETE: removes the person's voiceprint from this host. */
import { removeVoiceprint, renameVoiceprint } from '@/services/voiceprints-service'
import { toResponse } from '@/app/api/_helpers'

export const dynamic = 'force-dynamic'

export async function DELETE(_req: Request, { params }: { params: Promise<{ personId: string }> }) {
  return toResponse(removeVoiceprint((await params).personId))
}

export async function PATCH(req: Request, { params }: { params: Promise<{ personId: string }> }) {
  return toResponse(renameVoiceprint((await params).personId, await req.json().catch(() => ({}))))
}
