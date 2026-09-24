// Generate living-avatar loops for a few agents with Veo (Gemini API).
// Usage: node scripts/avatars/generate-veo-loops.mjs <agentKey> [state ...]
// Status: prepared, never run (no paid Gemini key yet). See backlog F012.
// Key read from ~/.aimaestro/gemini.key (never printed).
import fs from 'fs'
import os from 'os'
import path from 'path'
import { execFileSync } from 'child_process'

const KEY = fs.readFileSync(path.join(os.homedir(), '.aimaestro', 'gemini.key'), 'utf8').trim()
const MODEL = process.env.VEO_MODEL || 'veo-3.1-lite-generate-preview'
const API = 'https://generativelanguage.googleapis.com/v1beta'
const HERE = process.env.AVATAR_OUT_DIR || path.join(os.tmpdir(), 'avatar-loops')
fs.mkdirSync(HERE, { recursive: true })
const AVATARS = path.join(path.dirname(new URL(import.meta.url).pathname), '..', '..', 'public', 'avatars')

const AGENTS = {
  titania: { src: 'women_62.png', who: 'a woman with short natural hair in a charcoal blazer' },
  lola: { src: 'women_43.png', who: 'a young woman with long brown hair in a grey blazer' },
  jarvis: { src: 'men_39.png', who: 'a man with dark hair and a short beard in a navy blazer', crop: true },
}

const COMMON = 'Photorealistic head-and-shoulders portrait, static locked-off camera, plain light grey studio background, soft even light. Subtle, natural, calm motion only. The person stays centered and the framing never changes. The clip starts and ends in the same pose so it loops seamlessly. No text, no captions, no other people, no camera movement.'
const STATES = {
  idle: 'The person breathes gently, blinks naturally two or three times, and makes a tiny relaxed head movement, then settles back.',
  working: 'The person looks down slightly as if reading a screen just below the frame, focused, eyes moving across text, a small nod of concentration, occasional blink; shoulders move very slightly as if typing out of frame. Returns to the starting pose at the end.',
  waiting: 'The person looks straight into the camera attentively with a warm, patient half-smile, raises the eyebrows slightly as if waiting for an answer, blinks, then relaxes back.',
  sleeping: 'The person has eyes closed, peaceful, breathing slowly and deeply, head resting slightly, very still; the eyes stay closed the whole time.',
}
const NEGATIVE = 'camera movement, zoom, text, subtitles, extra people, distorted face, morphing, hands covering face, fast motion'

function prepareImage(agent) {
  const out = path.join(HERE, `${agent}-input.png`)
  const a = AGENTS[agent]
  const src = path.join(AVATARS, a.src)
  // Portrait into a 9:16 canvas (Veo image-to-video has no square output):
  // we crop the square (the bottom of the frame) back out afterwards.
  const crop = a.crop ? 'crop=808:808:108:108,scale=1024:1024,' : ''
  // Portrait at the bottom of the tall frame, the photo's own top edge (plain
  // backdrop) stretched above it: one continuous shot. (Flat padding showed as
  // bands, a blurred copy as ghost faces, a stretched jacket as streaks.)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', src, '-filter_complex',
    `[0]${crop}scale=720:720,split[a][t];[t]crop=720:6:0:0,scale=720:560,boxblur=6:2[top];[top][a]vstack`, out])
  return out
}

async function start(agent, state, imagePath) {
  const data = fs.readFileSync(imagePath).toString('base64')
  const image = { inlineData: { mimeType: 'image/png', data } }
  const body = {
    instances: [{ prompt: `${AGENTS[agent].who}. ${STATES[state]} ${COMMON}`, image, lastFrame: image }],
    parameters: { aspectRatio: '9:16', durationSeconds: '4', personGeneration: 'allow_adult', negativePrompt: NEGATIVE },
  }
  let res = await fetch(`${API}/models/${MODEL}:predictLongRunning`, {
    method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!res.ok) {
    const t = await res.text()
    if (/lastFrame/i.test(t)) {
      // Model without first/last-frame support: go without it
      delete body.instances[0].lastFrame
      res = await fetch(`${API}/models/${MODEL}:predictLongRunning`, {
        method: 'POST', headers: { 'x-goog-api-key': KEY, 'Content-Type': 'application/json' }, body: JSON.stringify(body),
      })
      if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
    } else throw new Error(`${res.status} ${t.slice(0, 500)}`)
  }
  return (await res.json()).name
}

async function wait(op) {
  for (let i = 0; i < 90; i++) {
    await new Promise(r => setTimeout(r, 10000))
    const r = await (await fetch(`${API}/${op}`, { headers: { 'x-goog-api-key': KEY } })).json()
    if (r.error) throw new Error(JSON.stringify(r.error).slice(0, 400))
    if (r.done) {
      const s = r.response?.generateVideoResponse
      const uri = s?.generatedSamples?.[0]?.video?.uri
      if (!uri) throw new Error(`no video: ${JSON.stringify(s?.raiMediaFilteredReasons || r.response).slice(0, 400)}`)
      return uri
    }
  }
  throw new Error('timed out')
}

async function run(agent, state) {
  const input = prepareImage(agent)
  const t0 = Date.now()
  const op = await start(agent, state, input)
  const uri = await wait(op)
  const raw = path.join(HERE, `${agent}-${state}-raw.mp4`)
  const res = await fetch(uri, { headers: { 'x-goog-api-key': KEY }, redirect: 'follow' })
  fs.writeFileSync(raw, Buffer.from(await res.arrayBuffer()))
  // Square crop around the face, no audio, web-friendly
  const out = path.join(HERE, `${agent}-${state}.mp4`)
  execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', raw, '-an', '-vf',
    "crop=iw:iw:0:ih-iw,scale=512:512", '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out])
  console.log(`${agent}/${state}: ${Math.round((Date.now() - t0) / 1000)}s -> ${out}`)
}

const [agent, ...states] = process.argv.slice(2)
for (const st of states.length ? states : Object.keys(STATES)) {
  try { await run(agent, st) } catch (e) { console.error(`${agent}/${st} FAILED: ${e.message}`) }
}
