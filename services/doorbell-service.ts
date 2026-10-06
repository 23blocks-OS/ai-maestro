/**
 * POST /api/messages/doorbell: "message X landed in agent Y's inbox, wake it".
 * See lib/doorbell.ts. Body: { recipient: string, messageId: string }.
 */

import { ringDoorbell, MESSAGE_ID_RE, RECIPIENT_RE, type DoorbellResult } from '@/lib/doorbell'
import { type ServiceResult, invalidRequest, invalidField } from '@/services/service-errors'

export async function ringDoorbellService(body: unknown): Promise<ServiceResult<DoorbellResult>> {
  const b = (body && typeof body === 'object' ? body : {}) as { recipient?: unknown; messageId?: unknown }
  if (typeof b.recipient !== 'string' || typeof b.messageId !== 'string') {
    return invalidRequest('recipient and messageId (strings) are required')
  }
  if (!RECIPIENT_RE.test(b.recipient)) return invalidField('recipient', 'unexpected characters')
  if (!MESSAGE_ID_RE.test(b.messageId)) return invalidField('messageId', 'unexpected characters')
  const result = await ringDoorbell({ recipient: b.recipient, messageId: b.messageId })
  return { data: result, status: 200 }
}
