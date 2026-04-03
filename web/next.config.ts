import path from "node:path";
import { fileURLToPath } from "node:url";

import type { NextConfig } from "next";

/** Ordner dieser Datei (`web/`) — gleicher Bezug wie Vercels `outputFileTracingRoot`, vermeidet Warnungen. */
const webRoot = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  turbopack: {
    root: webRoot,
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
