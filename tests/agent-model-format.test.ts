import { describe, it, expect } from 'vitest'
import { execFileSync } from 'child_process'
import fs from 'fs'
import path from 'path'

// aimaestro-agent.sh checks --model with a bash regex; run the real one from the built script.
const script = fs.readFileSync(path.join(__dirname, '../plugin/plugins/ai-maestro/scripts/agent-commands.sh'), 'utf8')
const pattern = script.match(/\[\[ ! "\$model" =~ (\^.+\$) \]\]; then/)?.[1]

function accepts(model: string): boolean {
  try {
    execFileSync('bash', ['-c', '[[ "$1" =~ ' + pattern + ' ]]', '_', model])
    return true
  } catch {
    return false
  }
}

describe('aimaestro-agent.sh model format', () => {
  it('finds the pattern in the built script', () => {
    expect(pattern).toBeTruthy()
  })
  it.each(['sonnet', 'fable', 'claude-fable-5-1', 'claude-opus-5-5', 'claude-sonnet-4-5-20250929'])('accepts %s', m => {
    expect(accepts(m)).toBe(true)
  })
  it.each(['x;rm', 'claude-Fable', '$(id)', 'a b', ''])('rejects %j', m => {
    expect(accepts(m)).toBe(false)
  })
})
