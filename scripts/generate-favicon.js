#!/usr/bin/env node

/**
 * Generate favicon.ico from SVG
 *
 * This script converts the constellation SVG logo to a multi-resolution favicon.ico
 *
 * Requirements:
 * - sharp (for SVG to PNG conversion)
 * - to-ico (for PNG to ICO conversion)
 *
 * Install dependencies:
 * npm install --save-dev sharp to-ico
 *
 * Run:
 * node scripts/generate-favicon.js
 */

const fs = require('fs').promises;
const path = require('path');

async function generateFavicon() {
  try {
    // Try to use sharp if available
    const sharp = require('sharp');
    const toIco = require('to-ico');

    const svgPath = path.join(__dirname, '../public/logo-constellation.svg');
    const outputPath = path.join(__dirname, '../public/favicon.ico');

    console.log('📖 Reading SVG file...');
    const svgBuffer = await fs.readFile(svgPath);

    console.log('🎨 Generating PNG images at different sizes...');

    // Generate PNGs at standard favicon sizes
    const sizes = [16, 32, 48];
    const pngBuffers = await Promise.all(
      sizes.map(size =>
        sharp(svgBuffer)
          .resize(size, size)
          .png()
          .toBuffer()
      )
    );

    console.log('🔄 Converting to ICO format...');
    const icoBuffer = await toIco(pngBuffers);

    console.log('💾 Writing favicon.ico...');
    await fs.writeFile(outputPath, icoBuffer);

    console.log('✅ Favicon generated successfully at public/favicon.ico');
    console.log(`   Sizes included: ${sizes.join('x')}, ${sizes.join('x')}, ${sizes.join('x')}`);

  } catch (error) {
    if (error.code === 'MODULE_NOT_FOUND') {
      console.error('❌ Required dependencies not found.');
      console.error('');
      console.error('Please install the required packages:');
      console.error('  npm install --save-dev sharp to-ico');
      console.error('');
      console.error('Then run this script again:');
      console.error('  node scripts/generate-favicon.js');
      console.error('');
      console.error('Alternative: Use an online converter:');
      console.error('  1. Upload public/logo-constellation.svg to https://favicon.io/favicon-converter/');
      console.error('  2. Download the favicon.ico file');
      console.error('  3. Place it in public/favicon.ico');
      process.exit(1);
    }
    throw error;
  }
}

generateFavicon().catch(error => {
  console.error('Error generating favicon:', error);
  process.exit(1);
});
