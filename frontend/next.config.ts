import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  output: process.env.BUILD_STANDALONE === 'true' ? 'standalone' : undefined,
  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'api.slingacademy.com',
        port: ''
      },
      {
        protocol: 'https',
        hostname: 'img.clerk.com',
        port: ''
      },
      {
        protocol: 'https',
        hostname: 'clerk.com',
        port: ''
      }
    ]
  },
  transpilePackages: ['geist'],
  compiler: {
    removeConsole: process.env.NODE_ENV === 'production'
  },
  experimental: {
    serverActions: {
      // LMS 명단(~11k row) 등 대용량 batch upsert 위해 body 한도 상향
      bodySizeLimit: '10mb'
    }
  }
};

export default nextConfig;
