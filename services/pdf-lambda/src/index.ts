import * as path from "path";
import { fileURLToPath } from "url";
import { handle } from "hono/aws-lambda";
import { createApp } from "@data-drills/pdf-core";

// Lambda task root is the WORKDIR set in Dockerfile (${LAMBDA_TASK_ROOT}).
// Dockerfile copies assets/ to the package root alongside dist/.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontPath = path.join(__dirname, "..", "assets", "fonts", "yumin.ttf");

const app = createApp({ fontPath });

export const handler = handle(app);
