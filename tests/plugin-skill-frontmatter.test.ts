/**
 * Every skill the AI Maestro plugin ships must have frontmatter that a STRICT
 * YAML parser accepts, a name matching its directory, and a description that
 * says when to use the skill.
 *
 * Claude Code's own parser is lenient: on 2026-10-01 four skills shipped with
 * an unquoted ": " in their description, loaded fine, passed the trigger evals,
 * and were only caught by Claude Code's doctor in an agent's session. Strict
 * parsers (Agent Skills spec validators, other agent tools) reject the whole
 * frontmatter. This test is the strict parser.
 */

import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
import yaml from 'js-yaml'

const SKILLS = path.join(__dirname, '..', 'plugin', 'plugins', 'ai-maestro', 'skills')
const skills = fs.existsSync(SKILLS) ? fs.readdirSync(SKILLS).filter(d => fs.existsSync(path.join(SKILLS, d, 'SKILL.md'))) : []

describe('plugin skill frontmatter', () => {
  it('finds the shipped skills', () => {
    expect(skills.length).toBeGreaterThanOrEqual(8)
  })

  for (const dir of skills) {
    it(`${dir}: strict YAML, name matches, description says when to use it`, () => {
      const text = fs.readFileSync(path.join(SKILLS, dir, 'SKILL.md'), 'utf8')
      const m = text.match(/^---\n([\s\S]*?)\n---/)
      expect(m, 'frontmatter block').toBeTruthy()
      const fm = yaml.load(m![1], { schema: yaml.CORE_SCHEMA }) as Record<string, unknown>
      expect(fm.name).toBe(dir)
      expect(typeof fm.description).toBe('string')
      const d = fm.description as string
      expect(d.length).toBeGreaterThan(0)
      expect(d.length).toBeLessThanOrEqual(1024)
      expect(d).toMatch(/\buse\b/i)
    })
  }
})
