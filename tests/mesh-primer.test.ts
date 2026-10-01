import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

// MESH_PRIMER is typed into an agent's pane on every prompt-type wake hook. A
// command it names that does not exist costs the agent a tool call on
// "command not found" every time: it used to point at `amp-primer`, which no
// script provides. Read the source rather than importing the service, which
// pulls in the whole runtime.
const ROOT = process.cwd()
const source = fs.readFileSync(path.join(ROOT, 'services/agents-core-service.ts'), 'utf8')
const block = source.slice(source.indexOf('export const MESH_PRIMER'), source.indexOf("].join(' ')", source.indexOf('export const MESH_PRIMER')))
const SCRIPTS = path.join(ROOT, 'plugin/plugins/ai-maestro/scripts')

describe('MESH_PRIMER', () => {
  it('is found in the service source', () => {
    expect(block).toContain('agent mesh')
  })

  it('names only amp commands the plugin ships', () => {
    const named = [...new Set(block.match(/\bamp-[a-z]+/g) || [])]
    expect(named.length).toBeGreaterThan(0)
    for (const cmd of named) {
      expect(fs.existsSync(path.join(SCRIPTS, `${cmd}.sh`)), `${cmd}.sh`).toBe(true)
    }
  })
})
