import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // The desk is a client workspace. The cache-component shell was revealed
  // without event handlers, so filters and case links never ran.
  cacheComponents: false,
  allowedDevOrigins: ["127.0.0.1", "localhost"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
