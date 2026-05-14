/**
 * Meeting injection utilities — helpers shared by the meeting-chat route
 * and its tests.
 *
 * Cherry-picked from swickson/ai-maestro PR #76.
 */

/**
 * Strip avatar image paths from text before it enters an agent's context.
 *
 * Gemini CLI treats local-looking paths as files to read, burning tokens and
 * causing unnecessary I/O on every turn. We only target image-extension paths
 * in the shapes seen in the wild (../... relative paths, /mnt/agents/... absolute)
 * so legitimate file references in conversation are left intact.
 */
export function stripAvatarPaths(text: string): string {
  return text
    .replace(/(?:\.\.\/)+[\w .\-/]+?\.(?:png|jpg|jpeg|gif|webp|svg)/gi, '[avatar]')
    .replace(/\/mnt\/agents\/[\w .\-/]+?\.(?:png|jpg|jpeg|gif|webp|svg)/gi, '[avatar]')
}
