import * as path from "path";
import { fileURLToPath } from "url";

export { createApp } from "./app.js";
export type { AppOptions } from "./app.js";

/**
 * Resolve the path to the bundled font asset. Wrappers can use this to
 * configure `createApp({ fontPath: defaultFontPath() })` without knowing
 * the package layout.
 *
 * Note: when this module is bundled by esbuild into the consuming wrapper,
 * `import.meta.url` points to the *bundled output file*, not this source.
 * So this only works if the wrapper does NOT bundle pdf-core (i.e. keeps
 * it as a runtime dep). For bundled wrappers, pass an explicit fontPath.
 */
export function defaultFontPath(): string {
  const __dirname = path.dirname(fileURLToPath(import.meta.url));
  return path.join(__dirname, "..", "assets", "fonts", "yumin.ttf");
}
