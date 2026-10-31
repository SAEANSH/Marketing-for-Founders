/** @type {import('next').NextConfig} */
const nextConfig = {
  // Live-preview domains (Arena / E2B) must be allowed to open the dev server
  // in an iframe and call it cross-origin.
  allowedDevOrigins: ["*.e2b.app", "*.arena.ai", "localhost:3000"],

  // README images point at raw.githubusercontent.com / user-images.githubusercontent.com.
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "raw.githubusercontent.com" },
      { protocol: "https", hostname: "user-images.githubusercontent.com" },
      { protocol: "https", hostname: "github.com" },
      { protocol: "https", hostname: "avatars.githubusercontent.com" },
      { protocol: "https", hostname: "camo.githubusercontent.com" },
    ],
  },
};

export default nextConfig;
