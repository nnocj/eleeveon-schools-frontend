import withPWAInit from "next-pwa";
import defaultCache from "next-pwa/cache";

type WorkboxUrlPatternContext = { url: URL; request: Request; event?: unknown };

const withPWA = withPWAInit({
  dest: "public",
  register: true,
  skipWaiting: true,
  disable: process.env.NODE_ENV === "development",
  cleanupOutdatedCaches: true,
  buildExcludes: [/version\.json$/],
  // The installed-app entry document is essential to an offline cold start.
  // Workbox installs this URL ahead of the first offline launch. No user data
  // should be server-rendered into the /launch document.
  additionalManifestEntries: [{
    url: "/launch",
    revision: process.env.VERCEL_GIT_COMMIT_SHA || process.env.ELEEVEON_BUILD_ID || process.env.npm_package_version || "v1",
  }],
  runtimeCaching: [
    {
      urlPattern: ({ url }: WorkboxUrlPatternContext) =>
        url.origin === self.location.origin && url.pathname === "/version.json",
      handler: "NetworkOnly",
      method: "GET",
    },
    // Separate cache for offline launcher navigation. Other Next routes keep
    // the original next-pwa default caching rules.
    {
      urlPattern: ({ url, request }: WorkboxUrlPatternContext) =>
        url.origin === self.location.origin &&
        url.pathname === "/launch" &&
        request.mode === "navigate",
      handler: "CacheFirst",
      options: {
        cacheName: "eleeveon-launch-documents-v1",
        expiration: { maxEntries: 2, maxAgeSeconds: 30 * 24 * 60 * 60 },
      },
    },
    ...defaultCache,
  ],
});

const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_ELEEVEON_BUILD_ID:
      process.env.ELEEVEON_BUILD_ID ||
      process.env.VERCEL_GIT_COMMIT_SHA ||
      process.env.NEXT_PUBLIC_ELEEVEON_BUILD_ID || "development",
    NEXT_PUBLIC_ELEEVEON_APP_VERSION:
      process.env.ELEEVEON_APP_VERSION ||
      process.env.npm_package_version ||
      process.env.NEXT_PUBLIC_ELEEVEON_APP_VERSION || "0.0.0",
    NEXT_PUBLIC_ELEEVEON_MINIMUM_DB_VERSION:
      process.env.ELEEVEON_MINIMUM_DB_VERSION ||
      process.env.NEXT_PUBLIC_ELEEVEON_MINIMUM_DB_VERSION || "39",
    NEXT_PUBLIC_ELEEVEON_CURRENT_DB_VERSION:
      process.env.ELEEVEON_CURRENT_DB_VERSION ||
      process.env.NEXT_PUBLIC_ELEEVEON_CURRENT_DB_VERSION || "39",
  },
};

export default withPWA(nextConfig);
