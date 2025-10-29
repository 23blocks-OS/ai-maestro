#!/usr/bin/env node

/**
 * AI Maestro - Social Media Logo Generator
 *
 * Converts SVG logos to various formats required by social media platforms:
 * - YouTube: 800x800 (recommended)
 * - LinkedIn: 300x300 (company logo), 1200x627 (share image)
 * - Instagram: 320x320 (profile), 1080x1080 (post square)
 * - TikTok: 200x200 (profile)
 * - Twitter/X: 400x400 (profile), 1200x675 (card)
 * - Facebook: 180x180 (profile), 1200x630 (share)
 *
 * Usage: node scripts/generate-social-logos.js
 */

const Jimp = require('jimp')
const fs = require('fs').promises
const path = require('path')
const { exec } = require('child_process')
const { promisify } = require('util')

const execAsync = promisify(exec)

// Logo configurations
const LOGO_CONFIGS = {
  // Square logos (profile pictures)
  'youtube-profile': { width: 800, height: 800, format: 'png' },
  'linkedin-logo': { width: 300, height: 300, format: 'png' },
  'instagram-profile': { width: 320, height: 320, format: 'png' },
  'instagram-post': { width: 1080, height: 1080, format: 'png' },
  'tiktok-profile': { width: 200, height: 200, format: 'png' },
  'twitter-profile': { width: 400, height: 400, format: 'png' },
  'facebook-profile': { width: 180, height: 180, format: 'png' },

  // Rectangular logos (banners/share images)
  'linkedin-banner': { width: 1200, height: 627, format: 'png', background: '#0f172a' },
  'twitter-card': { width: 1200, height: 675, format: 'png', background: '#0f172a' },
  'facebook-share': { width: 1200, height: 630, format: 'png', background: '#0f172a' },

  // Additional formats
  'og-image': { width: 1200, height: 630, format: 'png', background: '#0f172a' },
  'favicon': { width: 32, height: 32, format: 'png' },
  'apple-touch-icon': { width: 180, height: 180, format: 'png' },
}

// Paths
const PUBLIC_DIR = path.join(__dirname, '..', 'public')
const LOGOS_DIR = path.join(PUBLIC_DIR, 'logos')
const OUTPUT_DIR = path.join(LOGOS_DIR, 'social')
const TEMP_DIR = path.join(OUTPUT_DIR, 'temp')

// Source SVG files
const SVG_LOGO = path.join(PUBLIC_DIR, 'logo.svg')
const SVG_CONSTELLATION = path.join(PUBLIC_DIR, 'logo-constellation.svg')

/**
 * Check if ImageMagick/resvg is available
 */
async function checkDependencies() {
  try {
    await execAsync('which convert')
    return 'imagemagick'
  } catch {
    try {
      await execAsync('which resvg')
      return 'resvg'
    } catch {
      console.log('⚠️  No SVG converter found. Install one of:')
      console.log('   - ImageMagick: brew install imagemagick')
      console.log('   - resvg: brew install resvg')
      console.log('')
      console.log('   Falling back to manual PNG generation instructions...')
      return null
    }
  }
}

/**
 * Convert SVG to PNG using available tool
 */
async function convertSvgToPng(svgPath, pngPath, width, height, tool) {
  if (tool === 'imagemagick') {
    const cmd = `convert -background none -density 300 "${svgPath}" -resize ${width}x${height} "${pngPath}"`
    await execAsync(cmd)
  } else if (tool === 'resvg') {
    const cmd = `resvg --width ${width} --height ${height} "${svgPath}" "${pngPath}"`
    await execAsync(cmd)
  } else {
    throw new Error('No SVG converter available')
  }
}

/**
 * Create a centered logo on a colored background
 */
async function createBannerWithLogo(logoPngPath, outputPath, width, height, bgColor) {
  // Parse hex color to RGB
  const hex = bgColor.replace('#', '')
  const r = parseInt(hex.substring(0, 2), 16)
  const g = parseInt(hex.substring(2, 4), 16)
  const b = parseInt(hex.substring(4, 6), 16)
  const color = Jimp.rgbaToInt(r, g, b, 255)

  // Create background
  const background = await new Promise((resolve, reject) => {
    new Jimp(width, height, color, (err, image) => {
      if (err) reject(err)
      else resolve(image)
    })
  })

  // Load logo
  const logo = await Jimp.read(logoPngPath)

  // Calculate logo size (30% of banner height, maintain aspect ratio)
  const logoHeight = Math.floor(height * 0.3)
  const logoWidth = Math.floor((logo.bitmap.width / logo.bitmap.height) * logoHeight)

  // Resize logo
  logo.resize(logoWidth, logoHeight)

  // Center logo
  const x = Math.floor((width - logoWidth) / 2)
  const y = Math.floor((height - logoHeight) / 2)

  // Composite
  background.composite(logo, x, y)

  // Save
  await new Promise((resolve, reject) => {
    background.write(outputPath, (err) => {
      if (err) reject(err)
      else resolve()
    })
  })
}

/**
 * Main generation function
 */
async function generateLogos() {
  console.log('🎨 AI Maestro Social Media Logo Generator\n')

  // Check dependencies
  const tool = await checkDependencies()

  // Create directories
  await fs.mkdir(OUTPUT_DIR, { recursive: true })
  await fs.mkdir(TEMP_DIR, { recursive: true })

  console.log('📁 Output directory:', OUTPUT_DIR, '\n')

  if (!tool) {
    // Generate manual instructions
    console.log('📝 Manual Generation Instructions:\n')
    console.log('1. Open your SVG files in a graphics editor (Figma, Sketch, Illustrator)')
    console.log('2. Export the following sizes:\n')

    Object.entries(LOGO_CONFIGS).forEach(([name, config]) => {
      console.log(`   ${name}: ${config.width}x${config.height} ${config.format.toUpperCase()}`)
    })

    console.log('\n3. Save files to:', OUTPUT_DIR)
    console.log('\nOr install ImageMagick/resvg and run this script again.')
    return
  }

  console.log(`✅ Using: ${tool}\n`)

  // Generate square logos (use constellation logo for cleaner profile pictures)
  console.log('🔄 Generating square logos (profiles)...')
  for (const [name, config] of Object.entries(LOGO_CONFIGS)) {
    if (config.width === config.height && !config.background) {
      const outputPath = path.join(OUTPUT_DIR, `${name}.${config.format}`)
      try {
        await convertSvgToPng(SVG_CONSTELLATION, outputPath, config.width, config.height, tool)
        console.log(`   ✓ ${name}: ${config.width}x${config.height}`)
      } catch (error) {
        console.error(`   ✗ ${name}: ${error.message}`)
      }
    }
  }

  // Generate rectangular banners with background
  console.log('\n🔄 Generating rectangular banners...')

  // First, create a temp large PNG of constellation logo
  const tempLogoPath = path.join(TEMP_DIR, 'logo-temp.png')
  await convertSvgToPng(SVG_CONSTELLATION, tempLogoPath, 400, 400, tool)

  for (const [name, config] of Object.entries(LOGO_CONFIGS)) {
    if (config.background) {
      const outputPath = path.join(OUTPUT_DIR, `${name}.${config.format}`)
      try {
        await createBannerWithLogo(tempLogoPath, outputPath, config.width, config.height, config.background)
        console.log(`   ✓ ${name}: ${config.width}x${config.height}`)
      } catch (error) {
        console.error(`   ✗ ${name}: ${error.message}`)
      }
    }
  }

  // Clean up temp directory
  await fs.rm(TEMP_DIR, { recursive: true, force: true })

  console.log('\n✨ Logo generation complete!')
  console.log(`\n📂 All logos saved to: ${OUTPUT_DIR}`)
  console.log('\n📋 Generated files:')

  const files = await fs.readdir(OUTPUT_DIR)
  files.sort().forEach(file => {
    console.log(`   - ${file}`)
  })

  console.log('\n📱 Platform-specific usage:')
  console.log('   YouTube: youtube-profile.png')
  console.log('   LinkedIn: linkedin-logo.png (profile), linkedin-banner.png (share)')
  console.log('   Instagram: instagram-profile.png (profile), instagram-post.png (posts)')
  console.log('   TikTok: tiktok-profile.png')
  console.log('   Twitter/X: twitter-profile.png (profile), twitter-card.png (share)')
  console.log('   Facebook: facebook-profile.png (profile), facebook-share.png (share)')
  console.log('   Website: og-image.png (Open Graph), favicon.png, apple-touch-icon.png')
}

// Run
generateLogos().catch(error => {
  console.error('❌ Error:', error.message)
  process.exit(1)
})
