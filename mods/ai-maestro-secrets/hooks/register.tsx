import { atom, read, update } from 'claude-code'
import type { Register } from 'claude-code'

// F033 trial mod. The agent asks for a secret by name; the person types the value into a form
// here; it is stored with `aim-secret set NAME --stdin`. The value stays inside this mod and the
// vault. The model learns only "stored" or "declined".
//
// A tool.call hook is cut off after 10 seconds, so the tool answers at once ("waiting for the
// user") and the mod wakes the agent with a prompt once the person has answered.

const NAME_RE = /^[A-Z][A-Z0-9_]{0,63}$/
const TOOL = 'mcp__ai-maestro-secrets__request_secret'
const PANE = 'secret-entry'
const PANE_ARGS = { id: PANE, focus: true, closeOnEscape: true, rows: 10 } as const

// `asked` is what the agent requested; `name` is what the Name field holds (the person may correct it)
type Pending = { asked: string; name: string }
let pending: Pending | null = null

// what the band above the prompt shows; changing it redraws the band
const waiting = atom({ plugin: 'ai-maestro-secrets', key: 'waiting' } as const, null)

// Text colours that read on the pane Claude Code draws for each theme: its dark panel is near-black,
// its light panel is near-white. The input fields keep the terminal's default text colour, which only
// matches when Claude's theme matches the terminal (dark with dark, light with light).
const FG_DARK_THEME = '#ffffff'
const FG_LIGHT_THEME = '#1a1a1a'

const ok = (text: string) => ({ result: text, text })
const fail = (text: string) => ({ isError: true as const, result: text, text })
const USE = (name: string) => `Use it with: aim-secret exec --use ${name} -- <command>. Never print or ask for its value.`

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.tool.register({
      name: 'request_secret',
      description:
        'Ask the user to store a credential (API key, password, token) in their local vault. ' +
        'Use this INSTEAD of asking them to paste a secret in the chat. The value never reaches you. ' +
        'The call returns at once; the user is shown a form, and you are sent a message when it is stored ' +
        'or declined. End your turn after calling it. Then run commands with ' +
        '`aim-secret exec --use NAME -- <command>`.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Upper-case env-style name, for example OPENAI_API_KEY' },
        },
        required: ['name'],
      },
    })
    await $.command.register({
      name: 'secret',
      description: 'Open the form an agent is waiting on to store a secret',
    })
    return next(e)
  })

  on('command.run', { command: 'secret' }, async $ => {
    if (!pending) return { text: 'No agent is waiting for a secret.' }
    await $.ui.open({ ...PANE_ARGS, title: `Store ${pending.asked}` })
    return { text: 'Secret form opened.' }
  })

  on('tool.call', { tool: TOOL }, async ($, e) => {
    const name = String((e as unknown as { name?: unknown }).name ?? '')
    if (!NAME_RE.test(name)) {
      return fail(`Invalid name "${name.slice(0, 40)}". Use upper-case letters, digits and underscores, for example OPENAI_API_KEY.`)
    }
    let has
    try {
      has = await $.process.run(['aim-secret', 'has', name], { timeoutMs: 5000 })
    } catch {
      return fail('aim-secret is not installed on this machine. Ask the user to install AI Maestro (it provides aim-secret).')
    }
    if (has.exitCode === 0) return ok(`${name} is already stored. ${USE(name)}`)
    if (pending) return fail('Another secret request is already open. Wait for the user to finish it.')

    pending = { asked: name, name }
    await update($, waiting, () => name)
    void $.ui.open({ ...PANE_ARGS, title: `Store ${name}` })   // seats by itself only in a wide window; the band always shows
    return ok(`Asked the user to store ${name}; a form is on their screen. End your turn now. You will get a message when it is stored or declined. Do not ask for the value.`)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const name = await read($, waiting)
    if (name === null) return next(e)
    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text bold>An agent is asking you to store {name}. It goes to your local vault, not to the chat.{' '}</Text>
        <Button
          key="open-secret-form"
          label="Enter it"
          onPress={() => {
            void $.ui.open({ ...PANE_ARGS, title: `Store ${name}` })
          }}
        />
        <Text> </Text>
        <Button
          key="decline-secret"
          label="No thanks"
          onPress={async () => {
            pending = null
            await update($, waiting, () => null)
            await $.ui.close({ id: PANE })
            await $.prompt.submit({ text: `The user declined to store ${name}. Continue without it, and do not ask again unless you cannot go on.` })
          }}
        />
      </Box>
    )
  })

  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const ui = $.ui.resolve(e)
    if (!('Input' in ui)) return <ui.Text>This screen cannot take typed input. Use Claude Code in a terminal.</ui.Text>
    const { Box, Text, Input } = ui
    if (!pending) return <Text>No secret requested.</Text>
    const asked = pending.asked
    const themeRow = (await $.config.list()).find(row => row.key === 'theme')
    const isLight = /light/i.test(String(themeRow?.value ?? ''))
    const FORM_FG = isLight ? FG_LIGHT_THEME : FG_DARK_THEME
    const mismatchNote = isLight ? null : 'If this is hard to read, run /theme and pick a Light theme.'
    return (
      <Box flexDirection="column" paddingX={1}>
        <Text bold color={FORM_FG}>Store a secret in your local vault</Text>
        <Text color={FORM_FG}>An agent asked for this. The value goes to the vault, not to the chat or the model.</Text>
        <Text color={FORM_FG}> </Text>
        <Input
          key="secret-name"
          label="Name:  "
          submitLabel=" "
          value={pending.name}
          onInput={(v: string) => {
            if (pending) pending.name = v.trim()
          }}
          onSubmit={() => {}}
        />
        <Input
          key="secret-value"
          label="Value: "
          submitLabel=" "
          autoFocus
          onSubmit={async (value: string) => {
            const p = pending
            if (!p || value.length === 0) return
            if (!NAME_RE.test(p.name)) {
              $.ui.toast('The name must be upper case with underscores, like OPENAI_API_KEY')
              return
            }
            let result
            try {
              result = await $.process.run(['aim-secret', 'set', p.name, '--stdin'], { stdin: value, timeoutMs: 20000 })
            } catch {
              $.ui.toast('aim-secret did not run. Is it installed?')
              return
            }
            if (result.exitCode !== 0) {
              $.ui.toast(`Could not store it: ${result.stderr.trim().split('\n')[0].slice(0, 120)}`)
              return
            }
            const stored = p.name
            pending = null
            await update($, waiting, () => null)
            await $.ui.close({ id: PANE })
            const renamed = stored !== asked ? ` (the agent asked for ${asked}; the user chose ${stored}, so use ${stored})` : ''
            await $.prompt.submit({ text: `The user stored ${stored} in the vault${renamed}. Continue your task. ${USE(stored)}` })
          }}
        />
        <Text color={FORM_FG}> </Text>
        <Text color={FORM_FG}>Tab switches field. Enter stores it. Esc closes (the band above the prompt stays).</Text>
        <Text bold color={FORM_FG}>Note: this field shows what you type.</Text>
        {mismatchNote !== null && <Text color={FORM_FG}>{mismatchNote}</Text>}
      </Box>
    )
  })
}
