/**
 * What this host can run (F109). Every host runs the same code; not every host has the resources, keys or
 * connectivity for every feature. A probe (cached a minute) reads the host's facts and which vault keys exist (names
 * only, never values), and turns them into capabilities, each with a plain reason. The operator can override any of
 * them in ~/.aimaestro/host-capabilities.json: { "meetings": false } or { "meetings": { "can": false, "why": "..." } }.
 * Shared over /mesh as the page feed `capabilities` (services/mesh-feeds-service.ts).
 */
import fs from 'fs'
import os from 'os'
import path from 'path'
import { localSpeechReady } from '@/lib/speech-local.mjs'

export interface Capability { can: boolean; why: string; byOperator?: boolean }
export interface HostCapabilities {
  at: number
  facts: { platform: string; arch: string; cpus: number; memoryGB: number; freeMemoryGB: number; diskFreeGB: number | null; uptimeHours: number; node: string }
  capabilities: Record<string, Capability>
}

/** What a capability needs, and what it is for (shown in Settings) */
export const CAPABILITY_LABELS: Record<string, string> = {
  meetings: 'Host meetings (room, transcription, agents in the room)',
  publicMeetings: 'Public meeting page for guests',
  lipSyncFace: "An agent's lip-synced face in meetings",
  agentVoice: 'Agent voice (speech and hearing)',
  localVoice: 'Local voice models (no cloud)',
  speakingSide: "Agents' speaking side (Claude Code installed)",
  heavyWork: 'Heavy work (indexing, many agents)',
}

export interface ProbeDeps {
  hasSecret: (name: string) => Promise<boolean>
  localVoiceReady: () => boolean
  claudeInstalled: () => boolean
  diskFreeGB: () => number | null
  overrides: () => Record<string, boolean | { can: boolean; why?: string }>
  home?: string
}

const gb = (bytes: number) => Math.round((bytes / 1024 ** 3) * 10) / 10

function missing(have: Record<string, boolean>, names: string[]): string[] {
  return names.filter(n => !have[n])
}

/** The probe itself: pure given its deps, so it is testable */
export async function probeCapabilities(deps: ProbeDeps): Promise<HostCapabilities> {
  const keys = ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'ASSEMBLYAI_API_KEY', 'MEETING_CODE', 'ANAM_API_KEY', 'ELEVENLABS_API_KEY']
  const have: Record<string, boolean> = {}
  await Promise.all(keys.map(async k => { have[k] = await deps.hasSecret(k).catch(() => false) }))
  const facts = {
    platform: os.platform(), arch: os.arch(), cpus: os.cpus().length,
    memoryGB: gb(os.totalmem()), freeMemoryGB: gb(os.freemem()), diskFreeGB: deps.diskFreeGB(),
    uptimeHours: Math.round(os.uptime() / 3600), node: process.version,
  }
  const home = deps.home || os.homedir()
  const localVoice = deps.localVoiceReady()
  const claude = deps.claudeInstalled()
  const meetingKeys = missing(have, ['LIVEKIT_URL', 'LIVEKIT_API_KEY', 'LIVEKIT_API_SECRET', 'ASSEMBLYAI_API_KEY'])
  let faces = false
  try { faces = Object.keys(JSON.parse(fs.readFileSync(path.join(home, '.aimaestro', 'meetings', 'avatars.json'), 'utf8'))).length > 0 } catch { /* none */ }

  const capabilities: Record<string, Capability> = {
    meetings: meetingKeys.length ? { can: false, why: `missing in the vault: ${meetingKeys.join(', ')}` } : { can: true, why: 'LiveKit and transcription keys are set' },
    publicMeetings: !have.MEETING_CODE ? { can: false, why: 'no MEETING_CODE in the vault' } : meetingKeys.length ? { can: false, why: 'this host cannot host meetings' } : { can: true, why: 'meeting code set; the public page runs' },
    lipSyncFace: !have.ANAM_API_KEY ? { can: false, why: 'no ANAM_API_KEY in the vault' } : !faces ? { can: false, why: 'no agent face on record here (meetings/avatars.json)' } : { can: true, why: 'Anam key and an agent face on record' },
    agentVoice: have.ELEVENLABS_API_KEY ? { can: true, why: 'ElevenLabs key is set' } : localVoice ? { can: true, why: 'local voice models' } : { can: false, why: 'no ELEVENLABS_API_KEY and no local voice models' },
    localVoice: localVoice ? { can: true, why: 'voice models installed' } : { can: false, why: 'voice models not installed' },
    speakingSide: claude ? { can: true, why: 'Claude Code is installed' } : { can: false, why: 'Claude Code not found' },
    heavyWork: facts.memoryGB < 8
      ? { can: false, why: `${facts.memoryGB} GB of memory (8 GB or more needed)` }
      : facts.diskFreeGB !== null && facts.diskFreeGB < 10
        ? { can: false, why: `${facts.diskFreeGB} GB free on disk (10 GB or more needed)` }
        : { can: true, why: `${facts.memoryGB} GB of memory${facts.diskFreeGB !== null ? `, ${facts.diskFreeGB} GB free on disk` : ''}` },
  }

  // The operator decides last: a host that has the keys may still be told not to run something
  for (const [name, o] of Object.entries(deps.overrides())) {
    if (!(name in capabilities)) continue
    const can = typeof o === 'boolean' ? o : !!o?.can
    capabilities[name] = { can, why: (typeof o === 'object' && o?.why) || (can ? 'allowed by the operator' : 'turned off by the operator'), byOperator: true }
  }
  return { at: Date.now(), facts, capabilities }
}

// ── This host, cached ────────────────────────────────────────────────────────

let cached: { at: number; value: HostCapabilities } | null = null
const TTL_MS = 60_000

function defaultDeps(): ProbeDeps {
  const home = os.homedir()
  return {
    hasSecret: async (name) => (await import('@/lib/secret-vault.mjs')).hasSecret(name),
    localVoiceReady: () => { try { return localSpeechReady() } catch { return false } },
    // Anywhere on the server's PATH (mini-lola has it in /usr/bin and ~/.npm-global/bin), plus the usual install places
    claudeInstalled: () => [...(process.env.PATH || '').split(path.delimiter).filter(Boolean), path.join(home, '.local', 'bin'), path.join(home, '.npm-global', 'bin'), '/opt/homebrew/bin', '/usr/local/bin', '/usr/bin']
      .some(dir => fs.existsSync(path.join(dir, 'claude'))),
    diskFreeGB: () => { try { const st = fs.statfsSync(home); return gb(st.bavail * st.bsize) } catch { return null } },
    overrides: () => { try { return JSON.parse(fs.readFileSync(path.join(home, '.aimaestro', 'host-capabilities.json'), 'utf8')) } catch { return {} } },
    home,
  }
}

/** This host's capabilities, probed at most once a minute */
export async function hostCapabilities(deps?: ProbeDeps): Promise<HostCapabilities> {
  if (!deps && cached && Date.now() - cached.at < TTL_MS) return cached.value
  const value = await probeCapabilities(deps || defaultDeps())
  if (!deps) cached = { at: Date.now(), value }
  return value
}

/** Can this host run it? For a feature to check before it starts */
export async function canRun(name: string): Promise<Capability> {
  return (await hostCapabilities()).capabilities[name] || { can: true, why: 'not a known capability' }
}
