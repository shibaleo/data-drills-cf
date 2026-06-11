/**
 * Direct SigV4 test against the Lambda Function URL using the SAME library
 * (aws4fetch) that CF Worker uses. Run with:
 *
 *   $env:AWS_ACCESS_KEY_ID = "..."
 *   $env:AWS_SECRET_ACCESS_KEY = "..."
 *   node scripts/test-sigv4.mjs https://4ydr7....lambda-url.ap-northeast-1.on.aws
 */
import { AwsClient } from "aws4fetch";

const url = process.argv[2];
if (!url) {
  console.error("usage: node test-sigv4.mjs <function-url>");
  process.exit(1);
}

const client = new AwsClient({
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: "ap-northeast-1",
  service: "lambda",
});

const res = await client.fetch(`${url.replace(/\/$/, "")}/health`);
console.log("status:", res.status);
console.log("body:", await res.text());
