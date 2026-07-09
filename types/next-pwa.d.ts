declare module "next-pwa" {
  import type { NextConfig } from "next";

  interface PWAOptions {
    dest?: string;
    register?: boolean;
    skipWaiting?: boolean;
    disable?: boolean;
    runtimeCaching?: unknown[];
    [key: string]: unknown;
  }

  function withPWA(
    options?: PWAOptions
  ): (config: NextConfig) => NextConfig;

  export default withPWA;
}