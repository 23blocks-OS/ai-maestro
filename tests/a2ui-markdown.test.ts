import { describe, it, expect } from 'vitest'
import { renderCanvasMarkdown } from '@/lib/a2ui-markdown'

describe('canvas markdown (F114)', () => {
  it('renders headings, bold and code', async () => {
    const html = await renderCanvasMarkdown('## Acme release\n\n**Bold** and `code`')
    expect(html).toContain('<h2>Acme release</h2>')
    expect(html).toContain('<strong>Bold</strong>')
    expect(html).toContain('<code>code</code>')
  })

  it('draws no images, links or raw HTML', async () => {
    const html = await renderCanvasMarkdown('![x](https://evil.example/p.png) [go](javascript:alert(1)) <https://evil.example> <img src=x onerror=alert(1)>')
    expect(html).not.toMatch(/<img|<a\b|href=/)
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;') // shown as text, not markup
  })
})
