/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable strict mode to prevent double rendering of terminal
  reactStrictMode: false,

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
      })
    }

    return config
  },
}

module.exports = nextConfig
