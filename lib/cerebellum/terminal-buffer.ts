/**
 * Terminal Output Buffer - Ring buffer for accumulating PTY output
 *
 * Used by the voice subsystem to collect recent terminal output
 * for LLM summarization when the agent goes idle.
 */

export type BufferListener = (data: string) => void

export class TerminalOutputBuffer {
  private buffer = ''
  private maxSize: number
  private listeners = new Set<BufferListener>()

  constructor(maxSize = 8192) {
    this.maxSize = maxSize
  }

  write(data: string): void {
    this.buffer += data
    if (this.buffer.length > this.maxSize) {
      this.buffer = this.buffer.slice(-this.maxSize)
    }
    for (const listener of this.listeners) {
      try {
        listener(data)
      } catch {
        // Ignore listener errors
      }
    }
  }

  subscribe(listener: BufferListener): () => void {
    this.listeners.add(listener)
    return () => this.listeners.delete(listener)
  }

  getBuffer(): string {
    return this.buffer
  }

  clear(): void {
    this.buffer = ''
  }

  getSize(): number {
    return this.buffer.length
  }
}
