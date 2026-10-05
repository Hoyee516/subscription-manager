import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Keep pages you just visited in the browser for 30 seconds, so switching tabs
    // doesn't ask the server again. Saving anything refreshes them at once.
    staleTimes: { dynamic: 30 },
  },
};

export default nextConfig;
