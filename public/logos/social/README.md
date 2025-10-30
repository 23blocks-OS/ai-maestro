# AI Maestro Social Media Logos

This directory contains AI Maestro logos in various formats optimized for different social media platforms.

## Generated Files

All logos were automatically generated from the SVG source files using `scripts/generate-social-logos.js`.

### Profile Pictures (Square)

- **YouTube**: `youtube-profile.png` (800x800)
- **LinkedIn**: `linkedin-logo.png` (300x300)
- **Instagram**: `instagram-profile.png` (320x320) and `instagram-post.png` (1080x1080)
- **TikTok**: `tiktok-profile.png` (200x200)
- **Twitter/X**: `twitter-profile.png` (400x400)
- **Facebook**: `facebook-profile.png` (180x180)

### Banners & Share Images (Rectangular)

- **LinkedIn**: `linkedin-banner.png` (1200x627) - For share/post images
- **Twitter/X**: `twitter-card.png` (1200x675) - For Twitter Cards
- **Facebook**: `facebook-share.png` (1200x630) - For share/post images

### Website Icons

- **Open Graph**: `og-image.png` (1200x630) - For `<meta property="og:image">`
- **Favicon**: `favicon.png` (32x32) - Browser tab icon
- **Apple Touch Icon**: `apple-touch-icon.png` (180x180) - iOS home screen icon

## Platform-Specific Usage

### YouTube
- **Profile Picture**: Use `youtube-profile.png`
- Upload to: Studio → Customization → Branding

### LinkedIn
- **Company Logo**: Use `linkedin-logo.png`
- **Share Images**: Use `linkedin-banner.png` for posts and articles
- Upload to: Company Page → Settings → Branding

### Instagram
- **Profile Picture**: Use `instagram-profile.png`
- **Square Posts**: Use `instagram-post.png` as a template/background
- Upload to: Profile → Edit Profile → Change Profile Photo

### TikTok
- **Profile Picture**: Use `tiktok-profile.png`
- Upload to: Profile → Edit Profile → Change Photo

### Twitter/X
- **Profile Picture**: Use `twitter-profile.png`
- **Twitter Cards**: Use `twitter-card.png` for link previews
- Upload to: Profile → Settings → Profile

### Facebook
- **Profile Picture**: Use `facebook-profile.png`
- **Share Images**: Use `facebook-share.png` for posts and links
- Upload to: Page → Edit Page Photo

### Website/Metadata
```html
<!-- Open Graph -->
<meta property="og:image" content="https://ai-maestro.23blocks.com/logos/social/og-image.png" />

<!-- Favicon -->
<link rel="icon" type="image/png" sizes="32x32" href="/logos/social/favicon.png" />

<!-- Apple Touch Icon -->
<link rel="apple-touch-icon" sizes="180x180" href="/logos/social/apple-touch-icon.png" />
```

## Design Details

- **Colors**: Dark blue/slate background (#0f172a) for banners
- **Logo**: Constellation design (interconnected nodes representing AI agent orchestration)
- **Format**: PNG with transparency (except banners which have solid backgrounds)
- **Source**: Generated from `/public/logo-constellation.svg`

## Regenerating Logos

To regenerate all logos (e.g., after updating the SVG source):

```bash
node scripts/generate-social-logos.js
```

**Requirements**: ImageMagick or resvg must be installed:
- macOS: `brew install imagemagick`
- Linux: `apt-get install imagemagick` or `dnf install imagemagick`

## File Sizes

| File | Size | Dimensions |
|------|------|------------|
| youtube-profile.png | 286KB | 800x800 |
| linkedin-logo.png | 67KB | 300x300 |
| instagram-profile.png | 73KB | 320x320 |
| instagram-post.png | 497KB | 1080x1080 |
| tiktok-profile.png | 39KB | 200x200 |
| twitter-profile.png | 99KB | 400x400 |
| facebook-profile.png | 34KB | 180x180 |
| linkedin-banner.png | 17KB | 1200x627 |
| twitter-card.png | 19KB | 1200x675 |
| facebook-share.png | 17KB | 1200x630 |
| og-image.png | 17KB | 1200x630 |
| favicon.png | 4KB | 32x32 |
| apple-touch-icon.png | 34KB | 180x180 |

## Notes

- All profile pictures use the standalone constellation logo for clean, recognizable branding
- Banner images feature the logo centered on a dark slate background
- Transparent PNGs are used for profile pictures to work on any background
- Dimensions follow each platform's current recommended specifications (as of 2025)

---

Generated: 2025-10-29
Script: `/scripts/generate-social-logos.js`
