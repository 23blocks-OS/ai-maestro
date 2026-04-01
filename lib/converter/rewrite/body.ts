/**
 * Body text rewriting — replace provider-specific terms.
 * Ported from crucible rewrite/body.js.
 *
 * Replaces: model name (word-boundary), config file (literal), ask instruction (literal).
 */

import type { Provider } from '../types'

/** Escape special regex characters */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Replace all occurrences of a literal substring */
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

/**
 * Rewrite body text, replacing source provider terms with target provider terms.
 */
export function rewriteBody(text: string, source: Provider, target: Provider): string {
  if (source.id === target.id) return text
  let result = text

  // Model name: word-boundary regex to minimize false positives
  if (source.modelName !== target.modelName) {
    const pattern = new RegExp(`\\b${escapeRegex(source.modelName)}\\b`, 'g')
    result = result.replace(pattern, target.modelName)
  }

  // Config file: literal replace
  if (source.configFile !== target.configFile) {
    result = replaceAll(result, source.configFile, target.configFile)
  }

  // Ask instruction: literal replace
  if (source.askInstruction !== target.askInstruction) {
    result = replaceAll(result, source.askInstruction, target.askInstruction)
  }

  return result
}
