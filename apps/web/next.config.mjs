/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@schoolos/core", "@schoolos/i18n"],
  serverExternalPackages: ["@schoolos/db", "mongoose", "mongodb"],
};

export default nextConfig;
