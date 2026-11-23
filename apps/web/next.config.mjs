/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@schoolos/core", "@schoolos/i18n"],
  experimental: {
    serverComponentsExternalPackages: ["@schoolos/db", "mongoose", "mongodb"],
  },
};

export default nextConfig;
