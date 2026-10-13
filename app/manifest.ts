import type { MetadataRoute } from 'next'

/**
 * The web app manifest, so a browser can install AI Maestro as an app ("Install app", "Add to Dock",
 * "Add to Home Screen"). Browsers only offer the install over https or on localhost; a dashboard opened
 * through a LAN or Tailscale address is not installable (a phone can still use Add to Home Screen).
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'AI Maestro',
    short_name: 'AI Maestro',
    description: 'Orchestrate fleets of AI coding agents from one dashboard',
    start_url: '/',
    scope: '/',
    display: 'standalone',
    background_color: '#111827',
    theme_color: '#6366f1',
    icons: [
      { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }
}
