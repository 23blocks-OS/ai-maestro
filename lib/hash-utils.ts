/**
 * Shared DJB2 hash utilities
 *
 * Single source of truth for the hash algorithm used across:
 * - Avatar URL generation
 * - Gender determination
 * - Category color assignment
 * - Stagger offset calculation
 */

/**
 * Compute a DJB2-style hash from a string.
 * Returns a 32-bit integer (may be negative).
 */
export function computeHash(str: string): number {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i)
    hash = ((hash << 5) - hash) + char
    hash = hash & hash // Convert to 32-bit integer
  }
  return hash
}

/**
 * Determine gender from an ID string (for avatar/alias matching).
 */
export function getGenderFromHash(hash: number): 'male' | 'female' {
  return (Math.abs(hash >> 8) % 2 === 0) ? 'male' : 'female'
}

/**
 * Generate a consistent avatar URL from an agent ID or name.
 * Uses local avatar files: /avatars/{gender}_{index}.png
 */
export function getAvatarUrl(id: string): string {
  const hash = computeHash(id)
  const index = Math.abs(hash) % 100
  const gender = getGenderFromHash(hash) === 'male' ? 'men' : 'women'
  return `/avatars/${gender}_${index.toString().padStart(2, '0')}.png`
}
