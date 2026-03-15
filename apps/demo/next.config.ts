import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@lang-context/core',
    '@lang-context/store-sqlite',
    '@lang-context/provider-ai-sdk',
  ],
  serverExternalPackages: ['better-sqlite3', 'sqlite-vec'],
}

export default nextConfig
