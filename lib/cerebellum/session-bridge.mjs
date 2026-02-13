/**
 * Session Bridge (ESM) - Thin wrapper for server.mjs to import
 *
 * Uses globalThis to share the same buffer map with the TypeScript version.
 */

// Simple ring buffer (mirrors terminal-buffer.ts)
class TerminalOutputBuffer {
  constructor(maxSize = 5120) {
    this.buffer = ''
    this.maxSize = maxSize
    this.listeners = new Set()
  }

  write(data) {
    this.buffer += data
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize)
    }
    for (const listener of this.listeners) {
      try { listener(data) } catch { /* ignore */ }
    }
  }

  subscribe(listener) {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getBuffer() { return this.buffer }
  clear() { this.buffer = '' }
  getSize() { return this.buffer.length }
}

// Shared global map (same as TypeScript version)
if (!globalThis._cerebellumBuffers) {
  globalThis._cerebellumBuffers = new Map()
}

const buffers = globalThis._cerebellumBuffers

export function getOrCreateBuffer(sessionName) {
  let buffer = buffers.get(sessionName)
  if (!buffer) {
    buffer = new TerminalOutputBuffer()
    buffers.set(sessionName, buffer)
  }
  return buffer
}

export function getBuffer(sessionName) {
  return buffers.get(sessionName)
}

export function removeBuffer(sessionName) {
  buffers.delete(sessionName)
}
