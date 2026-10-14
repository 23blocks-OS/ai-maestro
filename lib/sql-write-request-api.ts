/**
 * The browser's side of answering a SQL write request (F037). One POST to the AI Maestro server from the
 * page (so the browser adds the same-origin headers the server requires); nothing is stored or logged.
 */
export type SqlWriteAnswer = { action: 'approve'; environment: string } | { action: 'reject' }

export interface SqlWriteAnswerResult {
  ok: boolean
  approved?: boolean
  rejected?: boolean
  message?: string
}

export async function answerSqlWriteRequestApi(
  agentId: string,
  requestId: string,
  body: SqlWriteAnswer,
  fetchImpl: typeof fetch = fetch,
): Promise<SqlWriteAnswerResult> {
  try {
    const res = await fetchImpl(`/api/agents/${encodeURIComponent(agentId)}/sql-write-requests/${encodeURIComponent(requestId)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
    })
    const data: any = await res.json().catch(() => ({}))
    if (!res.ok) return { ok: false, message: String(data?.message || data?.error || `Could not save it (${res.status})`).slice(0, 200) }
    return { ok: true, approved: data?.approved === true, rejected: data?.rejected === true }
  } catch {
    return { ok: false, message: 'Could not reach AI Maestro.' }
  }
}
