/**
 * The whole words of a device message, for a pane notice that cut them (F098). The notice holds 400 characters,
 * most of them the untrusted-content wrapper; the message itself is in the agent's inbox, filed under the device.
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { deviceWords } from './transcript-records.mjs'

const found = new Map()

/** The same ref the notice carries (lib/notification-service.ts messageRef): the last 8 letters and digits of the id */
const refOf = (id) => String(id || '').replace(/[^a-zA-Z0-9]/g, '').slice(-8)

export function fullDeviceText(ref, root = path.join(os.homedir(), '.agent-messaging', 'agents')) {
  if (!ref) return null
  if (found.has(ref)) return found.get(ref)
  let text = null
  try {
    for (const agent of fs.readdirSync(root)) {
      const inbox = path.join(root, agent, 'messages', 'inbox')
      // Device senders only: a device's inbox folder starts with "Device" (fromAlias in lib/device-events.ts)
      for (const sender of fs.existsSync(inbox) ? fs.readdirSync(inbox) : []) {
        if (!sender.startsWith('Device')) continue
        const file = fs.readdirSync(path.join(inbox, sender)).find((f) => refOf(f.replace(/\.json$/, '')) === ref)
        if (!file) continue
        const message = JSON.parse(fs.readFileSync(path.join(inbox, sender, file), 'utf8'))?.payload?.message
        if (typeof message === 'string') text = deviceWords(message).text
      }
      if (text) break
    }
  } catch { /* unreadable inbox: the notice's words are shown */ }
  if (text) found.set(ref, text)
  if (found.size > 500) found.delete(found.keys().next().value)
  return text
}
