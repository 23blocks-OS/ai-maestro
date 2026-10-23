'use client'

import { useEffect, useState } from 'react'
import { EXPERIMENT_EVENT, EXPERIMENT_KEYS, readExperiment, type ExperimentId } from '@/lib/experiments'

/**
 * Whether an experiment is switched on in this browser. False on the server and on
 * the first client render (so hydration matches), then the stored value; follows a
 * toggle made in Settings in this tab (custom event) or in another tab (storage event).
 */
export function useExperiment(id: ExperimentId): { enabled: boolean; ready: boolean } {
  const [state, setState] = useState({ enabled: false, ready: false })

  useEffect(() => {
    const sync = () => setState({ enabled: readExperiment(id), ready: true })
    const onStorage = (e: StorageEvent) => { if (e.key === null || e.key === EXPERIMENT_KEYS[id]) sync() }
    sync()
    window.addEventListener(EXPERIMENT_EVENT, sync)
    window.addEventListener('storage', onStorage)
    return () => {
      window.removeEventListener(EXPERIMENT_EVENT, sync)
      window.removeEventListener('storage', onStorage)
    }
  }, [id])

  return state
}
