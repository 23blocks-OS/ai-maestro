import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import MeetingChatPanel from '@/components/team-meeting/MeetingChatPanel'

// The strip under the chat that says who got the last message
const agents = [
  { id: 'a1', name: 'alpha', label: 'Alma' },
  { id: 'r1', name: 'remote-one' },
] as any
const noop = async () => {}

function render(lastDelivery: any) {
  return renderToStaticMarkup(createElement(MeetingChatPanel, {
    agents, messages: [], onSendToAgent: noop, onBroadcastToAll: noop,
    delivery: { lastDelivery, retryFailed: noop, dismissDelivery: () => {} },
  }))
}
const row = (agentId: string, status: 'delivered' | 'failed', extra: any = {}) =>
  ({ agentId, name: agentId, status, notified: true, verified: false, deferred: false, ...extra })

describe('MeetingChatPanel delivery strip', () => {
  it('shows nothing before anything was sent', () => {
    expect(render(null)).not.toContain('meeting-delivery')
  })

  it('says everyone was reached, with no retry', () => {
    const html = render({ message: 'hi', sentAt: '', results: [row('a1', 'delivered'), row('r1', 'delivered')] })
    expect(html).toContain('Reached 2 of 2')
    expect(html).not.toContain('Retry')
  })

  it('names who failed and why, and offers a retry', () => {
    const html = render({ message: 'hi', sentAt: '', results: [row('a1', 'delivered'), row('r1', 'failed', { error: 'the host cannot be reached' })] })
    expect(html).toContain('Reached 1 of 2')
    expect(html).toContain('remote-one: the host cannot be reached')
    expect(html).toContain('Retry 1')
  })

  it('names agents that got it but are waiting in the inbox, by their label', () => {
    const html = render({ message: 'hi', sentAt: '', results: [row('a1', 'delivered', { deferred: true }), row('r1', 'delivered')] })
    expect(html).toContain('waiting in the inbox: Alma')
  })
})
