import { describe, it, expect, vi } from 'vitest'

vi.mock('@anthropic-ai/claude-agent-sdk', () => ({ query: vi.fn(() => ({ [Symbol.asyncIterator]: async function* () {} })) }))

const { Session } = await import('@/lib/streaming-runtime.mjs')

// Permissions and questions reach a stream through canUseTool, never the hook's "needs you"
// notification, so without this a streaming agent blocked on a person showed as Working
function makeSession() {
  const reports: string[] = []
  const s = Object.create(Session.prototype)
  s.pending = new Map()
  s.closed = false
  s.agentId = 'a1'
  s.agentName = 'dahlia'
  s._waitingReported = false
  s._report = (_id: string, _name: string, status: string) => reports.push(status)
  s._emit = () => {}
  return { s, reports }
}

describe('a streaming agent waiting on a person', () => {
  it('reports Needs you once for open requests, and Working when the last is answered', () => {
    const { s, reports } = makeSession()
    s._onCanUseTool('Bash', { command: 'ls' }, {})
    s._onCanUseTool('AskUserQuestion', { questions: [{ question: 'Which?', options: [] }] }, {})
    expect(reports).toEqual(['permission_request'])

    const [perm, ask] = [...s.pending.keys()]
    s.resolvePermission(perm, 'allow')
    expect(reports).toEqual(['permission_request'])
    s.resolveQuestion(ask, { 'Which?': 'A' })
    expect(reports).toEqual(['permission_request', 'active'])
    for (const p of s.pending.values()) clearTimeout(p.timer)
  })

  it('reports nothing without an agent name to report under', () => {
    const { s, reports } = makeSession()
    s.agentName = null
    s._onCanUseTool('Bash', { command: 'ls' }, {})
    expect(reports).toEqual([])
    for (const p of s.pending.values()) clearTimeout(p.timer)
  })
})
