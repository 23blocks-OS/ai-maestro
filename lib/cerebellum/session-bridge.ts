/**
 * Session Bridge - Global map connecting tmux sessions to terminal buffers
 *
 * Used by server.mjs to pipe PTY output data into the cerebellum's
 * terminal buffers. The voice subsystem subscribes to these buffers.
 */

import { TerminalOutputBuffer } from './terminal-buffer.js'

// Use globalThis to ensure the map is shared across module contexts
declare global {
  // eslint-disable-next-line no-var
  var _cerebellumBuffers: Map<string, TerminalOutputBuffer> | undefined
}

if (!globalThis._cerebellumBuffers) {
  globalThis._cerebellumBuffers = new Map()
}

const buffers = globalThis._cerebellumBuffers

export function getOrCreateBuffer(sessionName: string): TerminalOutputBuffer {
  let buffer = buffers.get(sessionName)
  if (!buffer) {
    buffer = new TerminalOutputBuffer()
    buffers.set(sessionName, buffer)
  }
  return buffer
}

export function getBuffer(sessionName: string): TerminalOutputBuffer | undefined {
  return buffers.get(sessionName)
}

export function removeBuffer(sessionName: string): void {
  buffers.delete(sessionName)
}

export function getAllBuffers(): Map<string, TerminalOutputBuffer> {
  return buffers
}
