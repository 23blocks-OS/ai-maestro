const IMMUTABLE = [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }]

/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable strict mode to prevent double rendering of terminal
  reactStrictMode: false,

  // Optimize barrel imports for better bundle size
  // This prevents loading all 1,500+ lucide icons when only ~50-100 are used
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
        // Apply to all API routes
        source: '/api/:path*',
        headers: [
          { key: 'Access-Control-Allow-Origin', value: '*' },
          { key: 'Access-Control-Allow-Methods', value: 'GET, POST, PUT, DELETE, PATCH, OPTIONS' },
          { key: 'Access-Control-Allow-Headers', value: 'Content-Type, Authorization' },
          { key: 'Access-Control-Allow-Credentials', value: 'true' },
        ],
      },
      // Built-in avatars never change once shipped. Named one by one because
      // public/avatars also holds face-anchors.json and local *_enhanced.png files, which do.
      { source: '/avatars/:file((?:men|women|robots)_\\d{2}\\.png)', headers: IMMUTABLE },
      { source: '/avatars/:size(128|256)/:file((?:men|women|robots)_\\d{2}\\.webp)', headers: IMMUTABLE },
    ]
  },

  webpack: (config, { isServer }) => {
    // Handle native modules only on server side
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        'node-pty': 'commonjs node-pty',
        'cozo-node': 'commonjs cozo-node',
        // Transformers/ONNX load only in the embedding child process (lib/rag/embedding-worker.mjs).
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
