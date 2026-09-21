import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Mock product imagery. Only these two hosts are ever loaded.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "picsum.photos" },
      { protocol: "https", hostname: "i.pravatar.cc" },
    ],
  },
  async rewrites() {
    return [
      // The App Router treats a leading underscore as a private folder, so the page
      // lives at /debug and is also served at the /__debug path the brief asks for.
      { source: "/__debug", destination: "/debug" },
    ];
  },
};

export default nextConfig;
