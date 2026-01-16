/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable strict mode to prevent double rendering of terminal
  reactStrictMode: false,

  // Optimize barrel imports for better bundle size
  // This prevents loading all 1,500+ lucide icons when only ~50-100 are used
  experimental: {
    optimizePackageImports: ['lucide-react'],
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
    ]
  },

  webpack: (config, { isServer }) => {
    // Handle native modules only on server side
    if (isServer) {
      config.externals = config.externals || []
      config.externals.push({
        'node-pty': 'commonjs node-pty',
        'cozo-node': 'commonjs cozo-node',
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
