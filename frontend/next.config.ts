import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // 빌드 산출물 폴더. 개발 서버가 .next 를 쓰는 중에 빌드를 돌리면 읽던 파일이
  // 사라져 서버가 죽는다. NEXT_BUILD_DIR 을 주면 딴 폴더에 써서 둘이 안 부딪힌다.
  distDir: process.env.NEXT_BUILD_DIR || '.next',
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
      // LMS 명단(~11k row) 대용량 batch upsert + 시험 작업형 파일 업로드 최대 20MB
      bodySizeLimit: '25mb'
    }
  }
};

export default nextConfig;
