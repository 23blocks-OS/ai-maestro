import { describe, it, expect } from 'vitest'
import fs from 'fs'
import path from 'path'
// @ts-expect-error Next ships this compiled copy without types
import { pathToRegexp } from 'next/dist/compiled/path-to-regexp'
import sharp from 'sharp'
import { getAvatarThumbUrl } from '@/lib/hash-utils'
import nextConfig from '../next.config.js'

const AVATAR_DIR = path.resolve(__dirname, '..', 'public', 'avatars')
const builtIn = fs.readdirSync(AVATAR_DIR).filter(f => f.endsWith('.png') && !f.endsWith('_enhanced.png'))

describe('small avatar files', () => {
  it('finds the library', () => {
    expect(builtIn.length).toBeGreaterThanOrEqual(245)
  })

  it.each([128, 256])('every built-in avatar has a small WebP at %i px', async size => {
    const missing = builtIn.filter(f => !fs.existsSync(path.join(AVATAR_DIR, String(size), f.replace(/\.png$/, '.webp'))))
    expect(missing, 'run node scripts/generate-avatar-thumbs.mjs').toEqual([])

    const dir = path.join(AVATAR_DIR, String(size))
    const largest = fs.readdirSync(dir).map(f => fs.statSync(path.join(dir, f)).size).sort((a, b) => b - a)[0]
    expect(largest).toBeLessThan(20 * 1024)

    const meta = await sharp(path.join(dir, 'men_00.webp')).metadata()
    expect([meta.format, meta.width, meta.height]).toEqual(['webp', size, size])
  })
})

describe('getAvatarThumbUrl', () => {
  it('picks the size that stays sharp at twice the drawn size', () => {
    expect(getAvatarThumbUrl('/avatars/men_07.png', 34)).toBe('/avatars/128/men_07.webp')
    expect(getAvatarThumbUrl('/avatars/robots_44.png', 64)).toBe('/avatars/128/robots_44.webp')
    expect(getAvatarThumbUrl('/avatars/women_35.png', 65)).toBe('/avatars/256/women_35.webp')
    expect(getAvatarThumbUrl('/avatars/women_35.png', 128)).toBe('/avatars/256/women_35.webp')
  })

  it('keeps the full file for a large drawing', () => {
    expect(getAvatarThumbUrl('/avatars/men_07.png', 129)).toBe('/avatars/men_07.png')
  })

  it.each([
    '🤖',
    'https://randomuser.me/api/portraits/men/7.jpg',
    'http://100.80.12.6:23000/avatars/men_07.png', // another host, maybe an older version
    '/avatars/men_07_enhanced.png', // local file, no small version
  ])('leaves %s alone', url => {
    expect(getAvatarThumbUrl(url, 34)).toBe(url)
  })
})

describe('avatar Cache-Control rules', async () => {
  const rules = await nextConfig.headers!()
  const cacheRule = (url: string) => rules.find((r: { source: string; headers: { key: string }[] }) =>
    r.headers.some(h => h.key === 'Cache-Control') && pathToRegexp(r.source).test(url))

  it.each([
    '/avatars/women_35.png',
    '/avatars/robots_00.png',
    '/avatars/128/men_41.webp',
    '/avatars/256/robots_44.webp',
  ])('%s is immutable', url => {
    expect(cacheRule(url)?.headers[0].value).toBe('public, max-age=31536000, immutable')
  })

  it.each([
    '/avatars/face-anchors.json', // regenerated when avatars are calibrated
    '/avatars/men_07_enhanced.png', // local file that can be replaced
    '/avatars/64/men_41.webp',
  ])('%s is not', url => {
    expect(cacheRule(url)).toBeUndefined()
  })
})
