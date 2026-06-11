import * as esbuild from "esbuild";
import * as fs from "fs";
import * as path from "path";
import * as url from "url";
import archiver from "archiver";

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));

// ── 1. Bundle handler with esbuild ──────────────────────────────────────────
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
console.log("esbuild: dist/index.js written");

// ── 2. Stage fonts next to dist/ (matches __dirname/.. resolution) ──────────
const assetsSrc = path.join(__dirname, "..", "pdf-core", "assets");
const assetsDst = path.join(__dirname, "assets");
fs.rmSync(assetsDst, { recursive: true, force: true });
fs.cpSync(assetsSrc, assetsDst, { recursive: true });
console.log("assets/ staged from pdf-core");

// ── 3. Write minimal package.json so Lambda treats .js as ESM ───────────────
const zipPkg = { type: "module" };
fs.writeFileSync(
  path.join(__dirname, "dist", "package.json"),
  JSON.stringify(zipPkg, null, 2),
);

// ── 4. Zip dist/ + assets/ → lambda.zip ─────────────────────────────────────
// Layout in zip:
//   dist/index.js   (handler: "dist/index.handler")
//   dist/package.json
//   assets/fonts/yumin.ttf
const zipPath = path.join(__dirname, "lambda.zip");
fs.rmSync(zipPath, { force: true });

await new Promise((resolve, reject) => {
  const output = fs.createWriteStream(zipPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  output.on("close", resolve);
  archive.on("error", reject);
  archive.pipe(output);
  archive.directory(path.join(__dirname, "dist"), "dist");
  archive.directory(path.join(__dirname, "assets"), "assets");
  archive.finalize();
});

const sizeMB = (fs.statSync(zipPath).size / 1024 / 1024).toFixed(2);
console.log(`lambda.zip written (${sizeMB} MB)`);
