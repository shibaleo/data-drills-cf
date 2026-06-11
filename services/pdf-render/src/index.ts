import { serve } from "@hono/node-server";
import * as path from "path";
import { fileURLToPath } from "url";
import { createApp } from "@data-drills/pdf-core";

// Resolve font path relative to this package's dist/ directory so it works
// regardless of cwd. Dockerfile copies assets/ next to dist/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontPath = path.join(__dirname, "..", "assets", "fonts", "yumin.ttf");

const app = createApp({ fontPath });

const port = Number(process.env.PORT) || 3000;
console.log(`PDF service listening on port ${port}`);
serve({ fetch: app.fetch, port });
