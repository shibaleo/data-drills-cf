/**
 * Invoke the export endpoint via Lambda Invoke API with a real payload.
 * Uses dummy items to exercise the route path; expect a 200 PDF or a
 * 4xx error from the handler (proves Lambda + handler routing works).
 *
 *   $env:AWS_ACCESS_KEY_ID = "..."
 *   $env:AWS_SECRET_ACCESS_KEY = "..."
 *   $env:PDF_SERVICE_KEY = "..."   # the apiKeyAuth() expected value
 *   node scripts/test-export.mjs
 */
import { AwsClient } from "aws4fetch";

const region = "ap-northeast-1";
const functionName = "pdf-export";
const url = `https://lambda.${region}.amazonaws.com/2015-03-31/functions/${functionName}/invocations`;

const client = new AwsClient({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region,
  service: "lambda",
});

// Empty items will fail input validation with 400; that's expected and proves
// the route is wired. Replace items with a real gdrive_file_id + pages if you
// want to test end-to-end PDF generation.
const body = JSON.stringify({
  items: [],
  filename_stem: "test",
});

const event = {
  version: "2.0",
  rawPath: "/api/v1/pdf-sync/export",
  requestContext: { http: { method: "POST", path: "/api/v1/pdf-sync/export" } },
  headers: {
    "content-type": "application/json",
    "x-pdf-service-key": process.env.PDF_SERVICE_KEY ?? "",
  },
  body,
  isBase64Encoded: false,
};

const res = await client.fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(event),
});

console.log("invoke status:", res.status);
const payload = await res.json();
console.log("lambda response:", payload);
