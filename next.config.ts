import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV === "development";

// next-pwa needs a CommonJS require
// eslint-disable-next-line @typescript-eslint/no-var-requires
const withPWA = require("next-pwa")({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: isDev, // IMPORTANT: service worker OFF in dev so it doesn't confuse you
});

const nextConfig: NextConfig = {
  // any other settings you had can stay here later
};

export default withPWA(nextConfig);
