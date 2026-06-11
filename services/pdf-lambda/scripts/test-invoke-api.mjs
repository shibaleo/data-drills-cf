/**
 * Test the Lambda Invoke API path (bypasses Function URL).
 *
 *   $env:AWS_ACCESS_KEY_ID = "..."
 *   $env:AWS_SECRET_ACCESS_KEY = "..."
 *   node scripts/test-invoke-api.mjs
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

const event = {
  version: "2.0",
  rawPath: "/health",
  requestContext: { http: { method: "GET", path: "/health" } },
  headers: {},
};

const res = await client.fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(event),
});

console.log("invoke status:", res.status);
const payload = await res.json();
console.log("lambda response:", payload);
