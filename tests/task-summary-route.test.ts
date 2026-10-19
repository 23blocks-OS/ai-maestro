import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// A GET route that reads no request is prerendered by `next build` and then answers with the
// build-time data forever. The summary reads files that change, so it must stay dynamic.
describe('GET /api/tasks/summary', () => {
  it('is never prerendered', () => {
    const src = fs.readFileSync(path.join(__dirname, '../app/api/tasks/summary/route.ts'), 'utf8')
    expect(src).toMatch(/export const dynamic = 'force-dynamic'/)
  })
})
