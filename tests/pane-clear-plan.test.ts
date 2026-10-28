/**
 * B015: clearing a staged notice with backspaces must remove OUR text only.
 *
 * `clearInputKeys` presses backspace length + 16 times. With a person's text already in
 * the box and ours appended, that also ate up to 16 of their characters.
 */
import { describe, it, expect } from 'vitest'
import { clearInputPlan, clearInputKeys } from '@/lib/pane-readback.mjs'

const MSG = '[#3bk2096t] [MESSAGE] From: alice - deploy failed'

const box = (inside: string) => `
  Previous turn output.

╭──────────────────────────────────────╮
│ > ${inside}
╰──────────────────────────────────────╯
`

describe('clearInputPlan', () => {
  it('box held only our text: the old count, extra presses land on nothing', () => {
    const plan = clearInputPlan(box(MSG), MSG)
    expect(plan.preexisting).toBe(false)
    expect(plan.repeat).toBe(clearInputKeys([...MSG].length).repeat)
    expect(plan.key).toBe('BSpace')
  })

  it('a person had typed first: delete exactly our text, not 16 more characters', () => {
    const plan = clearInputPlan(box(`please also check the logs ${MSG}`), MSG)
    expect(plan.preexisting).toBe(true)
    expect(plan.repeat).toBe([...MSG].length)
  })

  it('counts characters as the TUI does, not UTF-16 units', () => {
    const msg = 'ping 🔔 now'
    const plan = clearInputPlan(box(`draft ${msg}`), msg)
    expect(plan.repeat).toBe([...msg].length)
    expect(plan.repeat).toBeLessThan(msg.length)
  })

  it('their text and a multi-line message: do not guess, do not clear', () => {
    const msg = 'line one\nline two'
    const plan = clearInputPlan(box(`draft line one line two`), msg)
    expect(plan.preexisting).toBe(true)
    expect(plan.repeat).toBe(0)
  })

  it('a message wrapped across lines inside the box still counts as ours alone', () => {
    const wrapped = `
╭──────────────────────────────────────╮
│ > [#3bk2096t] [MESSAGE] From: alice -  │
│   deploy failed                        │
╰──────────────────────────────────────╯
`
    const plan = clearInputPlan(wrapped, MSG)
    expect(plan.preexisting).toBe(false)
  })
})
