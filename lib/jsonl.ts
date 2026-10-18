import { createReadStream, openSync, readSync, closeSync } from 'node:fs'
import { StringDecoder } from 'node:string_decoder'

/** Nonblank lines, with the same offsets as split('\n').filter(trim), without
 * retaining the file. Streams/StringDecoder preserve UTF-8 across chunks. */
export async function* readJsonlLines(file: string): AsyncGenerator<string> {
  const input = createReadStream(file, { encoding: 'utf8', highWaterMark: 64 * 1024 })
  let fragments: string[] = []
  try {
    // Iterate the stream itself: awaiting an embedding batch pauses consumption
    // instead of allowing readline's event queue to retain future raw lines.
    for await (const chunk of input) {
      const text = chunk as string
      let start = 0
      let end: number
      while ((end = text.indexOf('\n', start)) !== -1) {
        fragments.push(text.slice(start, end))
        const line = fragments.join('').replace(/\r$/, '')
        fragments = []
        if (line.trim()) yield line
        start = end + 1
      }
      if (start < text.length) fragments.push(text.slice(start))
    }
    const last = fragments.join('').replace(/\r$/, '')
    if (last.trim()) yield last
  } finally { input.destroy() }
}

export async function summarizeJsonl(file: string, headSize = 50, tailSize = 20) {
  const head: string[] = []
  const tail: string[] = []
  let messageCount = 0
  for await (const line of readJsonlLines(file)) {
    messageCount++
    if (head.length < headSize) head.push(line)
    if (tailSize > 0) {
      tail.push(line)
      if (tail.length > tailSize) tail.shift()
    }
  }
  return { head, tail, messageCount }
}

// The discovery API is synchronous. Read only its bounded header and always
// close the descriptor, including when the caller stops iteration early.
export function readJsonlHeadSync(file: string, limit = 10): string[] {
  const fd = openSync(file, 'r')
  const decoder = new StringDecoder('utf8')
  const buffer = Buffer.alloc(64 * 1024)
  const lines: string[] = []
  let pending = ''
  try {
    while (lines.length < limit) {
      const size = readSync(fd, buffer, 0, buffer.length, null)
      pending += size ? decoder.write(buffer.subarray(0, size)) : decoder.end()
      let end: number
      while ((end = pending.indexOf('\n')) !== -1 && lines.length < limit) {
        const line = pending.slice(0, end).replace(/\r$/, '')
        pending = pending.slice(end + 1)
        if (line.trim()) lines.push(line)
      }
      if (!size) {
        if (pending.trim() && lines.length < limit) lines.push(pending)
        break
      }
    }
    return lines
  } finally { closeSync(fd) }
}
