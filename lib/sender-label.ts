/**
 * How a sender is named to an agent.
 *
 * Every notice used to build the sender as `<name>@<host id>`, for example
 * `ai-maestro@juans-macbook-pro`. That reads like an AMP address and is not one:
 * the host id is AI Maestro's own label for a machine, while the sender's
 * address, the one the message is signed under, is
 * `ai-maestro@rnd23blocks.aimaestro.local`. An agent comparing the pane notice
 * with the envelope (as pas-lola did on 2026-10-02) saw two different senders
 * and had good reason to wonder which one was real. The wrapper's own
 * `sender="…"` attribute had the same flaw.
 *
 * When the envelope carries an address, show that. When it does not, fall back
 * to the old label so nothing that worked stops working.
 *
 * The address ends up inside an XML attribute and typed into a tmux pane, so it
 * is accepted only in a narrow alphabet: no quotes, no angle brackets, no
 * whitespace, no control characters. Anything else is treated as absent.
 */

const ADDRESS_RE = /^[A-Za-z0-9._-]{1,128}@[A-Za-z0-9._:-]{1,255}$/

/** The envelope's `from` as a displayable AMP address, or undefined. */
export function senderAddressOf(from: unknown): string | undefined {
  if (typeof from !== 'string') return undefined
  const trimmed = from.trim()
  return ADDRESS_RE.test(trimmed) ? trimmed : undefined
}

/** `address` when there is one, otherwise the legacy `name@host` (or bare name). */
export function senderLabel(parts: { address?: string; name: string; host?: string }): string {
  if (parts.address) return parts.address
  return parts.host && parts.host !== 'local' ? `${parts.name}@${parts.host}` : parts.name
}
