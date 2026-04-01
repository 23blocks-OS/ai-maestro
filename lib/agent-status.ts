import type { SessionActivityStatus } from '@/hooks/useSessionActivity'

/**
 * Resolve the visual status indicator for an agent.
 *
 * Uses a 5-state priority model (matching CLAUDE.md "Session Control Architecture"):
 *   1. Exited (gray, no pulse) — programRunning === false
 *   2. Permission (orange, pulse) — permission_prompt
 *   3. Waiting (amber, pulse) — idle_prompt or 'waiting' activity
 *   4. Active (green, pulse) — terminal actively producing output
 *   5. Idle (green, no pulse) — online but no specific signal yet
 *
 * Shared by AgentBadge (sidebar) and TaskKanbanBoard (kanban card avatars)
 * to avoid duplicated priority logic.
 */
export function resolveAgentStatus(
  isOnline: boolean,
  isHibernated: boolean,
  activityStatus?: SessionActivityStatus,
  notificationType?: string,
  programRunning?: boolean,
): { color: string; ringColor: string; label: string; pulse: boolean } {

  if (isOnline) {
    // Priority 1: Program exited — tmux session alive but the AI program stopped.
    if (programRunning === false) {
      return { color: 'bg-gray-400', ringColor: 'ring-gray-400/30', label: 'Exited', pulse: false }
    }
    // Priority 2: Permission prompt — Claude is blocked asking for tool approval.
    if (notificationType === 'permission_prompt') {
      return { color: 'bg-orange-500', ringColor: 'ring-orange-500/30', label: 'Permission', pulse: true }
    }
    // Priority 3: Waiting — Claude finished and shows its input prompt (safe state).
    if (notificationType === 'idle_prompt' || activityStatus === 'waiting') {
      return { color: 'bg-amber-500', ringColor: 'ring-amber-500/30', label: 'Waiting', pulse: true }
    }
    // Priority 4: Active — Claude is currently processing.
    if (activityStatus === 'active') {
      return { color: 'bg-green-500', ringColor: 'ring-green-500/30', label: 'Active', pulse: true }
    }
    // Priority 5: Idle — online but no specific activity signal yet.
    return { color: 'bg-green-500', ringColor: 'ring-green-500/30', label: 'Idle', pulse: false }
  }

  if (isHibernated) {
    return { color: 'bg-slate-500', ringColor: 'ring-slate-500/30', label: 'Hibernated', pulse: false }
  }

  return { color: 'bg-gray-500', ringColor: 'ring-gray-500/30', label: 'Offline', pulse: false }
}
