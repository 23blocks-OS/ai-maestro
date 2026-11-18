import { describe, it, expect } from 'vitest'
import fs from 'fs'
import os from 'os'
import path from 'path'
import { probeCapabilities } from '@/lib/host-capabilities'

const home = fs.mkdtempSync(path.join(os.tmpdir(), 'caps-'))
const deps = (keys: string[], o: any = {}) => ({
  hasSecret: async (n: string) => keys.includes(n),
  localVoiceReady: () => false, claudeInstalled: () => true, diskFreeGB: () => 120,
  overrides: () => ({}), home, ...o,
})

describe('what a host can run (F109)', () => {
  it('meetings need the LiveKit and transcription keys, and says which are missing', async () => {
    const none = await probeCapabilities(deps([]))
    expect(none.capabilities.meetings).toMatchObject({ can: false })
    expect(none.capabilities.meetings.why).toContain('LIVEKIT_URL')
    expect(none.capabilities.publicMeetings.can).toBe(false)
    const all = await probeCapabilities(deps(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'ASSEMBLYAI_API_KEY', 'MEETING_CODE']))
    expect(all.capabilities.meetings.can).toBe(true)
    expect(all.capabilities.publicMeetings.can).toBe(true)
  })

  it('a face needs the key and a face on record; voice needs a key or local models; speaking side needs Claude Code', async () => {
    const c1 = await probeCapabilities(deps(['ANAM_API_KEY']))
    expect(c1.capabilities.lipSyncFace.why).toContain('no agent face on record')
    fs.mkdirSync(path.join(home, '.aimaestro', 'meetings'), { recursive: true })
    fs.writeFileSync(path.join(home, '.aimaestro', 'meetings', 'avatars.json'), JSON.stringify({ a1: { provider: 'anam', avatarId: 'x' } }))
    expect((await probeCapabilities(deps(['ANAM_API_KEY']))).capabilities.lipSyncFace.can).toBe(true)
    expect(c1.capabilities.agentVoice.can).toBe(false)
    expect((await probeCapabilities(deps([], { localVoiceReady: () => true }))).capabilities.agentVoice.why).toBe('local voice models')
    expect((await probeCapabilities(deps([], { claudeInstalled: () => false }))).capabilities.speakingSide.can).toBe(false)
  })

  it('heavy work needs memory and disk; the operator decides last', async () => {
    const low = await probeCapabilities(deps([], { diskFreeGB: () => 3 }))
    if (low.facts.memoryGB >= 8) expect(low.capabilities.heavyWork).toMatchObject({ can: false, why: '3 GB free on disk (10 GB or more needed)' })
    const off = await probeCapabilities(deps(['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'ASSEMBLYAI_API_KEY'], { overrides: () => ({ meetings: { can: false, why: 'meetings run only on the office computer' }, heavyWork: true, unknown: true }) }))
    expect(off.capabilities.meetings).toEqual({ can: false, why: 'meetings run only on the office computer', byOperator: true })
    expect(off.capabilities.heavyWork).toEqual({ can: true, why: 'allowed by the operator', byOperator: true })
    expect('unknown' in off.capabilities).toBe(false)
  })
})
