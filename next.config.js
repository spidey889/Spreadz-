/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
  customWorkerDir: '__no_custom_worker__',
  importScripts: ['/push-worker.js'],
  runtimeCaching: [],
  buildExcludes: [/./],
})

const nextConfig = {
  reactStrictMode: true,
}

module.exports = withPWA(nextConfig)
