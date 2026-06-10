# @dd/db-schema

data-drills の Drizzle スキーマ定義の **単一カノニカルソース**。

## 規約

- 新しい DB アクセスコード (CF Worker route / 外部 service / 一回限りスクリプト)
  はすべてこのパッケージから schema を import する。
- DB スキーマを表す Drizzle 定義を別ファイルで **再宣言しない**。過去に
  `services/pdf` が `problem` を再宣言して migration 後に drift を起こした事例
  あり (2026-06-10 Internal Server Error)。同じ罠を避けるためのカノニカル化。
- マイグレーション (`drizzle/manual/*.sql`) と同 PR でこのパッケージも更新する。
  CI が typecheck を回せばスキーマと migration の整合性違反は build 失敗で
  気付ける。

## 使い方

```ts
import { problem, problemFile, subject, level, oauthToken } from "@dd/db-schema";
import { db } from "@/lib/db";
import { inArray } from "drizzle-orm";

const rows = await db.select().from(problem).where(inArray(problem.id, ids));
```

## services/pdf からの利用について

現状 (2026-06-10) `services/pdf` は Render の `rootDir=services/pdf` で build
context が services/pdf 配下に閉じている。workspace package をそのまま
import できないため、`services/pdf/src/lib/db/schema.ts` で `oauthToken` のみ
再宣言している。将来 `services/pdf` が問題系テーブルを参照する必要が出たら、
Render rootDir を repo root に変更 + Dockerfile path 調整して `@dd/db-schema`
を取り込む。それまでは oauth_token は標準的で変化が少ないため許容。
