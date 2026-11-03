/**
 * B026: Claude Code wraps a paste in <pasted_content> tags in the transcript. The chat showed the tags and
 * never matched the person's "Sending" bubble, which then offered Retry for a message the agent had.
 */
import { describe, it, expect } from 'vitest'
import { unwrapPastedContent } from '@/lib/transcript-records.mjs'
import { parseJsonlLines } from '@/lib/chat-transcript.mjs'
import { reconcilePending } from '@/lib/pending-reconcile.mjs'

const SENT = "Some basic engineering concepts you need to know, like the multi-tenancy stuff and everything.  \n  \nNothing of this should modify what you already have. Any questions?"
// as Claude Code 2.1.316 stored it on tct-gm, 2026-11-03: the closing tag lands mid-word
const STORED = '\n\n<pasted_content id="751d">\nSome basic engineering concepts you need to know, like the multi-tenancy stu\n</pasted_content id="751d">\n\nff and everything.  \n  \nNothing of this should modify what you already have. Any questions?'

describe('unwrapPastedContent', () => {
  it('gives back the text the person sent', () => {
    expect(unwrapPastedContent(STORED)).toBe(SENT)
  })

  it('leaves text without tags untouched', () => {
    expect(unwrapPastedContent('hello <b>there</b>')).toBe('hello <b>there</b>')
    expect(unwrapPastedContent(undefined as any)).toBeUndefined()
  })
})

describe('chat transcript with a paste', () => {
  const line = (content: unknown) => JSON.stringify({ type: 'user', uuid: 'u1', timestamp: '2026-11-03T17:46:38Z', message: { role: 'user', content } })

  it('shows the user line without tags, string or text blocks', () => {
    expect(parseJsonlLines([line(STORED)])[0].message.content).toBe(SENT)
    expect(parseJsonlLines([line([{ type: 'text', text: STORED }])])[0].message.content[0].text).toBe(SENT)
  })

  it('confirms the "Sending" bubble', () => {
    const msgs = parseJsonlLines([line(STORED)])
    const left = reconcilePending([{ id: 'p1', text: SENT, status: 'pending' }], msgs, (m: any) => m.message.content)
    expect(left).toEqual([])
  })
})
