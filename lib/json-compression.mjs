import compression from 'compression'

// Compress JSON answers only (gzip, or brotli when the client asks for it).
// Streams such as text/event-stream are left alone so they are not buffered.
const middleware = compression({
  threshold: 1024,
  filter: (_req, res) => /^application\/json\b/i.test(String(res.getHeader('Content-Type') || '')),
})

/** Wraps res so JSON written to it is compressed; call before routing a request. */
export function compressJson(req, res) {
  middleware(req, res, () => {})
}
