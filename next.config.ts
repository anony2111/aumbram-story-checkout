import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    /*
     * Inlines the route's CSS into the HTML.
     *
     * On Slow 4G the stylesheet is a second round trip before anything can
     * paint, and at 150 ms RTT that was about 800 ms of a 2.1 s First
     * Contentful Paint. The app's CSS is small enough (a few KB per route) that
     * carrying it in the document is cheaper than fetching it, and it costs
     * cacheability across navigations rather than correctness.
     */
    inlineCss: true,
  },
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
