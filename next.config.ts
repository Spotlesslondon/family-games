import type { NextConfig } from "next";

// The build every phone should be running. A phone that loaded the app before
// a deploy keeps the old screens while the server moves on (seen on Joshua's
// phone, 20 Nov 22:47: the old "Watching this one" over the new briefing
// phase). Every API answer carries the build; the phone reloads when it differs.
const BUILD = process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) ?? "dev";

const nextConfig: NextConfig = {
  env: { NEXT_PUBLIC_BUILD: BUILD },
  async headers() {
    return [{ source: "/api/:path*", headers: [{ key: "x-asher-build", value: BUILD }] }];
  },
  cacheComponents: true,
  partialPrefetching: true,
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
