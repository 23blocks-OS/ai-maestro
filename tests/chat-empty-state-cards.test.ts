import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'

const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8')

// The empty state is h-full, so a card drawn after it (a secret request, an SQL write approval) sat below the fold of
// a chat with no messages yet and could not be seen without scrolling.
describe('the empty chat state yields to a waiting card', () => {
  it('desktop chat hides the empty state while a secret or SQL write request is waiting', () => {
    expect(read('components/ChatView.tsx')).toMatch(/messages\.length === 0 && !error && secretRequests\.length === 0 && sqlWriteRequests\.length === 0/)
  })
  it('phone chat does the same', () => {
    expect(read('components/MobileChatView.tsx')).toMatch(/messages\.length === 0 && !error && secretRequests\.length === 0 && sqlWriteRequests\.length === 0/)
  })
})
