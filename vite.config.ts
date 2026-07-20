import dotenv from "dotenv";
import { defineConfig, type Plugin, type ViteDevServer } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

/**
 * Vite plugin: serve Hono API routes inside the dev server.
 * Uses ssrLoadModule so Vite's alias resolution and HMR apply.
 */
function honoDevServer(): Plugin {
  return {
    name: "hono-dev-server",
    configureServer(server: ViteDevServer) {
      server.middlewares.use(async (req, res, next) => {
        if (!req.url?.startsWith("/api")) return next();

        try {
          const mod = await server.ssrLoadModule("/src/lib/hono-app.ts");
          const app = mod.default;

          const url = new URL(req.url, `http://${req.headers.host}`);
          const headers = new Headers();
          for (const [key, value] of Object.entries(req.headers)) {
            if (value)
              headers.set(
                key,
                Array.isArray(value) ? value.join(", ") : value,
              );
          }

          let body: Uint8Array | undefined;
          if (req.method !== "GET" && req.method !== "HEAD") {
            body = await new Promise<Uint8Array>((resolve) => {
              const chunks: Buffer[] = [];
              req.on("data", (chunk: Buffer) => chunks.push(chunk));
              req.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks))));
            });
          }

          const request = new Request(url.toString(), {
            method: req.method,
            headers,
            ...(body ? { body } : {}),
          } as RequestInit);

          // local dev は ALS scope に入らず、db/index.ts fallback path の
          // シングルトン client (max=2) を共有する。これで burst でも Neon の
          // 接続上限を圧迫せず queue で捌ける (postgres.js 内で queue)。
          // ungraceful kill 時のゾンビ対策は db/index.ts の cleanup handler 側で対応。
          const response: Response = await app.fetch(request);

          res.statusCode = response.status;
          response.headers.forEach((value: string, key: string) => {
            res.setHeader(key, value);
          });

          const arrayBuffer = await response.arrayBuffer();
          res.end(Buffer.from(arrayBuffer));
        } catch (err) {
          console.error("API error:", err);
          if (!res.headersSent) {
            res.statusCode = 500;
            res.end("Internal Server Error");
          }
        }
      });
    },
  };
}

export default defineConfig(({ command }) => {
  // dev (vite serve) のみ .env を process.env に流し込む。honoDevServer が
  // in-process で走らせる Hono API が DATABASE_URL 等を process.env 経由で読むため。
  // build 時には呼ばない: dotenv が .env を process.env に入れると、Vite は
  // 既存 process.env を .env.production より優先してしまい、pk_live 上書きが効かない。
  if (command === "serve") dotenv.config();

  return {
  plugins: [react(), honoDevServer()],
  resolve: {
    alias: { "@": path.resolve(__dirname, "src") },
  },
  server: { port: 5180 },
  build: {
    // 1.5MB の単一 chunk を vendor 別に割り。React.lazy(codemirror-editor) で遅延読み込み時に
    // codemirror / katex を別々のキャッシュ単位として並列フェッチでき、片方の更新がもう片方の
    // キャッシュを無効化しない。
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules")) {
            if (id.includes("katex")) return "vendor-katex";
            if (id.includes("@codemirror") || id.includes("codemirror-live-markdown") || id.includes("@uiw/react-codemirror") || id.includes("@lezer")) return "vendor-codemirror";
          }
          return undefined;
        },
      },
    },
    chunkSizeWarningLimit: 700,
  },
  };
});
