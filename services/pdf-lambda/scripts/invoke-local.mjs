/**
 * Invoke the bundled handler locally without Docker / RIE.
 * `hono/aws-lambda`'s handle() expects an API Gateway v2 / Function URL event.
 *
 *   node scripts/invoke-local.mjs                      # GET /health
 *   node scripts/invoke-local.mjs POST /api/v1/pdf-sync/export '{...}'
 */
import { handler } from "../dist/index.js";

const [method = "GET", rawPath = "/health", body] = process.argv.slice(2);

const event = {
  version: "2.0",
  routeKey: "$default",
  rawPath,
  rawQueryString: "",
  headers: {
    "content-type": "application/json",
    "x-pdf-service-key": process.env.PDF_SERVICE_KEY ?? "",
  },
  requestContext: {
    http: { method, path: rawPath, protocol: "HTTP/1.1", sourceIp: "127.0.0.1", userAgent: "local" },
    requestId: "local-" + Date.now(),
  },
  body: body ?? null,
  isBase64Encoded: false,
};

const res = await handler(event, {
  functionName: "pdf-lambda-local",
  functionVersion: "$LATEST",
  invokedFunctionArn: "arn:aws:lambda:local:000000000000:function:pdf-lambda-local",
  memoryLimitInMB: "2048",
  awsRequestId: "local",
  logGroupName: "",
  logStreamName: "",
  getRemainingTimeInMillis: () => 30000,
  done: () => {},
  fail: () => {},
  succeed: () => {},
  callbackWaitsForEmptyEventLoop: false,
});

console.log("status:", res.statusCode);
console.log("headers:", res.headers);
if (res.body) {
  const text = res.isBase64Encoded ? "[base64 binary, " + res.body.length + " chars]" : res.body;
  console.log("body:", text.slice(0, 500));
}
