/**
 * Mesh sync (docs/SPEC-MESH-SYNC.md, F107): one WebSocket per peer that carries each
 * host's own data. Each host is the only source for its own agents; peers keep a
 * read-only copy and never work it out themselves.
 *
 * One socket carries several feeds (status, agents, sessions). For each feed:
 *   server: hello, then a full list (on connect and every 5 min), then a change the moment
 *           one item changes (with that feed's seq), and a ping every 20 s for the socket.
 *   client: one connection to every enabled peer. A gap in a feed's seq asks for that feed's
 *           full list. 45 s of silence drops the host's copies, then reconnects (2 s .. 30 s).
 *
 * What is published is this host's own output (its getActivity, its listAgents...), diffed,
 * so a peer sees exactly what this host's own page sees.
 */
import WebSocket, { WebSocketServer } from 'ws'

export const MESH_PROTOCOL = 2
const FULL_MS = 5 * 60_000
const PING_MS = 20_000
const SILENT_MS = 45_000
const PEERS_MS = 60_000

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Items whose entry differs between two snapshots, removed ones as null */
export function diffItems(prev, next) {
  const out = []
  for (const key of Object.keys(next)) if (!same(prev[key], next[key])) out.push([key, next[key]])
  for (const key of Object.keys(prev)) if (!(key in next)) out.push([key, null])
  return out
}

/** Apply one message to a feed's copy. Returns the items that changed, or 'resync' on a seq gap. */
export function applyMeshMessage(copy, msg) {
  if (msg.type === 'full') {
    const changed = diffItems(copy.items, msg.items || {})
    copy.items = { ...(msg.items || {}) }
    copy.seq = msg.seq
    return changed
  }
  if (msg.type === 'change') {
    if (msg.seq !== copy.seq + 1) return 'resync'
    copy.seq = msg.seq
    if (msg.info) copy.items[msg.key] = msg.info
    else delete copy.items[msg.key]
    return [[msg.key, msg.info || null]]
  }
  return []
}

/**
 * @param {object} o
 * @param {string} o.selfId
 * @param {string} o.version
 * @param {Record<string, { get: () => Promise<Record<string, object>>, pollMs: number, minGapMs?: number }>} o.feeds
 *        this host's own items per feed, keyed (status: by agent name, agents: by id...)
 * @param {Record<string, Map>} o.copies  per feed: hostId -> { items, seq, okAt, connected, version }
 * @param {() => Array<{id: string, url: string}>} o.getPeers  enabled peers, never self
 * @param {(feed: string, hostId: string, key: string, info: object|null) => void} o.onRemoteChange
 */
export function createMesh({ selfId, version, feeds, copies, getPeers, onRemoteChange, log = console.log }) {
  const wss = new WebSocketServer({ noServer: true })
  const subscribers = new Set()
  const timers = []
  const send = (ws, msg) => { if (ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(msg)) } catch { /* closing */ } } }

  // ── server side: publish this host's feeds ──
  const pub = Object.fromEntries(Object.keys(feeds).map(name => [name, { published: null, seq: 0, running: null, again: false, lastAt: 0, timer: null }]))
  const fullOf = (name) => ({ type: 'full', feed: name, seq: pub[name].seq, items: pub[name].published || {} })

  /** Recompute one feed and send what changed. One run at a time; a call during a run queues one more. */
  function refresh(name) {
    const p = pub[name]
    if (p.running) { p.again = true; return p.running }
    p.running = (async () => {
      do {
        p.again = false
        p.lastAt = Date.now()
        let next
        try { next = await feeds[name].get() } catch (e) { log(`[Mesh] ${name} feed failed: ${e?.message || e}`); break }
        if (p.published) {
          for (const [key, info] of diffItems(p.published, next)) {
            p.seq++
            subscribers.forEach(ws => send(ws, { type: 'change', feed: name, seq: p.seq, key, info }))
          }
        }
        p.published = next
      } while (p.again)
    })().finally(() => { p.running = null })
    return p.running
  }
  const refreshAll = () => Promise.all(Object.keys(feeds).map(refresh))

  /** Something local changed: publish within 200 ms (each feed at most once per its minGapMs) */
  function notify() {
    if (subscribers.size === 0) return
    for (const name of Object.keys(feeds)) {
      const p = pub[name]
      if (p.timer) continue
      const wait = Math.max(200, (feeds[name].minGapMs || 0) - (Date.now() - p.lastAt))
      p.timer = setTimeout(() => { p.timer = null; refresh(name) }, wait)
    }
  }

  wss.on('connection', async (ws, request) => {
    const from = new URL(request.url, 'http://x').searchParams.get('from') || '?'
    subscribers.add(ws)
    log(`[Mesh] ${from} subscribed (${subscribers.size})`)
    send(ws, { type: 'hello', hostId: selfId, version, protocol: MESH_PROTOCOL })
    await refreshAll()
    for (const name of Object.keys(feeds)) send(ws, fullOf(name))
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(String(data)) } catch { return }
      if (msg.type === 'resync' && pub[msg.feed]) send(ws, fullOf(msg.feed))
    })
    const drop = () => { if (subscribers.delete(ws)) log(`[Mesh] ${from} left (${subscribers.size})`) }
    ws.on('close', drop)
    ws.on('error', drop)
  })

  // ── client side: one connection to every peer ──
  const links = new Map() // hostId -> { url, ws, backoff, timer, closed, okAt }

  function copyOf(feed, hostId) {
    const m = copies[feed]
    if (!m.has(hostId)) m.set(hostId, { items: {}, seq: 0, okAt: 0, connected: false })
    return m.get(hostId)
  }

  /** Local items win over a peer's with the same key, here as in the readers */
  const isLocal = (feed, key) => !!(pub[feed]?.published && key in pub[feed].published)

  function dropCopies(hostId) {
    for (const feed of Object.keys(copies)) {
      const copy = copies[feed].get(hostId)
      if (!copy) continue
      const had = copy.connected
      copy.connected = false
      if (had) for (const key of Object.keys(copy.items)) if (!isLocal(feed, key)) onRemoteChange(feed, hostId, key, null)
      copy.items = {}
      copy.seq = 0
    }
  }

  function connect(hostId) {
    const link = links.get(hostId)
    if (!link || link.closed) return
    const url = `${link.url.replace(/\/$/, '').replace(/^http/, 'ws')}/mesh?from=${encodeURIComponent(selfId)}`
    let ws
    try { ws = new WebSocket(url, { handshakeTimeout: 10_000 }) } catch { return schedule(hostId) }
    link.ws = ws
    let peerVersion
    ws.on('open', () => { link.okAt = Date.now() })
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(String(data)) } catch { return }
      link.okAt = Date.now()
      if (msg.type === 'hello') {
        peerVersion = msg.version
        if (msg.protocol !== MESH_PROTOCOL) {
          if (!link.mismatchLogged) log(`[Mesh] ${hostId} (v${msg.version}) speaks protocol ${msg.protocol}, this host ${MESH_PROTOCOL}: read it directly instead`)
          link.mismatchLogged = true
          link.backoff = 60_000 // until that host is updated; a rolling deploy finishes within a minute or two
          ws.close()
        }
        return
      }
      if (!copies[msg.feed]) return
      const copy = copyOf(msg.feed, hostId)
      copy.okAt = link.okAt
      const changed = applyMeshMessage(copy, msg)
      if (changed === 'resync') { send(ws, { type: 'resync', feed: msg.feed }); return }
      if (msg.type === 'full' && !copy.connected) {
        copy.connected = true
        copy.version = peerVersion
        link.backoff = 2000
        link.mismatchLogged = false
        log(`[Mesh] ${hostId} ${msg.feed}: ${Object.keys(copy.items).length} item(s), v${peerVersion || '?'}`)
      }
      for (const [key, info] of changed) if (!isLocal(msg.feed, key)) onRemoteChange(msg.feed, hostId, key, info)
    })
    ws.on('error', () => { /* close follows */ })
    ws.on('close', () => {
      if (link.ws !== ws) return
      link.ws = null
      if (copies.status?.get(hostId)?.connected) log(`[Mesh] ${hostId} disconnected`)
      dropCopies(hostId)
      schedule(hostId)
    })
  }

  function schedule(hostId) {
    const link = links.get(hostId)
    if (!link || link.closed) return
    clearTimeout(link.timer)
    link.timer = setTimeout(() => connect(hostId), link.backoff)
    if (link.backoff < 30_000) link.backoff = Math.min(link.backoff * 2, 30_000)
  }

  function syncPeers() {
    let peers = []
    try { peers = getPeers() } catch (e) { log(`[Mesh] peer list failed: ${e?.message || e}`) }
    const want = new Map(peers.filter(p => p.id && p.url && p.id !== selfId).map(p => [p.id, p.url]))
    for (const [hostId, link] of links) {
      if (want.get(hostId) === link.url) continue
      link.closed = true
      clearTimeout(link.timer)
      link.ws?.terminate()
      links.delete(hostId)
      dropCopies(hostId)
      for (const feed of Object.keys(copies)) copies[feed].delete(hostId)
    }
    for (const [hostId, url] of want) {
      if (links.has(hostId)) continue
      links.set(hostId, { url, ws: null, backoff: 2000, timer: null, closed: false, okAt: 0 })
      connect(hostId)
    }
  }

  function watchdog() {
    const now = Date.now()
    for (const [hostId, link] of links) {
      if (link.ws && link.okAt && now - link.okAt > SILENT_MS) {
        log(`[Mesh] ${hostId} silent for ${Math.round((now - link.okAt) / 1000)} s, reconnecting`)
        link.ws.terminate()
      }
    }
  }

  return {
    /** Hand a /mesh upgrade to the mesh */
    handleUpgrade(request, socket, head) {
      wss.handleUpgrade(request, socket, head, (ws) => wss.emit('connection', ws, request))
    },
    notify,
    refresh: refreshAll,
    start() {
      syncPeers()
      for (const name of Object.keys(feeds)) {
        timers.push(setInterval(() => { if (subscribers.size) refresh(name) }, feeds[name].pollMs))
      }
      timers.push(
        setInterval(() => { for (const name of Object.keys(feeds)) subscribers.forEach(ws => send(ws, fullOf(name))) }, FULL_MS),
        setInterval(() => subscribers.forEach(ws => send(ws, { type: 'ping' })), PING_MS),
        setInterval(watchdog, 5_000),
        setInterval(syncPeers, PEERS_MS),
      )
    },
    stop() {
      timers.splice(0).forEach(clearInterval)
      for (const p of Object.values(pub)) clearTimeout(p.timer)
      for (const [hostId, link] of links) { link.closed = true; clearTimeout(link.timer); link.ws?.terminate(); links.delete(hostId) }
      subscribers.forEach(ws => ws.terminate())
    },
  }
}
