/**
 * The browser's side of answering a secret request (F033). Kept apart from the card so it can be
 * tested: one POST to the AI Maestro server, no storage, no logging, and a result that never
 * contains the value.
 */
export interface AnswerBody {
  value?: string
  name?: string
  decline?: boolean
}

export interface AnswerResult {
  ok: boolean
  name?: string
  declined?: boolean
  message?: string
}

export async function answerSecretRequestApi(
  agentId: string,
  requestId: string,
  body: AnswerBody,
  fetchImpl: typeof fetch = fetch,
): Promise<AnswerResult> {
  try {
    const res = await fetchImpl(`/api/agents/${encodeURIComponent(agentId)}/secret-requests/${encodeURIComponent(requestId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) {
      return { ok: false, message: String(data?.message || data?.error || `Could not save it (${res.status})`).slice(0, 200) }
    }
    return { ok: true, name: data?.name, declined: data?.declined === true }
  } catch {
    return { ok: false, message: 'Could not reach AI Maestro.' }
  }
}
