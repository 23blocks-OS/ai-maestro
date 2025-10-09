/** @type {import('next').NextConfig} */
const nextConfig = {
  // Disable strict mode to prevent double rendering of terminal
  reactStrictMode: false,

  webpack: (config) => {
    // Handle node-pty native module
    config.externals = config.externals || []
    config.externals.push({
      'node-pty': 'commonjs node-pty',
    })

    return config
  },
}

module.exports = nextConfig
