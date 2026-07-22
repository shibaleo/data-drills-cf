/// <reference types="vite/client" />

// CF Worker runtime — process.env is populated by cf-worker-entry.ts
declare const process: { env: Record<string, string | undefined> };

// 公開 config は src/lib/public-config.ts に集約 (VITE_ 環境変数は不使用)。
// import.meta.env.PROD/DEV/MODE の型は vite/client が提供する。
