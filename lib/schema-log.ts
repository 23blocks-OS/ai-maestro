/**
 * Per-table "already exists" schema lines are noise on every open; they print
 * only with AIM_DEBUG_SCHEMA=1. Real creations and one summary line per
 * initialisation stay on the normal log.
 */
export function schemaDebug(...args: unknown[]): void {
  if (process.env.AIM_DEBUG_SCHEMA === '1') console.log(...args)
}
