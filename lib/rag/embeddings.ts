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

  // Convert to Float32Array and ensure normalization
  const arrays = Array.isArray(output) ? output : [output];
  return arrays.map((arr: any, idx: number) => {
    if (!arr) {
      throw new Error(`[Embeddings] Embedding ${idx} is undefined`);
    }

    // Transformers.js returns Tensor objects with a .data property
    let vec: Float32Array;

    if (arr.data && Array.isArray(arr.data)) {
      // Tensor with data array
      vec = Float32Array.from(arr.data);
    } else if (arr.data instanceof Float32Array) {
      // Tensor with Float32Array data
      vec = arr.data;
    } else if (arr instanceof Float32Array) {
      // Already a Float32Array
      vec = arr;
    } else if (Array.isArray(arr)) {
      // Plain array
      vec = Float32Array.from(arr);
    } else {
      console.error('[Embeddings] Unexpected structure:', {
        type: typeof arr,
        constructor: arr.constructor?.name,
        keys: Object.keys(arr),
        hasData: 'data' in arr,
        dataType: arr.data ? typeof arr.data : 'no data'
      });
      throw new Error(`[Embeddings] Cannot extract vector from embedding ${idx}`);
    }

    return l2Normalize(vec);
  });
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
