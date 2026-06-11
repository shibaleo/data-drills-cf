import * as esbuild from "esbuild";

await esbuild.build({
  entryPoints: ["src/index.ts"],
  bundle: true,
  platform: "node",
  target: "node20",
  format: "esm",
  outdir: "dist",
  banner: {
    js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  external: [
    "pdfjs-dist",
    "canvas",
    // AWS Lambda Node runtime provides the SDK at runtime
    "@aws-sdk/*",
  ],
});

console.log("Build complete");
