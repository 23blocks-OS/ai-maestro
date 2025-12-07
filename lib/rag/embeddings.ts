/**
 * Local Embeddings Module
 * Uses @xenova/transformers for CPU-friendly, TypeScript-native embeddings
 * Model: bge-small-en-v1.5 (384-dimensional, English, optimized for retrieval)
 */

import { pipeline, FeatureExtractionPipeline } from '@xenova/transformers';

// Fast, local, CPU-friendly English embedding model
const MODEL = 'Xenova/bge-small-en-v1.5';

let extractor: FeatureExtractionPipeline | null = null;

/**
 * Get or initialize the embedding model (singleton pattern)
 */
async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    console.log('[Embeddings] Loading model:', MODEL);
    extractor = await pipeline('feature-extraction', MODEL, {
      quantized: true, // Faster and smaller, with minimal quality loss
      progress_callback: (progress: any) => {
        if (progress.status === 'progress') {
          console.log(`[Embeddings] Loading... ${Math.round(progress.progress)}%`);
        }
      },
    });
    console.log('[Embeddings] Model loaded successfully');
  }
  return extractor;
}

/**
 * L2 normalize a vector (required for cosine similarity)
 */
function l2Normalize(vec: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < vec.length; i++) {
    sum += vec[i] * vec[i];
  }
  const norm = Math.sqrt(sum) || 1; // Avoid division by zero
  for (let i = 0; i < vec.length; i++) {
    vec[i] /= norm;
  }
  return vec;
}

/**
 * Generate embeddings for one or more texts
 * @param texts - Array of strings to embed
 * @returns Array of L2-normalized Float32Array vectors (384-d each)
 */
export async function embedTexts(texts: string[]): Promise<Float32Array[]> {
  // Filter out empty or invalid texts
  const validTexts = texts.filter(t => t && typeof t === 'string' && t.trim().length > 0);

  if (validTexts.length === 0) {
    throw new Error('[Embeddings] No valid texts to embed');
  }

  const ex = await getExtractor();

  // Get embeddings with mean pooling and normalization
  const output = await ex(validTexts, {
    pooling: 'mean',
    normalize: true, // Built-in L2 normalization
  });

  if (!output) {
    throw new Error('[Embeddings] Model returned undefined output');
  }

  // Transformers.js returns a Tensor with shape [batch_size, embedding_dim]
  // We need to extract each row as a separate embedding
  const results: Float32Array[] = [];

  // Get the raw data and dimensions
  let data: Float32Array | number[];
  let dims: number[];

  if (output.data instanceof Float32Array) {
    data = output.data;
    dims = output.dims || [validTexts.length, 384];
  } else if (Array.isArray(output.data)) {
    data = output.data;
    dims = output.dims || [validTexts.length, 384];
  } else if (output instanceof Float32Array) {
    data = output;
    dims = [validTexts.length, 384];
  } else {
    console.error('[Embeddings] Unexpected output structure:', {
      type: typeof output,
      constructor: output.constructor?.name,
      keys: Object.keys(output),
      hasData: 'data' in output,
      dataType: output.data ? typeof output.data : 'no data',
      hasDims: 'dims' in output,
    });
    throw new Error('[Embeddings] Cannot parse model output');
  }

  // Handle batch outputs - shape is [batch_size, embedding_dim]
  const batchSize = dims[0] || validTexts.length;
  const embeddingDim = dims[1] || 384;

  for (let i = 0; i < batchSize; i++) {
    const start = i * embeddingDim;
    const end = start + embeddingDim;
    const vec = data instanceof Float32Array
      ? data.slice(start, end)
      : Float32Array.from(data.slice(start, end));
    results.push(l2Normalize(vec));
  }

  return results;
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
  return Buffer.from(vec.buffer);
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
 * @param batchSize - Number of texts to process at once (default: 32)
 * @param onProgress - Optional callback for progress updates
 */
export async function embedBatch(
  texts: string[],
  batchSize = 32,
  onProgress?: (completed: number, total: number) => void
): Promise<Float32Array[]> {
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
