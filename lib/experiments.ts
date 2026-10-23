/**
 * Experiments: opt-in features switched on in Settings → Experiments. Each is a
 * browser-local flag (localStorage, like the rest of the UI preferences), so
 * turning one on changes only this browser, and a default install never shows it.
 */

export const EXPERIMENT_EVENT = 'aimaestro:experiments-changed'

/** The experiment ids and the localStorage key each one lives under */
export const EXPERIMENT_KEYS = {
  'world-view': 'aim-experiment-world-view',
} as const

export type ExperimentId = keyof typeof EXPERIMENT_KEYS

/** Read a flag; false when storage is unavailable (private window, blocked site data) */
export function readExperiment(id: ExperimentId): boolean {
  try {
    return localStorage.getItem(EXPERIMENT_KEYS[id]) === 'true'
  } catch {
    return false
  }
}
