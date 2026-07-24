/**
 * Safe front-matter parser.
 *
 * SECURITY (GHSA-g7qj-fhxp-6chc): gray-matter evaluates `---js` / `---javascript`
 * / `---coffee` / `---coffeescript` frontmatter blocks as EXECUTABLE code by
 * default. Parsing untrusted SKILL.md content (e.g. from a scanned/cloned git
 * repo, or an installed marketplace plugin) with plain `matter()` is therefore
 * a remote code execution vector.
 *
 * This wrapper overrides those engines so executable frontmatter is rejected
 * instead of run. Use `safeMatter()` for ANY frontmatter that could originate
 * from outside this codebase.
 */
import matter from 'gray-matter'

const reject = (kind: string) => () => {
  throw new Error(`${kind} frontmatter is not supported`)
}

const SAFE_ENGINES = {
  js: { parse: reject('JavaScript'), stringify: reject('JavaScript') },
  javascript: { parse: reject('JavaScript'), stringify: reject('JavaScript') },
  coffee: { parse: reject('CoffeeScript'), stringify: reject('CoffeeScript') },
  coffeescript: { parse: reject('CoffeeScript'), stringify: reject('CoffeeScript') },
} as const

export function safeMatter(content: string) {
  return matter(content, { engines: SAFE_ENGINES as any })
}

export default safeMatter
