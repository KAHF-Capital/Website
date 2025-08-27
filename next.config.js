/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  swcMinify: true,
  env: {
    POLYGON_API_KEY: process.env.POLYGON_API_KEY,
  },
}

module.exports = nextConfig
