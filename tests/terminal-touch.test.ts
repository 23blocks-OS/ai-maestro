import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import { isTouchOnTerminal } from '@/lib/terminal-touch'

// A stand-in for a DOM tree: an element "contains" the nodes listed for it.
const element = (inside: unknown[]) => ({ contains: (n: unknown) => inside.includes(n) })

describe('isTouchOnTerminal (#556: the chat would not scroll on a phone)', () => {
  const canvas = { name: 'xterm canvas' }
  const chatBubble = { name: 'chat message' }
  const toggle = { name: 'view toggle button' }

  it('is true for a touch that landed on something inside the terminal', () => {
    expect(isTouchOnTerminal(element([canvas]), canvas)).toBe(true)
  })

  it('is false for the chat drawn over the same box, which is what the old bounding-box check got wrong', () => {
    expect(isTouchOnTerminal(element([canvas]), chatBubble)).toBe(false)
  })

  it('is false for a button over the terminal, so the toggle does not start a terminal scroll', () => {
    expect(isTouchOnTerminal(element([canvas]), toggle)).toBe(false)
  })

  it('is false when there is no terminal yet or no target', () => {
    expect(isTouchOnTerminal(null, canvas)).toBe(false)
    expect(isTouchOnTerminal(undefined, canvas)).toBe(false)
    expect(isTouchOnTerminal(element([canvas]), null)).toBe(false)
  })
})

describe('the terminal touch handler', () => {
  const src = fs.readFileSync(path.resolve(__dirname, '..', 'components/TerminalView.tsx'), 'utf8')
  const start = src.indexOf('const handleTouchStart')
  const move = src.indexOf('const handleTouchMove')

  it('decides by the element the finger landed on', () => {
    expect(start).toBeGreaterThan(0)
    expect(src.slice(start, move)).toContain('isTouchOnTerminal(terminalElement, e.target)')
  })

  it('no longer compares the finger with the terminal\'s box (a hidden terminal keeps its box)', () => {
    expect(src.slice(start, move)).not.toContain('getBoundingClientRect')
  })

  it('still scrolls the terminal and cancels the page scroll only for its own touches', () => {
    const body = src.slice(move, src.indexOf('const handleTouchEnd'))
    expect(body).toMatch(/if \(!isTouchingTerminal\) return/)
    expect(body).toContain('terminal.scrollLines(linesToScroll)')
    expect(body).toContain('e.preventDefault()')
  })
})
