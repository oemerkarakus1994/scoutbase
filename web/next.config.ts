import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  turbopack: {
    // Avoid picking a parent folder when multiple package-lock files exist.
    root: process.cwd(),
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "www.oefb.at",
        pathname: "/oefb2/images/**",
      },
      {
        protocol: "https",
        hostname: "vereine.oefb.at",
        pathname: "/vereine3/person/images/**",
      },
    ],
  },
};

export default nextConfig;
