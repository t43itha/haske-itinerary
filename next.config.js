/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Ensure heavy Node-only libs aren't bundled in RSC/route workers
    serverComponentsExternalPackages: [
      '@react-pdf/renderer',
      'puppeteer',
      'puppeteer-core',
      '@sparticuz/chromium',
      'pdf-parse',
      'mailparser',
      'openai',
      'groq-sdk',
    ],
  },
  webpack: (config, { isServer }) => {
    // Optimize memory usage
    config.optimization = {
      ...config.optimization,
      splitChunks: {
        ...config.optimization.splitChunks,
        cacheGroups: {
          ...config.optimization.splitChunks.cacheGroups,
          framework: {
            chunks: 'all',
            name: 'framework',
            test: /(?<!node_modules.*)[\\/]node_modules[\\/](react|react-dom|scheduler|prop-types|use-subscription)[\\/]/,
            priority: 40,
            enforce: true,
          },
          lib: {
            test(module) {
              return (
                module.size() > 160000 &&
                /node_modules[/\\]/.test(module.identifier())
              )
            },
            chunks: 'all',
            priority: 30,
            minChunks: 1,
            reuseExistingChunk: true,
          },
        },
      },
    }

    // Reduce memory pressure during development
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        net: false,
        tls: false,
      }
    }

    return config
  },
}

module.exports = nextConfig
