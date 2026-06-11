import * as path from "path";
import { fileURLToPath } from "url";
import { handle } from "hono/aws-lambda";
import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { createApp } from "@data-drills/pdf-core";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const fontPath = path.join(__dirname, "..", "assets", "fonts", "yumin.ttf");

const s3Bucket = process.env.PDF_S3_BUCKET ?? "data-drills-pdf-export-shibaleo";
const s3 = new S3Client({}); // region/credentials inherited from Lambda env

const app = createApp({
  fontPath,
  delivery: {
    mode: "s3",
    keyPrefix: "exports/",
    upload: async (key, body, contentType) => {
      await s3.send(new PutObjectCommand({
        Bucket: s3Bucket,
        Key: key,
        Body: body,
        ContentType: contentType,
      }));
    },
  },
});

export const handler = handle(app);
