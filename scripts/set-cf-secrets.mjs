// prod runtime secret を CF Worker Secret へ push する。
//
// 実行: `pnpm secrets:prod` = dotenv -e .env.local -- node scripts/set-cf-secrets.mjs
//   (bws でラップしない。BWS_ACCESS_TOKEN を持った状態でこのスクリプトが bws を per-project で呼ぶ)
//
// secret の2分類を storage で混ぜない:
//   - app runtime secret (src/lib/env.ts の getter 群) → prod-secrets から read
//   - wrangler の CF 認証 (CLOUDFLARE_API_TOKEN)        → hub から注入
//   bws run はネスト不可なので、両者を別々の単一プロジェクト呼び出しで扱い、値は stdin で wrangler へ。
//
// 値は標準出力に出さない (メモリ内→wrangler stdin のみ)。DRY_RUN=1 で wrangler を呼ばず疎通だけ確認。
// (旧 scripts/set-cf-secrets.sh は .env 読み取り + wrangler login 前提だったため本スクリプトで置換)
import { execFileSync, spawnSync } from "node:child_process";

const WORKER = "data-drills-cf";
const HUB = "b49ccb02-f02b-4c7e-a4c1-b48e005732fc";        // ops token (CLOUDFLARE_API_TOKEN)
const PROD = "16c74c07-0fb8-468a-8606-b48e01757644";       // app runtime secrets
// DATABASE_URL(=Hyperdrive) を除いた Worker runtime secret (src/lib/env.ts 準拠)
const KEYS = ["CLERK_SECRET_KEY", "GOOGLE_DRIVE_CLIENT_SECRET", "PDF_SERVICE_KEY", "NEON_DATABASE_URL"];
const sh = process.platform === "win32";
const DRY = process.env.DRY_RUN === "1";

let byKey;
try {
  const arr = JSON.parse(execFileSync("bws", ["secret", "list", PROD, "-o", "json"], { shell: sh }).toString());
  byKey = Object.fromEntries(arr.map((s) => [s.key, s.value]));
} catch (e) {
  console.error("✗ bws secret list (prod) 失敗:", e.message.split("\n")[0]);
  process.exit(1);
}

let failed = false;
for (const key of KEYS) {
  const value = byKey[key];
  if (!value) { console.error(`✗ ${key}: prod-secrets に無い`); failed = true; continue; }
  if (DRY) { console.log(`• ${key}: resolved from prod-secrets — DRY_RUN, wrangler 呼ばず`); continue; }
  const status = spawnSync(
    "bws",
    ["run", "--project-id", HUB, "--", "npx", "wrangler", "secret", "put", key, "--name", WORKER],
    { input: value, stdio: ["pipe", "inherit", "inherit"], shell: sh },
  ).status;
  if (status === 0) console.log(`✓ ${key} → ${WORKER}`);
  else { console.error(`✗ ${key}: wrangler secret put 失敗`); failed = true; }
}
process.exit(failed ? 1 : 0);
