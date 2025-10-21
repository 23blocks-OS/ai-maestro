#!/usr/bin/env node

import sharp from 'sharp';
import fs from 'fs/promises';
import path from 'path';

const ICON_SIZES = {
  // Apple Touch Icons
  'apple-touch-icon-180x180.png': 180,
  'apple-touch-icon-152x152.png': 152,
  'apple-touch-icon-120x120.png': 120,

  // Android/PWA Icons
  'icon-192x192.png': 192,
  'icon-512x512.png': 512,

  // Microsoft Tiles
  'mstile-150x150.png': 150,
  'mstile-310x310.png': 310,
  'mstile-70x70.png': 70,
};

const PRIMARY_COLOR = '#6366f1';
const DOCS_DIR = 'docs';
const LOGO_PATH = 'public/logo-constellation.svg';

async function generateIcons() {
  console.log('🎨 Generating icons from constellation logo...\n');

  // Read the SVG logo
  const svgBuffer = await fs.readFile(LOGO_PATH);

  // Generate each icon size
  for (const [filename, size] of Object.entries(ICON_SIZES)) {
    console.log(`Generating ${filename} (${size}x${size})...`);

    try {
      // Resize SVG logo to fit the icon size (with some padding)
      const logoSize = Math.floor(size * 0.8); // 80% of icon size for padding
      const padding = Math.floor((size - logoSize) / 2);

      const resizedLogo = await sharp(svgBuffer)
        .resize(logoSize, logoSize, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();

      // Create a square canvas with the primary color background and centered logo
      await sharp({
        create: {
          width: size,
          height: size,
          channels: 4,
          background: PRIMARY_COLOR
        }
      })
        .composite([{
          input: resizedLogo,
          left: padding,
          top: padding,
          blend: 'over'
        }])
        .png()
        .toFile(path.join(DOCS_DIR, filename));

      console.log(`✓ Created ${filename}`);
    } catch (error) {
      console.error(`✗ Failed to create ${filename}:`, error.message);
    }
  }

  // Generate safari-pinned-tab.svg (monochrome version)
  console.log('\nGenerating safari-pinned-tab.svg...');
  try {
    // For Safari pinned tab, we need a monochrome SVG
    // We'll just copy the original SVG for now (Safari will use the mask-icon color)
    await fs.copyFile(LOGO_PATH, path.join(DOCS_DIR, 'safari-pinned-tab.svg'));
    console.log('✓ Created safari-pinned-tab.svg');
  } catch (error) {
    console.error('✗ Failed to create safari-pinned-tab.svg:', error.message);
  }

  // Copy favicon files from /public to /docs
  console.log('\nCopying favicon files...');
  const faviconFiles = ['favicon.ico', 'favicon.svg'];

  for (const file of faviconFiles) {
    try {
      await fs.copyFile(path.join('public', file), path.join(DOCS_DIR, file));
      console.log(`✓ Copied ${file}`);
    } catch (error) {
      console.error(`✗ Failed to copy ${file}:`, error.message);
    }
  }

  console.log('\n✨ Icon generation complete!');
}

generateIcons().catch(console.error);
