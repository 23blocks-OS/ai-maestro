import os from 'node:os'

/**
 * Which address the server listens on. HOSTNAME overrides the default (0.0.0.0, every interface), as
 * documented: HOSTNAME=localhost keeps it to this machine.
 *
 * But Docker, Kubernetes and some shells put HOSTNAME=<this machine's own name> into the environment by
 * themselves. Binding to that name listens on one address only, so http://localhost:23000 never answered and
 * the installer reported "service did not start" on a clean container. The machine's own name is therefore
 * treated as "not set".
 */
export function resolveBindHost(env = process.env, machineName = os.hostname()) {
  const asked = (env.HOSTNAME || '').trim()
  if (!asked) return '0.0.0.0'
  if (asked === machineName || asked === String(machineName).split('.')[0]) return '0.0.0.0'
  return asked
}
