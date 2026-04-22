/// <reference types="vite/client" />

// CF Worker runtime — process.env is populated by cf-worker-entry.ts
declare const process: { env: Record<string, string | undefined> };

interface ImportMetaEnv {
  readonly VITE_CLERK_PUBLISHABLE_KEY: string;
  readonly VITE_BASE_URL: string;
  readonly VITE_GOOGLE_CLIENT_ID: string;
  readonly VITE_GOOGLE_API_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
