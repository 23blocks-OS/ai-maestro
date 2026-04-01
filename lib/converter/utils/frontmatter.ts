/**
 * YAML frontmatter parsing and stringifying.
 * Wraps gray-matter (already in deps) with conversion provenance injection.
 */

import matter from 'gray-matter'
import type { ConversionProvenance } from '../types'

export interface ParsedFrontmatter {
  data: Record<string, unknown>
  body: string
}

/** Parse YAML frontmatter + markdown body from a string */
export function parseFrontmatter(content: string): ParsedFrontmatter {
  const parsed = matter(content)
  return {
    data: parsed.data as Record<string, unknown>,
    body: parsed.content,
  }
}

/**
 * Stringify YAML frontmatter + markdown body into a complete document.
 * Optionally injects _converted provenance metadata.
 */
export function stringifyFrontmatter(
  data: Record<string, unknown>,
  body: string,
  provenance?: ConversionProvenance
): string {
  const fm = { ...data }

  // Inject conversion provenance if provided
  if (provenance) {
    fm._converted = {
      from: provenance.from,
      date: provenance.date,
      ...(provenance.warnings?.length ? { warnings: provenance.warnings } : {}),
    }
  }

  // gray-matter.stringify expects content as first arg, data as second
  return matter.stringify(body, fm)
}

/**
 * Extract a specific frontmatter field, returning undefined if not present.
 */
export function getFrontmatterField<T>(data: Record<string, unknown>, key: string): T | undefined {
  return data[key] as T | undefined
}

/**
 * Remove Claude-specific frontmatter fields that other clients don't understand.
 * Returns the cleaned data object (original is not mutated).
 */
export function stripClientSpecificFields(
  data: Record<string, unknown>,
  fieldsToStrip: string[]
): Record<string, unknown> {
  const cleaned = { ...data }
  for (const field of fieldsToStrip) {
    delete cleaned[field]
  }
  // Always remove _converted from source (will be re-injected on emit)
  delete cleaned._converted
  return cleaned
}
