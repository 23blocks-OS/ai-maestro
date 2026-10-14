import { describe, it, expect, vi } from 'vitest'
import fs from 'fs'
import path from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import SqlWriteRequestCard, { formatCountdown } from '@/components/chat/SqlWriteRequestCard'
import { answerSqlWriteRequestApi } from '@/lib/sql-write-request-api'
import { toView } from '@/lib/sql-write-requests'

const root = path.join(__dirname, '..')
const src = (p: string) => fs.readFileSync(path.join(root, p), 'utf8')
const fixture = JSON.parse(src('tests/fixtures/sql-write-request.json'))
const request = { ...toView({ ...fixture, expires: Date.now() / 1000 + 300 }) }

describe('the card', () => {
  const html = renderToStaticMarkup(createElement(SqlWriteRequestCard, { agentId: 'agent-1', request, onDone: () => {} }))

  it('shows what the wrapper approval screen shows', () => {
    expect(html).toContain('UPDATE')
    expect(html).toContain('public.customers')
    expect(html).toContain('staging')
    expect(html).toContain('UPDATE customers SET plan = %(plan)s WHERE email = %(email)s')
    expect(html).toContain('plan: &quot;free&quot; -&gt; &quot;pro&quot;')
    expect(html).toContain('customer asked to be moved to Pro')
    expect(html).toMatch(/expires in \d+:\d\d/)
  })

  it('starts with approve off until the environment is typed, and reject on', () => {
    expect(html).toMatch(/<button[^>]*disabled[^>]*>Approve<\/button>/)
    expect(html).toMatch(/<button(?![^>]*disabled="")[^>]*>Reject<\/button>/)
    expect(html).toContain('type the environment name')
  })

  it('says plainly what the approval does and does not protect against', () => {
    expect(html).toContain('accident or with a plain curl')
    expect(html).toContain('forges headers or edits the request file')
  })

  it('cannot approve a changed or expired request', () => {
    const changed = renderToStaticMarkup(createElement(SqlWriteRequestCard, { agentId: 'a', request: { ...request, changed: true }, onDone: () => {} }))
    expect(changed).toContain('cannot be approved')
    const expired = renderToStaticMarkup(createElement(SqlWriteRequestCard, { agentId: 'a', request: { ...request, expiresAt: 1 }, onDone: () => {} }))
    expect(expired).toContain('expired')
  })

  it('has no button inside a button', () => {
    expect(html).not.toMatch(/<button[^>]*>(?:(?!<\/button>).)*<button/s)
  })

  it('counts down in minutes and seconds', () => {
    expect(formatCountdown(125_000)).toBe('2:05')
    expect(formatCountdown(0)).toBe('expired')
  })
})

describe('answering from the browser', () => {
  it('posts once to the dedicated endpoint as JSON with the typed environment', async () => {
    const f = vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ approved: true }) })) as any
    const r = await answerSqlWriteRequestApi('agent-1', request.id, { action: 'approve', environment: 'staging' }, f)
    expect(r).toEqual({ ok: true, approved: true, rejected: false })
    const [url, init] = f.mock.calls[0]
    expect(url).toBe(`/api/agents/agent-1/sql-write-requests/${request.id}`)
    expect(init.method).toBe('POST')
    expect(JSON.parse(init.body)).toEqual({ action: 'approve', environment: 'staging' })
  })

  it('shows the server message on a refusal, and reports an unreachable server in plain words', async () => {
    const no = vi.fn(async () => ({ ok: false, status: 403, json: async () => ({ message: 'Approve this in the chat' }) })) as any
    expect(await answerSqlWriteRequestApi('a', request.id, { action: 'reject' }, no)).toEqual({ ok: false, message: 'Approve this in the chat' })
    const down = vi.fn(async () => { throw new Error('boom') }) as any
    expect(await answerSqlWriteRequestApi('a', request.id, { action: 'reject' }, down)).toEqual({ ok: false, message: 'Could not reach AI Maestro.' })
  })
})

describe('wiring contract', () => {
  it('both chat views fetch the requests and render the card', () => {
    for (const f of ['components/ChatView.tsx', 'components/MobileChatView.tsx']) {
      const s = src(f)
      expect(s, f).toContain("import SqlWriteRequestCard from '@/components/chat/SqlWriteRequestCard'")
      expect(s, f).toMatch(/useSqlWriteRequests\(/)
      expect(s, f).toMatch(/<SqlWriteRequestCard[^>]*request=\{r\}/)
    }
  })

  it('the next routes exist, take Promise params and pass the browser headers', () => {
    const list = src('app/api/agents/[id]/sql-write-requests/route.ts')
    expect(list).toContain('Promise<{ id: string }>')
    const answer = src('app/api/agents/[id]/sql-write-requests/[rid]/route.ts')
    expect(answer).toContain('Promise<{ id: string; rid: string }>')
    for (const h of ['sec-fetch-site', 'origin', 'host']) expect(answer).toContain(`'${h}'`)
  })

  it('the headless router serves the same two routes with the same headers', () => {
    const r = src('services/headless-router.ts')
    expect(r).toContain('sql-write-requests$/, paramNames: [\'id\']')
    expect(r).toContain('sql-write-requests\\/([^/]+)$/, paramNames: [\'id\', \'rid\']')
    expect(r).toMatch(/answerSqlWriteRequest\(params\.id, params\.rid, body, \{\s*secFetchSite: getHeader\(req, 'sec-fetch-site'\), origin: getHeader\(req, 'origin'\), host: getHeader\(req, 'host'\)/)
  })

  it('the service never runs the wrapper or opens a database connection', () => {
    for (const f of ['services/agent-sql-write-requests-service.ts', 'lib/sql-write-requests.ts']) {
      const s = src(f)
      expect(s, f).not.toMatch(/child_process|execFile|spawn|from 'pg'|from 'postgres'|require\('pg'\)/)
    }
  })
})
