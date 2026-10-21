/** Local embeddings run in one bounded, recyclable child process. */
import { EmbeddingClient } from './embedding-client.mjs'

export { createLoadProgressLogger } from './load-progress.mjs'

// Next can bundle this module more than once; a module-local singleton would
// create duplicate ONNX sessions. Keep the queue on the process global instead.
const shared = globalThis as typeof globalThis & { _maestroEmbeddings?: EmbeddingClient }
function getClient(): EmbeddingClient {
  if (!shared._maestroEmbeddings) {
    shared._maestroEmbeddings = new EmbeddingClient()
    process.once('exit', () => shared._maestroEmbeddings?.close())
  }
  return shared._maestroEmbeddings
}

export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  return getClient().embedTexts(texts)
}

/**
 * Compute cosine similarity between two L2-normalized vectors
 * @param a - First vector
 * @param b - Second vector
 * @returns Cosine similarity score (0-1, higher is more similar)
 */
export function cosine(a: Float32Array, b: Float32Array): number {
  // For L2-normalized vectors, cosine similarity == dot product
  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    sum += a[i] * b[i];
  }
  return sum;
}

/**
 * Serialize a Float32Array to a Buffer for storage in CozoDB
 */
export function vectorToBuffer(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

/**
 * Deserialize a Buffer back to Float32Array
 */
export function bufferToVector(buf: Buffer): Float32Array {
  return new Float32Array(buf.buffer, buf.byteOffset, buf.byteLength / 4);
}

/**
 * Batch process large arrays of texts with progress callback
 * @param texts - Array of texts to embed
 * @param batchSize - Number of texts to process at once (default: 2)
 * @param onProgress - Optional callback for progress updates
 */
export async function embedBatch(
  texts: string[],
  batchSize = 2,
  onProgress?: (completed: number, total: number) => void
): Promise<Float32Array[]> {
  if (!Number.isInteger(batchSize) || batchSize < 1) throw new Error('Invalid embedding batch size');
  const results: Float32Array[] = [];

  for (let i = 0; i < texts.length; i += batchSize) {
    const batch = texts.slice(i, i + batchSize);
    const embeddings = await embedTexts(batch);
    results.push(...embeddings);

    if (onProgress) {
      onProgress(Math.min(i + batchSize, texts.length), texts.length);
    }
  }

  return results;
}
