#!/usr/bin/env node
/**
 * Writes the small avatars: public/avatars/{128,256}/<name>.webp from each
 * built-in public/avatars/<name>.png. The results are committed, so hosts need
 * no image library at runtime. Re-run when avatars are added; an existing file
 * is left alone because clients cache these URLs as immutable.
 * tests/avatar-thumbs.test.ts fails if one is missing.
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'

const AVATAR_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public', 'avatars')
const builtIn = fs.readdirSync(AVATAR_DIR).filter(f => /^(men|women|robots)_\d{2}\.png$/.test(f))

let written = 0
for (const size of [128, 256]) {
  fs.mkdirSync(path.join(AVATAR_DIR, String(size)), { recursive: true })
  for (const file of builtIn) {
    const out = path.join(AVATAR_DIR, String(size), file.replace(/\.png$/, '.webp'))
    if (fs.existsSync(out)) continue
    await sharp(path.join(AVATAR_DIR, file)).resize(size, size).webp({ quality: 80, effort: 6 }).toFile(out)
    written++
  }
}
console.log(`${written} written, ${builtIn.length * 2 - written} already there`)
