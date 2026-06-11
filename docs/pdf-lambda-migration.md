# PDF レンダリングサービス Lambda 移行提案書

作成日: 2026-06-10
対象: `services/pdf/` (現状 Render Docker, free plan, Singapore)

## 1. 背景

現状の PDF レンダリングサービスは Render の free プランの Docker サービスとしてホストされている。用途は **export のみ** (選択問題の印刷用 PDF レンダリング) で、PDF スキャン / 抽出 / 一括 import は外部 Python ツール (`G:\マイドライブ\root\taxtant`) に移管済み。

free プランの主な制約:

- アイドル後の **コールドスタートが約 1 分**
- 実質シングルインスタンス (並行処理ボトルネック)
- メモリ / CPU の上限が固定で、重い OCR ・フォント同梱には窮屈

ワークロード特性:

- 散発的 (毎日連続して走るものではない)
- 1 リクエストの処理時間は短く、**15 分を超えない**
- 常駐サーバである必要はない (イベント駆動で十分)

## 2. 妥当性の照合

| 制約 | Lambda の上限 | data-drills の要件 | 判定 |
| --- | --- | --- | --- |
| 実行時間 | 最大 15 分 | 数十秒〜数分 | OK |
| メモリ | 128 MB 〜 10,240 MB | OCR 用に 2〜3 GB 想定 | OK (Render free より自由) |
| イメージサイズ | 最大 10 GB | Ghostscript / poppler / fonts 同梱前提 | OK |
| /tmp | 最大 10 GB | PDF 中間ファイル展開 | OK |
| コールドスタート | 数秒〜十数秒 (コンテナ) | 現状 約 1 分を許容済み | 改善 |
| 同時実行 | アカウント上限まで自動水平スケール | 複数 PDF 並列投入 | 改善 |

15 分制限 (唯一の本質的ブロッカー候補) はクリア。

## 3. アーキテクチャ

### 方針: handler 方式 (Web Adapter は使わない)

常駐不要が確定しているため、AWS 提供の Node ベースイメージ (`public.ecr.aws/lambda/nodejs:NN`) + Runtime Interface Client で **handler を実装**する正攻法に倒す。常駐サーバ維持のためのロジックを持たなくて済み、イメージも実装もシンプル。

```
data-drills CF Worker
  └─ POST /api/v1/pdf-export (proxy)
       └─ Lambda Function URL (公開エンドポイント、API Gateway なし)
            └─ Container image (ECR)
                 ├─ Node runtime + handler
                 ├─ Ghostscript / poppler / fonts
                 └─ /tmp で中間ファイル展開
```

認証は現行と同じ `x-pdf-service-key` ヘッダ方式を維持。

### handler 化

現 `services/pdf/` の HTTP エントリポイントを `handler(event, context)` シグネチャに書き換える。Hono ベースなら `hono/aws-lambda` で最小改修、素の Node なら handler 直書き。ローカル検証は **Runtime Interface Emulator (RIE)** で行う。

## 4. コスト試算

### Always Free 枠 (期限なし、新規/既存問わず適用)

- リクエスト: 100 万回/月
- コンピュート: **40 万 GB 秒/月** ← 拘束条件
- HTTP レスポンスストリーミング: 100 GiB/月

### 拘束条件は GB 秒

`割り当てメモリ(GB) × 実行時間(秒) × 実行回数` で決まる。data-drills の export ワークロードは散発なので試算:

| メモリ | 1 ジョブ実行時間 | 1 回あたり GB 秒 | 月あたり無料枠内回数 |
| --- | --- | --- | --- |
| 2 GB | 5 秒 | 10 | 約 40,000 回 |
| 3 GB | 10 秒 | 30 | 約 13,000 回 |
| 1 GB | 3 秒 | 3 | 約 133,000 回 |

個人利用の export 頻度では **無料枠で完全に収まる見込み**。

### 別課金項目

- ECR ストレージ: 約 $0.10/GB·月 (イメージサイズ次第で月数十円オーダー)
- データ転送: アウトバウンドのみ少額

## 5. リスク

| リスク | 影響 | 対策 |
| --- | --- | --- |
| コールドスタート時の INIT が GB 秒に課金される | 散発起動で地味に消費 | メモリを盛りすぎない、必要なら Provisioned Concurrency (ただし有料) |
| イメージサイズが大きいと初回 pull が遅い | コールドスタートのテール伸長 | 不要な OCR 言語パック削除、レイヤ分割 |
| Lambda Function URL は API Gateway 機能を持たない | レート制限なし | CF Worker 側で API key + 簡易レート制御 |
| AWS アカウント未整備 | 移行ブロッカー | 個人アカウント作成 + IAM 最小権限ロール準備 |

## 6. 移行ステップ

1. **AWS アカウント / IAM 整備**
   - ECR push 権限、Lambda 作成権限を持つデプロイ用 IAM ユーザ
2. **`services/pdf/` の handler 化**
   - HTTP エントリ → `handler(event, context)` に置換
   - RIE でローカル動作確認
3. **Dockerfile を Lambda ベースイメージに切り替え**
   - `FROM public.ecr.aws/lambda/nodejs:NN`
   - Ghostscript / poppler / fonts インストール
4. **ECR に push → Lambda 関数作成 (コンテナイメージ指定)**
   - メモリ 2 GB (初期値、計測して調整)
   - タイムアウト 5 分 (export 想定)
   - 環境変数で `x-pdf-service-key` を設定
5. **Function URL を有効化**
6. **CF Worker の `/api/v1/pdf-export` プロキシ先を切り替え**
   - 環境変数 `PDF_SERVICE_URL` を Lambda Function URL に
7. **本番疎通確認後も Render サービスは停止せずフォールバックとして温存** (詳細は §9)

## 7. 検証項目

- [ ] handler がローカル RIE で動作する
- [ ] コールドスタート時間を実測 (目標: 30 秒以内)
- [ ] ウォーム実行時のレイテンシ (目標: Render 比で改善)
- [ ] 最大想定 PDF サイズで OOM しないメモリ設定の決定
- [ ] CF Worker からの認証ヘッダが透過する
- [ ] Render サービス停止後 1 週間運用して GB 秒消費を計測 (無料枠内確認)

## 8. Render フォールバック温存方針

移行後も **現状の Dockerfile on Render (free plan) は停止せず、フォールバック経路として残す**。

### 理由

- Lambda 側で予期せぬエラー (handler バグ、AWS 側障害、IAM 設定ミス等) が出た際、即時に切り戻せる経路が必要
- 無料枠 (40 万 GB 秒/月) を超過した際の **課金回避用の退避先** として機能させる
- Render free plan は無料なので温存コストはゼロ (コールドスタート 1 分の劣化は許容済み)

### 実装方針

- CF Worker の `/api/v1/pdf-export` プロキシに **プライマリ (Lambda) / フォールバック (Render) の 2 系統 URL** を持たせる
- 環境変数: `PDF_SERVICE_URL_PRIMARY` (Lambda Function URL) / `PDF_SERVICE_URL_FALLBACK` (Render)
- フォールバック発動条件:
  - プライマリが 5xx / タイムアウトを返した場合に自動で fallback URL へリトライ
  - 手動切り替え用に `PDF_SERVICE_FORCE_FALLBACK=true` フラグも用意 (無料枠枯渇を検知した際の緊急避難)
- Render サービスは現状のまま稼働させ続け、Dockerfile / 認証ヘッダ仕様も維持
- 月次で GB 秒消費を確認し、枯渇傾向が見えたら早めに手動フォールバックへ切り替え

### 撤退条件

Lambda 運用が安定し、かつ以下のいずれも満たした時点で Render 停止を再検討する:

- 3 ヶ月以上、月次 GB 秒消費が無料枠の 50% 未満
- Lambda 側で重大インシデント 0 件
- 切り戻し経路として別手段 (例: 別 AZ / 別アカウント) を確保済み

それまでは Render を残す。

## 8b. 既知の制限 — 新規 AWS アカウントの Function URL block (2026-06-11)

2026-06-11 に Lambda + Function URL (AWS_IAM auth) で構築完了 → SigV4 で叩くと AuthType / Principal / IAM policy すべて正しいにもかかわらず 403 AccessDeniedException が返る現象を確認。

切り分け結果:

- Function URL config: `AuthType: AWS_IAM`, CORS disabled, BUFFERED ✓
- 関数本体: `aws lambda invoke` で正常応答 ✓
- cf-worker-invoker の identity policy + resource-based policy 両方 attach 済 ✓
- aws4fetch / curl --aws-sigv4 両方で同じ 403
- admin (AdministratorAccess) credentials でも同じ 403

→ **AWS 新規アカウントの隠し制限**と判断 (UI には警告バナーが出ないが、AccountLimit の `UnreservedConcurrentExecutions: 10` と同様、新規アカウントは一定期間 Function URL 公開アクセスが block される模様)。

### 対応

- CF Worker 側の `pdf-export.ts` は Lambda 403 を fallback トリガに含めるよう実装済 (`shouldFallback()`)
- 結果として Lambda が block されていても **Render 経由で本番 UX は維持**
- ローカル再試行用: `services/pdf-lambda/scripts/test-sigv4.mjs`
- **24〜72h 後に同じスクリプトで再試行**、200 が返ったら自動で本番が Lambda 経路に切り替わる (コード変更不要)

## 9. 補足: 採用しなかった代替案

- **Web Adapter 方式**: 常駐サーバを生かす方針。常駐不要が確定したので採用しない。
- **API Gateway + Lambda**: レート制御や WAF が必要になるまで Function URL で十分。
- **Cloud Run / Fly.io 等**: AWS 無料枠の手厚さと、PDF 用ネイティブ依存を 10 GB イメージに同梱できる柔軟性が決め手。
