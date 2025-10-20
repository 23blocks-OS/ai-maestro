#!/usr/bin/env node

import sharp from 'sharp';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const projectRoot = join(__dirname, '..');

// Read the SVG logo
const logoSvg = readFileSync(join(projectRoot, 'public', 'logo-constellation.svg'));

// OG Image dimensions (recommended for LinkedIn, Facebook, Twitter)
const OG_WIDTH = 1200;
const OG_HEIGHT = 630;

// Create background with gradient (matching AI Maestro theme)
const background = Buffer.from(`
<svg width="${OG_WIDTH}" height="${OG_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" style="stop-color:#0f172a;stop-opacity:1" />
      <stop offset="100%" style="stop-color:#1e293b;stop-opacity:1" />
    </linearGradient>
  </defs>
  <rect width="${OG_WIDTH}" height="${OG_HEIGHT}" fill="url(#bg)"/>

  <!-- Logo in center-left -->
  <g transform="translate(180, 165) scale(1.5)">
    ${logoSvg.toString().replace(/<\?xml[^>]*>/, '').replace(/<svg[^>]*>/, '').replace(/<\/svg>/, '')}
  </g>

  <!-- Text -->
  <text x="550" y="280" font-family="Arial, sans-serif" font-size="80" font-weight="bold" fill="#ffffff">
    AI Maestro
  </text>
  <text x="550" y="360" font-family="Arial, sans-serif" font-size="36" fill="#94a3b8">
    Orchestrate your AI coding agents
  </text>
  <text x="550" y="420" font-family="Arial, sans-serif" font-size="36" fill="#94a3b8">
    from one beautiful dashboard
  </text>
</svg>
`);

// Convert to PNG
sharp(background)
  .png()
  .toFile(join(projectRoot, 'public', 'og-image.png'))
  .then(() => {
    console.log('✅ OG image created: public/og-image.png');
  })
  .catch(err => {
    console.error('❌ Error creating OG image:', err);
    process.exit(1);
  });
