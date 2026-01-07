#!/usr/bin/env npx tsx

/**
 * Build-time script to generate help content embeddings
 *
 * Run: npx tsx scripts/build-help-index.ts
 * Or via: yarn prebuild
 *
 * Generates: data/help-embeddings.json
 *
 * This script pre-computes embeddings for all help content (tutorials + glossary)
 * so the search index is ready at application startup.
 */

import { pipeline, type FeatureExtractionPipeline } from '@huggingface/transformers'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const createPipeline = pipeline as any
import { tutorials } from '../lib/tutorialData'
import { glossary } from '../lib/glossaryData'
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))

const MODEL = 'Xenova/bge-small-en-v1.5'

interface HelpDocument {
  id: string
  type: 'tutorial-intro' | 'tutorial-step' | 'glossary'
  title: string
  text: string
  category?: string
  tutorialId?: string
  stepIndex?: number
  term?: string
  relatedTerms?: string[]
  embedding: number[]
}

interface HelpEmbeddingsFile {
  modelVersion: string
  generatedAt: string
  documentCount: number
  documents: HelpDocument[]
}

let extractor: FeatureExtractionPipeline | null = null

async function getExtractor(): Promise<FeatureExtractionPipeline> {
  if (!extractor) {
    console.log('[Build] Loading embedding model:', MODEL)
    // v3 API: dtype replaces quantized, device: 'auto' for best available
    extractor = await createPipeline('feature-extraction', MODEL, {
      dtype: 'q8',
      device: 'auto',
      progress_callback: (progress: { status: string; progress?: number }) => {
        if (progress.status === 'progress' && progress.progress !== undefined) {
          process.stdout.write(`\r[Build] Loading model... ${Math.round(progress.progress)}%`)
        }
      },
    })
    console.log('\n[Build] Model loaded successfully')
  }
  return extractor!
}

async function embedText(text: string): Promise<number[]> {
  const ex = await getExtractor()
  const output = await ex(text, { pooling: 'mean', normalize: true })

  // Convert to array of numbers
  if (output.data instanceof Float32Array) {
    return Array.from(output.data)
  }
  return Array.from(output.data as number[])
}

async function buildIndex(): Promise<void> {
  console.log('[Build] Starting help index generation...\n')

  const documents: HelpDocument[] = []
  let processed = 0

  // Calculate total documents for progress
  const totalTutorialDocs = tutorials.reduce((sum, t) => sum + 1 + t.steps.length, 0)
  const totalGlossaryDocs = glossary.length
  const totalDocs = totalTutorialDocs + totalGlossaryDocs

  console.log(`[Build] Processing ${tutorials.length} tutorials (${totalTutorialDocs} documents)`)
  console.log(`[Build] Processing ${glossary.length} glossary entries`)
  console.log(`[Build] Total documents to embed: ${totalDocs}\n`)

  // Process tutorials
  for (const tutorial of tutorials) {
    // Tutorial intro (title + description)
    const introText = `${tutorial.title}: ${tutorial.description}`
    const introEmbedding = await embedText(introText)

    documents.push({
      id: `tutorial:${tutorial.id}:intro`,
      type: 'tutorial-intro',
      title: tutorial.title,
      text: tutorial.description,
      category: tutorial.category,
      tutorialId: tutorial.id,
      embedding: introEmbedding,
    })

    processed++
    process.stdout.write(`\r[Build] Embedding documents... ${processed}/${totalDocs}`)

    // Tutorial steps
    for (let i = 0; i < tutorial.steps.length; i++) {
      const step = tutorial.steps[i]
      const stepText = `${step.title}: ${step.description}`
      const stepEmbedding = await embedText(stepText)

      documents.push({
        id: `tutorial:${tutorial.id}:step-${i}`,
        type: 'tutorial-step',
        title: step.title,
        text: step.description,
        category: tutorial.category,
        tutorialId: tutorial.id,
        stepIndex: i,
        embedding: stepEmbedding,
      })

      processed++
      process.stdout.write(`\r[Build] Embedding documents... ${processed}/${totalDocs}`)
    }
  }

  // Process glossary
  for (const entry of glossary) {
    const text = `${entry.term}: ${entry.definition}`
    const embedding = await embedText(text)

    documents.push({
      id: `glossary:${entry.id}`,
      type: 'glossary',
      title: entry.term,
      text: entry.definition,
      term: entry.term,
      relatedTerms: entry.relatedTerms,
      category: entry.category,
      embedding: embedding,
    })

    processed++
    process.stdout.write(`\r[Build] Embedding documents... ${processed}/${totalDocs}`)
  }

  console.log('\n')

  // Prepare output
  const output: HelpEmbeddingsFile = {
    modelVersion: MODEL,
    generatedAt: new Date().toISOString(),
    documentCount: documents.length,
    documents,
  }

  // Write to file
  const outputDir = join(__dirname, '../data')
  const outputPath = join(outputDir, 'help-embeddings.json')

  if (!existsSync(outputDir)) {
    mkdirSync(outputDir, { recursive: true })
    console.log('[Build] Created data/ directory')
  }

  writeFileSync(outputPath, JSON.stringify(output, null, 2))

  // Calculate file size
  const stats = require('fs').statSync(outputPath)
  const fileSizeKB = Math.round(stats.size / 1024)

  console.log(`[Build] Generated ${documents.length} embeddings`)
  console.log(`[Build] Output file: data/help-embeddings.json (${fileSizeKB} KB)`)
  console.log('[Build] Help index generation complete!')
}

// Run the build
buildIndex()
  .then(() => {
    // Cleanup: nullify the extractor to help with garbage collection
    extractor = null

    console.log('[Build] Exiting...')

    // Write a success marker file before exiting
    // This lets the build wrapper know we succeeded even if cleanup crashes
    const markerPath = join(__dirname, '../data/.help-build-success')
    writeFileSync(markerPath, new Date().toISOString())

    // Exit normally - if ONNX cleanup crashes, the marker file proves we succeeded
    process.exit(0)
  })
  .catch((error) => {
    console.error('\n[Build] Error:', error)
    process.exit(1)
  })
