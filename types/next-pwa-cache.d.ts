/**
 * Local type declaration for next-pwa/cache.
 *
 * The package ships cache.js but does not always expose a matching declaration
 * file. Keep this file in the project so TypeScript can type-check imports.
 */
declare module "next-pwa/cache" {
  type RuntimeCachingEntry = {
    urlPattern:
      | RegExp
      | string
      | ((
          context: {
            url: URL;
            request: Request;
            event?: ExtendableEvent;
          },
        ) => boolean);
    handler: string;
    method?: string;
    options?: Record<string, unknown>;
  };

  const defaultCache:
    RuntimeCachingEntry[];

  export default defaultCache;
}