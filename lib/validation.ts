/**
 * Shared validation utilities for API route parameter validation.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/**
 * Validates that a string is a valid UUID v4 format.
 * Used for path parameter validation to prevent path traversal and invalid lookups.
 */
export function isValidUuid(id: string): boolean {
  return UUID_RE.test(id)
}
