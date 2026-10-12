/**
 * The body of POST /api/agents/:id/wake, built in ONE place for every screen that wakes an agent.
 *
 * The old handlers each copied this and dropped the permission mode when it was "supervised". The server
 * falls back to the agent's STORED mode when none is sent, so choosing "Supervised" for an agent stored
 * as Full autonomy silently started it with no questions asked (F040). The mode is now always sent when
 * the screen has one.
 */
import { ALL_PERMISSION_MODES } from '@/lib/program-choices'

export interface WakeChoiceOptions {
  permissionMode?: string
  execMode?: 'terminal' | 'streaming'
  /** Save the program and mode on the agent, so the next wake needs no choice. */
  remember?: boolean
}

export function buildWakeBody(
  program: string | undefined,
  options: WakeChoiceOptions | undefined,
  hostUrl?: string,
): Record<string, unknown> {
  const body: Record<string, unknown> = {}
  if (program && program.trim()) body.program = program
  if (hostUrl) body.hostUrl = hostUrl
  if (options?.permissionMode && (ALL_PERMISSION_MODES as string[]).includes(options.permissionMode)) {
    body.permissionMode = options.permissionMode
  }
  if (options?.remember === true) body.remember = true
  return body
}
