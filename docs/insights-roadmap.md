# インサイト / Throughput 分析 ロードマップ

学習効率化に直結する可視化指標と UI 配置の検討メモ。  
(2026-05-29 セッションで合意した方向性をまとめたもの)

---

## 1. 現状の throughput 可視化が答えていない問い

throughput chart は「**何を解いたか**」を時系列で見せるだけで、**意味づけ**がない。

| ユーザーが本当に知りたいこと | 現状の答え |
|---|---|
| 復習は効いているか? (Miss だった問題が次に Fair になっている割合) | 見えない |
| 自分の弱点はどこか? (Subject / Level 別の Miss 集中) | filter で見るのは可能だが集計表示なし |
| 同じ問題で何回詰まっているか? | answer 履歴を 1 問ずつ開けば分かる、横断不可 |
| 今のペースで milestone に間に合うか? | backlog の overflow ピンで「現時点で超過」は分かる。"このペースだといつ着くか" は無い |
| Done になった問題は本当に "Done" のままか? (decay) | 見えない |
| この status の私の stability_days は妥当か? | 設定は出来るが根拠データなし |
| 1 問あたりの所要時間は短くなっているか? (上達指標) | answer.duration はあるが推移可視化なし |

**結論**: throughput は "log viewer" の域。**学習を変える signal 化**ができていない。

---

## 2. 学習効率化に直結する指標 (優先順)

### ★★ A. ステータス遷移マトリクス (Miss → Fair の確率等)

**最重要・最初に作るべき指標**。

これが無いと「復習が効いている」ことが measurable じゃない。

- 同じ problem の連続 2 回の answer ペア (n→n+1) を全部集める
- prev_status × next_status のクロス表を出す
- 例:

|         | Miss | Rough | Fair | Fluent | Done |
|---------|------|-------|------|--------|------|
| Miss    | 25%  | 33%   | 42%  | -      | -    |
| Rough   | 18%  | 22%   | 38%  | 22%    | -    |
| Fair    | 8%   | 14%   | 28%  | 36%    | 14%  |
| Fluent  | 5%   | 10%   | 15%  | 30%    | 40%  |
| Done    | 2%   | 5%    | 8%   | 25%    | 60%  |

- 行 = 前回 status (prev_status_name)、列 = 今回 status (status_name)
- **非対称行列** (上昇は復習が効いている / 降下は decay)
- このマトリクスが「**理想形** (右下三角に分布)」から外れていれば学習が固着している

**行動を変える例**:
- Miss → Miss の確率が 50%超 → 「同じ問題を闇雲に繰り返さず、教科書に戻る」習慣を形成
- Done → Fair/Rough の確率が高い → stability_days を伸ばしすぎている (decay)
- 右上 (急上昇) が多い → 復習間隔を広げられる可能性

**実装データ**: [routes/throughput.ts](../src/routes/throughput.ts) の LAG ベースの prev_status_* を既に取得済。クライアント集計のみで構築可能。

**UI 配置案**: Throughput 詳細の上部 summary 領域 (5x5 の小テーブル + 期間切替: 過去 7d / 30d / All time)

---

### ★★ B. "Stuck" 問題リスト (= 同じ status で N 回以上 ループ)

復習だけでは抜けない問題。**別アプローチ (教科書、他者に質問、簡単な類題で基礎固め) が必要なシグナル**。

- 同 problem の直近 N 回 (例: 3 回) が同じ status (or Miss/Rough 内ループ) で抽出
- top 10 を Review ページの "Stuck" タブとして出す
- 各行: problem + 直近 status 履歴 + total 経過日数

**行動を変える例**: 闇雲な復習回数を減らし、解説精読 / 類題 / 質問に切替

**UI 配置案**: Review 詳細に "Stuck" タブ (今日の review と並列)

---

### ★★ C. Subject × Status ヒートマップ (弱点 mapping)

Subject × Status (Miss/Rough/Fair/Fluent/Done) の問題数マトリクス。

- 赤いセル (Miss/Rough 大) が「弱い領域」
- セルクリックで該当 problem 一覧へジャンプ
- 「次にどこから手をつけるか」が一目

**実装データ**: 既存 problems-list の最新 status をフィルタするだけ。

**UI 配置案**: 新規 `/insights` or Throughput summary 領域

---

### ★★ D. ペース予測 (milestone 着地予想)

backlog の milestone 達成可否を、**直近 N 日のペースで外挿** して "+15 日遅延" のように出す。

- 直近 7/14/30 日の "完了問題/日" 平均 × milestone date 残日数 = 到達想定
- milestone 別に "現状ペースなら -3 日早着 / +12 日遅延" を表示
- 既存の milestone.target と allocate() ロジックを流用可

**行動を変える例**: 「あと 12 日遅れる → 1 日 +3 問必要 / もしくは milestone を後ろ倒し」を主体的に判断

**UI 配置案**: Backlog 詳細の D-deadline pill の隣 (`D-124 / +12d 遅延`)

---

### ★ E. 所要時間トレンド (= 上達度)

同 problem の duration 推移、または subject 全体の平均 duration の推移。**短くなっているなら上達**、横ばいなら別の問題。

- スパークラインで subject 別 7 日平均 duration を表示
- 個別 problem 詳細にも軌跡を入れる

**UI 配置案**: 個別 problem 詳細 dialog 内 + Throughput summary 領域

---

### ◯ F. Done 問題の retention 観測 (decay 検出)

Done になった問題が次に "格下げ" される確率と時間 = 真の長期記憶率。

- "Done → Fair → Rough → Miss" にどれくらい時間がかかったか、% は
- stability_days の妥当性を**データで検証**できる (現状は経験則だけ)

**UI 配置案**: 専用 small panel (頻度低、深掘り用)

---

### ◯ G. 連続日数 / consistency

ストリーク・週次達成率。動機づけのみ、行動変容は弱い。サイドバーに小さく出す程度で十分。

---

## 3. UI 配置サマリ

| 指標 | どこに置く |
|---|---|
| A. 遷移マトリクス | Throughput 詳細の上部 summary 領域 (5x5 の小テーブル) |
| B. Stuck リスト | Review 詳細に "Stuck" タブ (今日の review と並列) |
| C. Subject×Status ヒートマップ | 新規 `/insights` or Throughput summary 領域 |
| D. ペース予測 | Backlog 詳細の D-deadline pill の隣に "+12d" |
| E. 所要時間トレンド | 個別 problem 詳細 dialog 内 + Throughput summary |
| F. Done retention | 専用 small panel (頻度低、深掘り用) |
| G. ストリーク | サイドバーの小バッジ |

**重要原則**: **専用の `/dashboard` を作らず、既存ページに織り込む** のが筋。理由:

- 学習中に dashboard を「見に行く」習慣は続かない
- 文脈の近いところに data を出せば、決定 (= 次に何をする) と直結する
- 例: Review 開いたら "Stuck" タブが見える → そこから対応 → 流れが切れない

例外: **週次振り返り用に軽い `/insights`** はあってもいい。ただ毎日見るものではない。

---

## 4. データ可用性チェック

| 指標 | 必要データ | 既にあるか |
|---|---|---|
| A. 遷移マトリクス | answer の prev/next status | ✓ throughput route で既に LAG 計算済 |
| B. Stuck リスト | answer 履歴のループ検出 | ✓ problems-list で answers 取得済 |
| C. Subject×Status | 各 problem の最新 status + subject | ✓ |
| D. ペース予測 | 直近 N 日の完了率 + milestone | ✓ allocate() + answer 履歴 |
| E. 所要時間トレンド | answer.duration の時系列 | ✓ |
| F. Done retention | answer 履歴 (status 推移) | ✓ |
| G. ストリーク | 各日に answer があるか | ✓ |

**全部既存データで作れる**。新規 endpoint も追加不要 (problems-list と throughput で十分)。クライアント集計で全部済む。

---

## 5. 推奨優先順 (ROI 順)

1. **A. ステータス遷移マトリクス** — 5x5 の小表 1 つ。実装軽。価値最大 (復習効果の可視化)
2. **D. ペース予測** — backlog D pill を `D-124 / +12d 遅延` に拡張するだけで効く
3. **B. Stuck リスト** — Review に新タブ。"何を変えるべきか" 判断に直結
4. **C. Subject×Status ヒートマップ** — 弱点視覚化。学習計画に反映できる
5. **E. 所要時間トレンド** — 上達の手応え (動機づけ + 過小評価防止)

後回しで OK:

- F. Done retention (深掘り需要が出てから)
- G. ストリーク (動機づけのみ、行動変容寄与は弱い)
- 新規 dashboard ページ (織り込みで足りる)

---

## 6. UX の罠 (避けるべきこと)

- **棒グラフ・円グラフだらけの dashboard** → 見るだけで満足する罠。**「ここをクリック → 行動」を伴うアフォーダンスを設計に組み込む**
- **過剰なゲーミフィケーション** (バッジ・XP) → 学習動機が外発化する弊害
- **平均値だけ出す** (1 人 1 ワールドの中央値は意味薄) → 推移・分布で見せる
- **インサイトを「綺麗に」出そうとして時間切れ** → 5x5 のテキスト表で十分価値あり

---

## 7. 設計思想

**「集計を増やす」ではなく「行動を変える signal を最小限で出す」**。

throughput chart のような "log viewer" を増やしても学習効率は上がらない。
ユーザーが見た直後に「次に何をするか」が変わる情報だけを出す。
