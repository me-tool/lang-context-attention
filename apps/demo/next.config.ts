import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  transpilePackages: [
    '@llm-context/core',
    '@llm-context/store-sqlite',
    '@llm-context/provider-ai-sdk',
  ],
  serverExternalPackages: ['better-sqlite3', 'sqlite-vec'],
}

export default nextConfig
