/**
 * Handing a file to an agent from the web UI (#270).
 *
 * Save the bytes on the agent's own host, then tell the agent where they are.
 * See lib/agent-uploads for why a path rather than the bytes, and why not the
 * agent's working directory.
 *
 * The prompt is delivered through `sendChatMessage`, deliberately, rather than
 * a fresh `sendKeys`. That path carries the bare-shell guard added in 0.37.14 —
 * so if the agent's program never started, the path is NOT typed at a shell
 * that would try to execute it. Pasting a screenshot into a broken agent should
 * say why, not run `/Users/…/pasted_2026-09-04.png` as a command.
 */

import { getAgent } from '@/lib/agent-registry'
import { sendChatMessage } from '@/services/agents-chat-service'
import {
  isRejection,
  promptFor,
  storeUpload,
  type StoredUpload,
} from '@/lib/agent-uploads'
import {
  invalidRequest,
  notFound,
  serviceError,
  type ServiceResult,
} from '@/services/service-errors'

export interface IncomingFile {
  filename?: string | null
  contentType?: string | null
  bytes: Buffer
}

export interface UploadOutcome {
  success: true
  files: Array<{ path: string; filename: string; size: number }>
  /** Whether the agent was actually told. False when it has no live session. */
  announced: boolean
  /** Why it was not announced, when it was not. */
  announceError?: string
}

/**
 * Store files for an agent and tell it they are there.
 *
 * Storing and announcing are separate outcomes on purpose. A file can land
 * safely while the agent cannot be told — no session, or a program that never
 * started — and reporting that as plain success would be the same unearned
 * claim this codebase has been removing all week. The caller gets both facts.
 */
export async function uploadFilesToAgent(
  agentId: string,
  files: IncomingFile[]
): Promise<ServiceResult<UploadOutcome>> {
  if (!files || files.length === 0) {
    return invalidRequest('No files provided')
  }
  if (files.length > 10) {
    return invalidRequest('At most 10 files at a time')
  }

  const agent = getAgent(agentId)
  if (!agent) return notFound('Agent', agentId)

  const stored: StoredUpload[] = []
  for (const file of files) {
    const result = storeUpload(agentId, file.bytes, {
      filename: file.filename,
      contentType: file.contentType,
    })
    if (isRejection(result)) {
      // Refuse the whole batch rather than half of it. A partial upload leaves
      // the agent told about some files and not others, and the person has no
      // way to tell which.
      return serviceError('invalid_request', `${file.filename || 'file'}: ${result.reason}`, 400)
    }
    stored.push(result)
  }

  const announce = await sendChatMessage(agentId, promptFor(stored))
  const announceFailed = !announce.data || (announce.status >= 400)

  return {
    data: {
      success: true,
      files: stored.map(s => ({ path: s.path, filename: s.filename, size: s.size })),
      announced: !announceFailed,
      ...(announceFailed
        ? {
            announceError:
              (announce.data as { message?: string } | undefined)?.message ||
              'The files were saved, but the agent could not be told about them.',
          }
        : {}),
    },
    status: 200,
  }
}
