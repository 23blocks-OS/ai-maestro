/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable strict mode to prevent double rendering of terminal
  reactStrictMode: false,

  // Optimize barrel imports for better bundle size
  // This prevents loading all 1,500+ lucide icons when only ~50-100 are used
  // Note: optimizePackageImports is stable since Next.js 14.2 but still under experimental key
  experimental: {
    optimizePackageImports: ['lucide-react'],
  },

  // Increase memory limits for Linux systems with less RAM
  // This helps prevent OOM crashes during builds
  onDemandEntries: {
    // Keep pages in memory longer (default: 15000ms)
    maxInactiveAge: 60 * 1000,
    // Max pages to keep in memory (default: 5)
    pagesBufferLength: 3,
  },

  // CORS headers for Manager/Worker architecture
  // Workers need to allow cross-origin requests from managers
  // Security handled by Tailscale VPN + firewall (see REMOTE-SESSIONS-ARCHITECTURE.md)
  async headers() {
    return [
      {
        // Security headers for all routes
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
        ],
      },
      {
        // CORS headers for API routes (cross-host mesh + agent auth)
        // SECURITY NOTE: Allow-Origin: * is required for cross-host mesh (browser on Host A calls Host B API).
        // The TCP IP filter (isAllowedSource) blocks non-Tailscale clients at the network level.
        // Phase 2 (maestro auth) will add Origin validation + session tokens.
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization, X-Agent-Id, X-Host-Id, X-Host-Signature, X-Host-Timestamp' },
        ],
      },
    ]
  },

  webpack: (config, { isServer }) => {
    // Handle native modules only on server side
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        'node-pty': 'commonjs node-pty',
        'cozo-node': 'commonjs cozo-node',
        'better-sqlite3': 'commonjs better-sqlite3',
        // Don't externalize @huggingface/transformers - it's ESM-only and needs webpack bundling
        'onnxruntime-node': 'commonjs onnxruntime-node',
        'sharp': 'commonjs sharp',
        'pg': 'commonjs pg',
        'pg-native': 'commonjs pg-native',
      })
    }

    return config
  },
}

module.exports = nextConfig
