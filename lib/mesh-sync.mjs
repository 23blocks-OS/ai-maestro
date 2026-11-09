/**
 * Mesh sync (docs/SPEC-MESH-SYNC.md, F107 step 2): one WebSocket per peer that carries
 * each host's own agent status. Each host is the only source for its own agents; peers
 * keep a read-only copy and never work it out themselves.
 *
 *   server: /mesh sends hello, then full (on connect and every 5 min), then a change the
 *           moment one of this host's agents changes, and a ping every 20 s.
 *   client: one connection to every enabled peer. A gap in seq asks for a full. 45 s of
 *           silence drops the socket and that host's agents, then reconnects (2 s .. 30 s).
 *
 * What is published is the output of this host's own getActivity (local only), diffed, so
 * a peer sees exactly what this host's own page sees.
 */
import WebSocket, { WebSocketServer } from 'ws'

export const MESH_PROTOCOL = 1
const FULL_MS = 5 * 60_000
const PING_MS = 20_000
const SILENT_MS = 45_000
const POLL_MS = 5_000 // also catches what no hook announces: a report expiring, a session ending
const PEERS_MS = 60_000

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

/** Agents whose entry differs between two snapshots, removed ones as null */
export function diffAgents(prev, next) {
  const out = []
  for (const name of Object.keys(next)) if (!same(prev[name], next[name])) out.push([name, next[name]])
  for (const name of Object.keys(prev)) if (!(name in next)) out.push([name, null])
  return out
}

/** Apply one message to a peer's copy. Returns the agents that changed, or 'resync' on a seq gap. */
export function applyMeshMessage(copy, msg) {
  if (msg.type === 'full') {
    const changed = diffAgents(copy.agents, msg.agents || {})
    copy.agents = { ...(msg.agents || {}) }
    copy.seq = msg.seq
    return changed
  }
  if (msg.type === 'change') {
    if (msg.seq !== copy.seq + 1) return 'resync'
    copy.seq = msg.seq
    if (msg.info) copy.agents[msg.name] = msg.info
    else delete copy.agents[msg.name]
    return [[msg.name, msg.info || null]]
  }
  return []
}

/**
 * @param {object} o
 * @param {string} o.selfId
 * @param {string} o.version
 * @param {() => Promise<Record<string, object>>} o.getLocalActivity  this host's agents only
 * @param {() => Array<{id: string, url: string}>} o.getPeers         enabled peers, never self
 * @param {Map} o.peerActivity   shared copy: hostId -> { agents, seq, okAt, connected, version }
 * @param {(hostId: string, name: string, info: object|null) => void} o.onRemoteChange
 */
export function createMesh({ selfId, version, getLocalActivity, getPeers, peerActivity, onRemoteChange, log = console.log }) {
  const wss = new WebSocketServer({ noServer: true })
  const subscribers = new Set()
  let published = null
  let seq = 0
  let refreshing = null
  let again = false
  const timers = []

  const send = (ws, msg) => { if (ws.readyState === WebSocket.OPEN) { try { ws.send(JSON.stringify(msg)) } catch { /* closing */ } } }
  const full = () => ({ type: 'full', seq, agents: published || {} })

  /** Recompute the local feed and send what changed. One at a time; a call during a run queues one more. */
  async function refresh() {
    if (refreshing) { again = true; return refreshing }
    refreshing = (async () => {
      do {
        again = false
        let next
        try { next = await getLocalActivity() } catch (e) { log(`[Mesh] local feed failed: ${e?.message || e}`); break }
        if (published) {
          for (const [name, info] of diffAgents(published, next)) {
            seq++
            subscribers.forEach(ws => send(ws, { type: 'change', seq, name, info }))
          }
        }
        published = next
      } while (again)
    })().finally(() => { refreshing = null })
    return refreshing
  }

  let notifyTimer = null
  /** A local status changed: publish within 200 ms */
  function notify() {
    if (notifyTimer || subscribers.size === 0) return
    notifyTimer = setTimeout(() => { notifyTimer = null; refresh() }, 200)
  }

  wss.on('connection', async (ws, request) => {
    const from = new URL(request.url, 'http://x').searchParams.get('from') || '?'
    subscribers.add(ws)
    log(`[Mesh] ${from} subscribed (${subscribers.size})`)
    send(ws, { type: 'hello', hostId: selfId, version, protocol: MESH_PROTOCOL })
    await refresh()
    send(ws, full())
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(String(data)) } catch { return }
      if (msg.type === 'resync') send(ws, full())
    })
    const drop = () => { subscribers.delete(ws) }
    ws.on('close', drop)
    ws.on('error', drop)
  })

  // ── client side: one connection to every peer ──
  const links = new Map() // hostId -> { url, ws, backoff, timer, closed }

  function copyOf(hostId) {
    if (!peerActivity.has(hostId)) peerActivity.set(hostId, { agents: {}, seq: 0, okAt: 0, connected: false })
    return peerActivity.get(hostId)
  }

  function dropCopy(hostId) {
    const copy = peerActivity.get(hostId)
    if (!copy) return
    copy.connected = false
    for (const name of Object.keys(copy.agents)) if (!(published && name in published)) onRemoteChange(hostId, name, null)
    copy.agents = {}
    copy.seq = 0
  }

  function connect(hostId) {
    const link = links.get(hostId)
    if (!link || link.closed) return
    const url = `${link.url.replace(/\/$/, '').replace(/^http/, 'ws')}/mesh?from=${encodeURIComponent(selfId)}`
    let ws
    try { ws = new WebSocket(url, { handshakeTimeout: 10_000 }) } catch { return schedule(hostId) }
    link.ws = ws
    const copy = copyOf(hostId)
    ws.on('open', () => { copy.okAt = Date.now() })
    ws.on('message', (data) => {
      let msg; try { msg = JSON.parse(String(data)) } catch { return }
      copy.okAt = Date.now()
      if (msg.type === 'hello') {
        copy.version = msg.version
        if (msg.protocol !== MESH_PROTOCOL) {
          log(`[Mesh] ${hostId} speaks protocol ${msg.protocol}, this host ${MESH_PROTOCOL}: not used`)
          copy.protocolMismatch = true
          ws.close()
        }
        return
      }
      const changed = applyMeshMessage(copy, msg)
      if (changed === 'resync') { send(ws, { type: 'resync' }); return }
      if (msg.type === 'full' && !copy.connected) {
        copy.connected = true
        link.backoff = 2000
        log(`[Mesh] ${hostId}: ${Object.keys(copy.agents).length} agent(s), v${copy.version || '?'}`)
      }
      // A local agent with the same name always wins, here as in getActivity
      for (const [name, info] of changed) if (!(published && name in published)) onRemoteChange(hostId, name, info)
    })
    ws.on('error', () => { /* close follows */ })
    ws.on('close', () => {
      if (link.ws !== ws) return
      link.ws = null
      if (copy.connected) log(`[Mesh] ${hostId} disconnected`)
      dropCopy(hostId)
      schedule(hostId)
    })
  }

  function schedule(hostId) {
    const link = links.get(hostId)
    if (!link || link.closed) return
    clearTimeout(link.timer)
    link.timer = setTimeout(() => connect(hostId), link.backoff)
    link.backoff = Math.min(link.backoff * 2, 30_000)
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
      dropCopy(hostId)
      peerActivity.delete(hostId)
    }
    for (const [hostId, url] of want) {
      if (links.has(hostId)) continue
      links.set(hostId, { url, ws: null, backoff: 2000, timer: null, closed: false })
      connect(hostId)
    }
  }

  function watchdog() {
    const now = Date.now()
    for (const [hostId, link] of links) {
      const copy = peerActivity.get(hostId)
      if (link.ws && copy?.okAt && now - copy.okAt > SILENT_MS) {
        log(`[Mesh] ${hostId} silent for ${Math.round((now - copy.okAt) / 1000)} s, reconnecting`)
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
    refresh,
    start() {
      syncPeers()
      timers.push(
        setInterval(() => { if (subscribers.size) refresh() }, POLL_MS),
        setInterval(() => subscribers.forEach(ws => send(ws, full())), FULL_MS),
        setInterval(() => subscribers.forEach(ws => send(ws, { type: 'ping' })), PING_MS),
        setInterval(watchdog, 5_000),
        setInterval(syncPeers, PEERS_MS),
      )
    },
    stop() {
      timers.splice(0).forEach(clearInterval)
      for (const [hostId, link] of links) { link.closed = true; clearTimeout(link.timer); link.ws?.terminate(); links.delete(hostId) }
      subscribers.forEach(ws => ws.terminate())
    },
  }
}
