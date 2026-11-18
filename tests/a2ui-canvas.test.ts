import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { MessageProcessor } from '@a2ui/web_core'
import { isA2uiFile, parseA2uiMessages, checkA2uiMessages, actionToInteraction, A2UI_MAX_COMPONENTS } from '@/lib/a2ui-canvas'
import { canvasCatalog } from '@/lib/a2ui-catalog'

const SAMPLE = fs.readFileSync(path.join(__dirname, '..', 'docs', 'examples', 'approvals.a2ui.json'), 'utf8')
const CAT = 'https://a2ui.org/specification/v1_0/catalogs/basic/catalog.json'
const page = (components: unknown[]) => [
  { version: '1.0', createSurface: { surfaceId: 's', catalogId: CAT } },
  { version: '1.0', updateComponents: { surfaceId: 's', components } },
]

describe('A2UI canvas pages (F114)', () => {
  it('knows its file names', () => {
    expect(isA2uiFile('approvals.a2ui.json')).toBe(true)
    expect(isA2uiFile('reports/live.a2ui.jsonl')).toBe(true)
    expect(isA2uiFile('report.html')).toBe(false)
    expect(isA2uiFile('interactions/2026-x.json')).toBe(false)
  })

  it('reads a list, a { messages } object and JSONL', () => {
    expect(parseA2uiMessages('[{"a":1},{"b":2}]')).toHaveLength(2)
    expect(parseA2uiMessages('{"messages":[{"a":1}]}')).toHaveLength(1)
    expect(parseA2uiMessages('{"a":1}\n\n{"b":2}\n', 'x.a2ui.jsonl')).toHaveLength(2)
    expect(() => parseA2uiMessages('')).toThrow(/empty/)
    expect(() => parseA2uiMessages('{"a":1}\nnope', 'x.a2ui.jsonl')).toThrow(/Line 2/)
  })

  it('the sample page passes the check and the real processor', () => {
    const messages = parseA2uiMessages(SAMPLE)
    expect(checkA2uiMessages(messages)).toEqual([])
    const p = new MessageProcessor([canvasCatalog])
    p.processMessages(messages as never)
    expect(p.getSurface('approvals')).toBeTruthy()
  })

  it('blocks components that load outside URLs', () => {
    const problems = checkA2uiMessages(page([{ id: 'root', component: 'Image', url: 'https://evil.example/x.png' }]))
    expect(problems.join()).toMatch(/"Image" is not available/)
    // the processor only skips an unknown type when it draws, so this check is the guard; the catalog has none of them
    for (const c of ['Image', 'Video', 'AudioPlayer']) expect(canvasCatalog.components.has(c)).toBe(false)
    expect(canvasCatalog.components.has('Button')).toBe(true)
  })

  it('blocks openUrl, in any place a function call can sit', () => {
    const btn = {
      id: 'root', component: 'Button', child: 't',
      action: { functionCall: { '@call': 'openUrl', args: { url: 'https://evil.example' } } },
    }
    expect(checkA2uiMessages(page([btn, { id: 't', component: 'Text', text: 'Go' }])).join()).toMatch(/"openUrl" is not allowed/)
    expect(canvasCatalog.functions.has('openUrl')).toBe(false)
    expect(canvasCatalog.functions.has('formatDate')).toBe(true)
  })

  it('limits the size of a page', () => {
    const many = Array.from({ length: A2UI_MAX_COMPONENTS + 1 }, (_, i) => ({ id: `t${i}`, component: 'Text', text: 'x' }))
    expect(checkA2uiMessages(page(many)).join()).toMatch(/Too many components/)
  })

  it('an action becomes the same interaction record as maestro.send', () => {
    expect(actionToInteraction('approvals.a2ui.json', {
      name: 'approve', sourceComponentId: 'ok_2', surfaceId: 'approvals', context: { id: 'dep-77' },
    })).toEqual({ canvasFile: 'approvals.a2ui.json', action: 'approve', element: 'ok_2', data: { id: 'dep-77' } })
    expect(actionToInteraction('a.a2ui.json', { name: 'refresh', context: {} }))
      .toEqual({ canvasFile: 'a.a2ui.json', action: 'refresh', element: undefined, data: undefined })
  })
})
