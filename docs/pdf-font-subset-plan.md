# PDF font subsetting 実装プラン

作成日: 2026-06-12
状態: 提案。優先度低 (現状 Lambda 経路は無料枠内で動いてる)

## 動機

- 現状 `assets/fonts/yumin.ttf` を full embed (~8MB)。Lambda メモリ 2048MB で問題ないが、将来 **CF Worker (128MB cap) + R2** への移行を視野に入れるなら font 軽量化が前提条件
- 副次効果: PDF ファイルサイズ削減、cold start 高速化、メモリ使用量低減

## 案 1: Per-request dynamic subset

PDF に出現する文字だけを抽出して embed。

### 実装

- ライブラリ: [`subset-font`](https://www.npmjs.com/package/subset-font) (HarfBuzz wasm wrapper) or [`fontkit`](https://github.com/foliojs/fontkit) (pdfkit ecosystem)
- 場所: `services/pdf-core/lib/` に `subsetFont(buffer, usedChars: Set<string>)` を追加
- フロー:
  1. createApp routes 内で PDF content から `usedChars` を集約
  2. `subsetFont(yuminBuffer, usedChars)` で per-request subset 生成
  3. pdf-lib に subset を embed

### 期待効果

- yumin 8MB → 100-500KB (PDF 内容によるが概ね 1-5% に圧縮)
- 初回 wasm init コスト: ~100ms (Lambda warm container では amortize される)

### 注意点

- HarfBuzz wasm ロードでメモリ一時的に膨らむ可能性 (Worker 移行時は要計測)
- 同一 PDF 内でフォントを多重 embed しないよう、subset cache キーは `usedChars` の hash で

## 案 2: Static pre-built subset + 案 1 fallback

事前に joyo + 教育 + kana + ASCII の固定 subset を repo に同梱、動的 subset 失敗時の fallback として使う。

### 実装

- 事前生成: `pyftsubset yumin.ttf --output-file=yumin-subset.ttf --unicodes=U+0020-007E,U+3000-303F,U+3040-309F,U+30A0-30FF,...`
  - 含める範囲: ASCII / 全角記号 / hiragana / katakana / JIS 第一水準 漢字 (約 3,000 字)
  - 期待サイズ: 1-1.5MB
- 場所: `services/pdf-core/assets/fonts/yumin-subset.ttf` として同梱
- フロー:
  1. `usedChars` 集約後、案 1 (dynamic subset) を試行
  2. wasm エラー / メモリ逼迫 / その他 fail で static subset に fallback
  3. static subset に存在しない外字があれば warn ログ + 当該 PDF は欠落覚悟で生成 (or full font に再 fallback)

### 期待効果

- 動的 subset 失敗時の耐障害性
- Worker 経路の primary 化前提なら、static の方が予測可能 (cold start 安定)

### 注意点

- 簿記/会計の特殊文字 (旧字体、業界記号) が抜ける可能性。実 PDF サンプルで字種洗い出し必須
- 静的 subset は build 時に生成して repo にコミット (pyftsubset を CI に組み込むか手動)

## 移行ステップ案

1. **計測**: 現状の PDF 1 件あたりのメモリ使用 / 生成時間 / output サイズを baseline 化
2. **案 1 を pdf-core に実装** (Lambda 経路で動作確認)
3. **案 2 の static subset 生成スクリプト** を `scripts/build-font-subset.sh` などに用意
4. **fallback 機構** を案 1 に組み込み
5. (将来) Worker + R2 経路を新規 wrapper として実装、Lambda を fallback に降格

## 将来見通し

軽量化が完了すれば、`services/pdf-worker/` を追加して CF Worker primary、Lambda fallback への逆転構成が現実味を帯びる。R2 staging は S3 と同じ presigned URL パターンで CF Worker→R2 GET も SigV4 不要 (Worker bindings 直接アクセス) になるので、staging 周りもシンプル化される。
