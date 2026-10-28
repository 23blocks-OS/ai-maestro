/**
 * AI Maestro message tools for Pi: amp_inbox, amp_read, amp_reply, amp_send.
 * Installed by scripts/install-pi.sh into <pi agent dir>/extensions/ai-maestro-amp/ (Pi docs/extensions.md).
 * The work is in core.mjs; this file only registers the tools with Pi.
 *
 * An extension runs with the same permissions as Pi itself. This one starts only the four AMP scripts.
 */
import { Type } from '@earendil-works/pi-ai'
import { defineTool } from '@earendil-works/pi-coding-agent'
import { TOOL_DEFS, runTool } from './core.mjs'

function schemaFor(def) {
  const props = {}
  for (const [key, p] of Object.entries(def.props)) {
    const opts = { description: p.description }
    const t = p.type === 'boolean' ? Type.Boolean(opts) : Type.String(opts)
    props[key] = def.required.includes(key) ? t : Type.Optional(t)
  }
  return Type.Object(props)
}

export default function (pi) {
  for (const def of TOOL_DEFS) {
    pi.registerTool(defineTool({
      name: def.name,
      label: def.label,
      description: def.description,
      parameters: schemaFor(def),
      async execute(_id, params, _signal, _onUpdate, ctx) {
        const result = await runTool(def.name, params, { cwd: (ctx && ctx.cwd) || process.cwd() })
        if (!result.ok) throw new Error(result.text) // a thrown error is a failed tool result in Pi
        return { content: [{ type: 'text', text: result.text }], details: undefined }
      },
    }))
  }
}
