/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable strict mode to prevent double rendering of terminal
  reactStrictMode: false,

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
