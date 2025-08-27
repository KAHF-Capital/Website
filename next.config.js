/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  experimental: {
    appDir: false,
  },
  env: {
    POLYGON_API_KEY: process.env.POLYGON_API_KEY,
  },
}

module.exports = nextConfig
