import { describe, it, expect } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import AgentCredentialSection from '@/components/AgentCredentialSection'

// The model access picker in the creation wizard (#65): no agent yet, so nothing to check and no wake to wait for
describe('model access while creating an agent', () => {
  it('says the choice is used from the first start, and asks for a vault name, never a value', () => {
    const html = renderToStaticMarkup(createElement(AgentCredentialSection, { baseUrl: '', value: { kind: 'oauth-token', secret: 'ACME_MAX_TOKEN' }, onChange: () => {} }))
    expect(html).toContain('Used from its first start.')
    expect(html).not.toContain('Applied at the next wake.')
    expect(html).toContain('value="ACME_MAX_TOKEN"')
    expect(html).not.toMatch(/type="password"/)
  })

  it('on an existing agent it still says the next wake', () => {
    const html = renderToStaticMarkup(createElement(AgentCredentialSection, { agentId: 'a1', baseUrl: '', value: null, onChange: () => {} }))
    expect(html).toContain('Applied at the next wake.')
  })
})
