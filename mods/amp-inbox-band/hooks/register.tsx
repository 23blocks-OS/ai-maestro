import { atom, read, update } from 'claude-code'
import type { EngineInterface as Engine, Register } from 'claude-code'

const unread = atom({ plugin: 'amp-inbox-band', key: 'unread' } as const, 0)
const isHidden = atom({ plugin: 'amp-inbox-band', key: 'isHidden' } as const, false)

const POLL_MS = 20_000
const WAKE_COOLDOWN_MS = 5 * 60_000
const WAKE_PROMPT =
  'You have unread AMP messages. Read your inbox with the agent-messaging skill and handle them.'

let lastSeen = 0
let lastWakeAt = 0
let isBusy = false
let isWakePending = false

async function countUnread($: Engine): Promise<number | null> {
  const home = await $.env.get('HOME')
  const r = await $.process.run([`${home ?? ''}/.local/bin/amp-inbox.sh`, '--count'], {
    timeoutMs: 10_000,
  })
  if (r.exitCode !== 0) return null
  const n = parseInt(r.stdout.trim().split('\n').pop() ?? '', 10)
  return Number.isFinite(n) ? n : null
}

async function wake($: Engine) {
  const now = await $.clock.now()
  if (now - lastWakeAt <= WAKE_COOLDOWN_MS) return
  lastWakeAt = now
  $.prompt.submit({ text: WAKE_PROMPT }).catch(() => undefined)
}

async function poll($: Engine, autoWake: boolean) {
  const n = await countUnread($)
  if (n === null) return
  await update($, unread, () => n)
  $.ui.status(n > 0 ? `✉ ${n} unread` : undefined)
  if (n > lastSeen) {
    await update($, isHidden, () => false)
    $.ui.toast(`${n} unread AMP message${n === 1 ? '' : 's'}`)
    if (autoWake) {
      // A prompt submitted mid-turn is delivered later, when the message may
      // already be read. Wait for the turn to end and count again.
      if (isBusy) isWakePending = true
      else await wake($)
    }
  }
  lastSeen = n
}

export const register: Register = (on, options) => {
  on('turn.start', async ($, e, next) => {
    isBusy = true
    return next(e)
  })

  on('turn.complete', async ($, e, next) => {
    isBusy = false
    if (isWakePending) {
      isWakePending = false
      const n = await countUnread($)
      if (n !== null && n > 0) await wake($)
    }
    return next(e)
  })

  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'amp-inbox',
      description: 'Show unread AMP messages without a model turn',
    })
    await poll($, options.autoWake === true)
    $.clock.every(POLL_MS, () => poll($, options.autoWake === true))
    return next(e)
  })

  on('command.run', { command: 'amp-inbox' }, async $ => {
    const home = await $.env.get('HOME')
    const r = await $.process.run([`${home ?? ''}/.local/bin/amp-inbox.sh`], { timeoutMs: 10_000 })
    return { text: r.stdout.trim() || r.stderr.trim() || 'No output from amp-inbox.sh' }
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    const n = await read($, unread)
    if (e.props.hasSurvey || n === 0 || (await read($, isHidden))) return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    return (
      <Box>
        <Text>✉ {n} unread AMP message{n === 1 ? '' : 's'} </Text>
        <Button
          key="read"
          label="Read"
          variant="primary"
          onPress={() => $.prompt.submit({ text: WAKE_PROMPT })}
        />
        <Button key="hide" label="Hide" onPress={() => update($, isHidden, () => true)} />
      </Box>
    )
  })
}
