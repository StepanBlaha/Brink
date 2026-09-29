import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "export",
  basePath: "/Brink",
  images: { unoptimized: true },
  trailingSlash: true,
  reactStrictMode: true,
  turbopack: { root: __dirname },
};

export default nextConfig;
