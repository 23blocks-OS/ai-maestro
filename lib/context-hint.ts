/**
 * When to recommend /compact, from the context size in tokens.
 *
 * The same rule the terminal status line applies (plugin/plugins/ai-maestro/
 * scripts/amp-statusline.sh keeps its own copy, because the script runs on
 * the agent's host with no access to this module). If you change a number here
 * change it there, and the other way round:
 *
 *   >= 200,000 tokens  'now'   every token above 200k is billed at the
 *                              long-context rate (2x), so compact now
 *   >= 150,000 tokens  'soon'  a margin before that price step
 *
 * The status line lets the user move the "soon" line with AMP_STATUSLINE_COMPACT_AT;
 * the server has no per-user setting, so it uses the default.
 */

export const COMPACT_SOON_TOKENS = 150_000
export const COMPACT_NOW_TOKENS = 200_000

export type CompactHint = 'none' | 'soon' | 'now'

export function compactHint(contextTokens: number, soonAt: number = COMPACT_SOON_TOKENS): CompactHint {
  if (!Number.isFinite(contextTokens) || contextTokens <= 0) return 'none'
  if (contextTokens >= COMPACT_NOW_TOKENS) return 'now'
  if (contextTokens >= soonAt) return 'soon'
  return 'none'
}
