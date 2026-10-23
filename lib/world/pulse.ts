/** A message in flight between two islands (group keys): small enough for the page to import without the 3D code */
export interface WorldPulse {
  id: string
  from: string
  to: string
  /** Start, epoch ms */
  t0: number
}

/** How long an orb takes from one island to the other */
export const PULSE_MS = 1800
