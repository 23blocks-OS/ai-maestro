/**
 * Argument placeholder rewriting — convert between {{argname}}, $ARGNAME, {{args}}.
 * Ported from crucible rewrite/args.js.
 *
 * Four syntax categories:
 * - MUSTACHE: {{argname}} (Claude Code, OpenCode)
 * - DOLLAR: $ARGNAME (Codex)
 * - COLLAPSED: {{args}} (Gemini) — lossy: individual names lost
 * - NONE: no arg syntax (Kiro) — leave body as-is
 */

import type { Provider, SkillIR, SkillArg } from '../types'
import { WarningCollector } from '../utils/warnings'
import { rewriteBody } from './body'

const MUSTACHE_PROVIDERS = new Set(['claude-code', 'opencode'])
const DOLLAR_PROVIDERS = new Set(['codex'])
const COLLAPSED_PROVIDERS = new Set(['gemini'])
const NO_ARG_PROVIDERS = new Set(['kiro'])

function replaceAll(text: string, search: string, replacement: string): string {
  if (!search) return text
  let result = text
  let idx = result.indexOf(search)
  while (idx !== -1) {
    result = result.slice(0, idx) + replacement + result.slice(idx + search.length)
    idx = result.indexOf(search, idx + replacement.length)
  }
  return result
}

function deduplicateCollapsedArgs(text: string): string {
  return text.replace(/(\{\{args\}\})(\s*\{\{args\}\})+/g, '{{args}}')
}

/** Rewrite arg placeholders in text from source to target syntax */
export function rewriteArgs(
  text: string, source: Provider, target: Provider,
  args: SkillArg[], warnings: WarningCollector
): string {
  if (source.id === target.id) return text
  if (!args || args.length === 0) return text
  if (NO_ARG_PROVIDERS.has(source.id)) return text
  if (NO_ARG_PROVIDERS.has(target.id)) return text

  let result = text

  // Mustache → Dollar
  if (MUSTACHE_PROVIDERS.has(source.id) && DOLLAR_PROVIDERS.has(target.id)) {
    for (const arg of args) {
      result = replaceAll(result, `{{${arg.name.toLowerCase()}}}`, `$${arg.name.toUpperCase()}`)
    }
    return result
  }

  // Dollar → Mustache
  if (DOLLAR_PROVIDERS.has(source.id) && MUSTACHE_PROVIDERS.has(target.id)) {
    for (const arg of args) {
      result = replaceAll(result, `$${arg.name.toUpperCase()}`, `{{${arg.name.toLowerCase()}}}`)
    }
    return result
  }

  // Any → Gemini: collapse to {{args}} (lossy)
  if (COLLAPSED_PROVIDERS.has(target.id)) {
    let collapsed = false
    if (MUSTACHE_PROVIDERS.has(source.id)) {
      for (const arg of args) {
        const pat = `{{${arg.name.toLowerCase()}}}`
        if (result.includes(pat)) { result = replaceAll(result, pat, '{{args}}'); collapsed = true }
      }
    } else if (DOLLAR_PROVIDERS.has(source.id)) {
      for (const arg of args) {
        const pat = `$${arg.name.toUpperCase()}`
        if (result.includes(pat)) { result = replaceAll(result, pat, '{{args}}'); collapsed = true }
      }
    }
    result = deduplicateCollapsedArgs(result)
    if (collapsed) warnings.add('Arg placeholders collapsed to {{args}} for Gemini (lossy — individual arg names lost)')
    return result
  }

  // Gemini → Any: can't recover individual names
  if (COLLAPSED_PROVIDERS.has(source.id)) {
    warnings.add('Cannot expand {{args}} to individual arg placeholders (names not recoverable from Gemini)')
    return result
  }

  return result
}

/** Apply body + args rewriting to all skills. Returns new array (no mutation). */
export function rewriteSkillBodies(
  skills: SkillIR[], source: Provider, target: Provider, warnings: WarningCollector
): SkillIR[] {
  return skills.map(skill => {
    const newBody = rewriteArgs(rewriteBody(skill.body, source, target), source, target, skill.args, warnings)
    const newRefs = skill.references.map(ref => ({
      ...ref,
      content: rewriteArgs(rewriteBody(ref.content, source, target), source, target, skill.args, warnings),
    }))
    return { ...skill, body: newBody, references: newRefs }
  })
}
