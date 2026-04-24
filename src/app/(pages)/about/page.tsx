"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import { toast } from "sonner";
import { usePageTitle } from "@/lib/page-context";
import { useProject } from "@/hooks/use-project";
import { useUpdateStatus } from "@/hooks/queries/use-statuses";

/* ── KaTeX helpers ── */

function Tex({ children, display }: { children: string; display?: boolean }) {
  const html = useMemo(
    () =>
      katex.renderToString(children, {
        throwOnError: false,
        displayMode: display ?? false,
      }),
    [children, display],
  );
  return <span dangerouslySetInnerHTML={{ __html: html }} />;
}

function TexBlock({ children }: { children: string }) {
  return (
    <div className="rounded-md bg-muted/50 px-4 py-3 my-2 overflow-x-auto">
      <Tex display>{children}</Tex>
    </div>
  );
}

/* ── Inline editable value ── */

function V({
  value,
  onChange,
  suffix,
  fmt,
}: {
  value: number;
  onChange: (v: number) => void;
  suffix?: string;
  fmt?: (v: number) => string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      ref.current?.focus();
      ref.current?.select();
    }
  }, [editing]);

  const display = fmt ? fmt(value) : String(value);

  const commit = () => {
    setEditing(false);
    const n = parseFloat(draft);
    if (!isNaN(n) && draft !== display) onChange(n);
  };

  const startEdit = (e: React.MouseEvent) => {
    if (editing) return;
    e.stopPropagation();
    setDraft(display);
    setEditing(true);
  };

  return (
    <>
      <span className="relative inline-block tabular-nums" onClick={startEdit}>
        <span
          className={
            editing
              ? "invisible"
              : "cursor-text text-primary hover:bg-muted/50 rounded px-0.5"
          }
        >
          {display}
        </span>
        {editing && (
          <input
            ref={ref}
            type="text"
            className="absolute inset-0 bg-transparent border-b border-primary outline-none text-primary tabular-nums px-0.5 min-w-[3ch]"
            style={{ font: "inherit" }}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onBlur={commit}
            onKeyDown={(e) => {
              if (e.key === "Enter") { e.preventDefault(); commit(); }
              if (e.key === "Escape") { e.preventDefault(); setEditing(false); }
            }}
            onClick={(e) => e.stopPropagation()}
          />
        )}
      </span>
      {suffix}
    </>
  );
}


/* ── Page ── */

export default function AboutPage() {
  usePageTitle("About");
  const { statuses } = useProject();
  const updateStatus = useUpdateStatus();

  // Score params
  const [timeCoeff, setTimeCoeff] = useState(0.5);
  const [ceExponent, setCeExponent] = useState(0.5);

  // Retention params
  const [baseStability, setBaseStability] = useState(1);
  const [growthFactor, setGrowthFactor] = useState(0.4);
  const [missPenalty, setMissPenalty] = useState(0.5);

  // FSRS params
  const [fVal, setFVal] = useState(19 / 81);
  const [cVal, setCVal] = useState(-0.5);

  // Schedule adaptation: power of C_T (matches fsrs.ts TIME_COEFF_K)
  const [kVal, setKVal] = useState(2);

  // Derived: max stability for P_i computation
  const maxStab = useMemo(
    () => Math.max(...statuses.map((s) => s.stabilityDays), 1),
    [statuses],
  );

  // First status (lowest sortOrder) for "incorrect" description
  const firstStatus = statuses[0];

  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto">
      <article className="prose prose-sm prose-invert max-w-none space-y-6">
        {/* ── サイト概要 ── */}
        <section>
          <h2 className="text-base font-semibold mb-2">Data Drills とは</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            間隔反復（Spaced Repetition）に基づく問題演習管理ツール。
            解答ごとの自己評価から復習スケジュールを自動算出し、最小限の復習で記憶を定着させることを目的とする。
          </p>
        </section>

        <hr className="border-border" />

        {/* ── 機能一覧 ── */}
        <section>
          <h2 className="text-base font-semibold mb-2">機能一覧</h2>
          <ul className="text-xs text-muted-foreground space-y-2 mt-2">
            <li>
              <span className="text-foreground font-medium">Schedule</span> —
              今日・7日以内の復習対象を一覧表示。Subject / Level / Statusでフィルタし、
              ヘッダーチェックボックスで一括選択。選択した問題の目安時間をリアルタイム表示。
            </li>
            <li>
              <span className="text-foreground font-medium">Problems</span> —
              全問題の一覧。科目・レベル・標準時間をインライン編集可能。解答の登録・編集もここから行う。
            </li>
            <li>
              <span className="text-foreground font-medium">Stats</span> —
              保持率トレンドチャートと問題別の詳細ビュー。FSRS準拠の記憶保持率を推定・可視化。
            </li>
            <li>
              <span className="text-foreground font-medium">Notes</span> —
              Markdown対応のノート機能。ピン留め・ドラッグ&ドロップ並び替え・リスト/グリッド切替に対応。
              問題に関するメモや学習ポイントを自由に記録できる。
            </li>
            <li>
              <span className="text-foreground font-medium">Flashcards</span> —
              問題ごとにフラッシュカードを作成。Markdownで表裏を記述し、保持率バー付きで復習状況を確認しながら暗記できる。
            </li>
            <li>
              <span className="text-foreground font-medium">PDF同期・エクスポート</span> —
              Google DriveのPDFファイル名をパースし、問題コード・科目・レベルを自動認識（トレーニング・テーマ別演習・実力テストに対応）。
              未登録の問題はスキャン結果からワンクリックで一括登録できる。
              登録済みの問題はPDFページを抽出し、ラベル付きで一括エクスポート。
            </li>
            <li>
              <span className="text-foreground font-medium">解答履歴スパークライン</span> —
              各問題の解答履歴を日付間隔を反映したドットで表示。ステータスの色で学習傾向をひと目で把握。
            </li>
          </ul>
        </section>

        <hr className="border-border" />

        {/* ── 評価の定義 ── */}
        <section>
          <h2 className="text-base font-semibold mb-2">ステータス（評価）</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            ステータスは各問題の解答後に自己評価される、問題ごとの状態です。<br />
            {firstStatus && (
              <>不正解の場合はすべて <span style={{ color: firstStatus.color ?? "#888" }}>{firstStatus.name}</span> と評価されます。<br /></>
            )}
            正解の場合は「あと何日くらいこの結果を再現できそうか」を主観で評価します。
          </p>
          <table className="text-xs mt-2 w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="pr-4 py-1 text-left font-medium">評価</th>
                <th className="pr-4 py-1 text-left font-medium">自己判断の基準</th>
                <th className="py-1 text-left font-medium">復習間隔 <Tex>{"I_i"}</Tex></th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {statuses.map((s) => (
                <tr key={s.name} className="border-b border-border/50 last:border-0">
                  <td className="pr-4 py-1" style={{ color: s.color ?? "#888" }}>{s.name}</td>
                  <td className="pr-4 py-1">{s.description ?? ""}</td>
                  <td className="py-1">
                    <V
                      value={s.stabilityDays}
                      onChange={(v) => {
                        const days = Math.max(0, Math.round(v));
                        if (days === s.stabilityDays) return;
                        updateStatus.mutate(
                          { id: s.id, payload: { stability_days: days } },
                          {
                            onError: (err) =>
                              toast.error(`保存に失敗: ${err instanceof Error ? err.message : "unknown"}`),
                          },
                        );
                      }}
                      suffix="日"
                    />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <hr className="border-border" />

        {/* ── Score ── */}
        <section>
          <h2 className="text-base font-semibold mb-2">Score（問題スコア）</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            問題スコアは<strong>評価点</strong> <Tex>{"P_i"}</Tex> を
            <strong>時間係数</strong> <Tex>{"C_T"}</Tex> で増減して計算されます。
          </p>
          <TexBlock>
            {"\\text{Score} = P_i \\times C_T"}
          </TexBlock>
          <div className="grid grid-cols-2 gap-4 mt-3">
            {/* P_i */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                <Tex>{"P_i"}</Tex> : 評価点（復習間隔から導出）
              </p>
              <TexBlock>
                {`P_i = \\left(\\frac{I_i}{I_{\\max}}\\right)^{\\gamma} \\times 100`}
              </TexBlock>
              <p className="text-xs text-muted-foreground -mt-1 mb-1">
                <Tex>{"I_i"}</Tex>: 各評価の復習間隔（<Tex>{"i"}</Tex> = {statuses.map((s) => s.name).join(", ")})
              </p>
              <p className="text-sm text-foreground mt-1">
                <Tex>{"\\gamma"}</Tex> ={" "}
                <V value={ceExponent} onChange={setCeExponent} fmt={(v) => String(v)} />
                <span className="text-xs text-muted-foreground ml-2">
                  Stevens&apos; Power Law — 復習間隔と直感的な点数を対応させる指数
                </span>
              </p>
              <table className="text-xs w-full mt-1">
                <thead>
                  <tr className="border-b border-border">
                    <th className="pr-3 py-1 text-left font-medium">評価</th>
                    <th className="pr-3 py-1 text-left font-medium">
                      <Tex>{"P_i"}</Tex>
                    </th>
                    <th className="py-1 text-left font-medium">
                      <Tex>{"I_i"}</Tex>
                    </th>
                  </tr>
                </thead>
                <tbody className="text-muted-foreground">
                  {statuses.map((s) => {
                    const stab = s.stabilityDays;
                    const pe = maxStab > 0 ? Math.pow(stab / maxStab, ceExponent) * 100 : 0;
                    return (
                      <tr key={s.name} className="border-b border-border/50 last:border-0">
                        <td className="pr-3 py-1" style={{ color: s.color ?? "#888" }}>{s.name}</td>
                        <td className="pr-3 py-1 tabular-nums font-medium">{Math.round(pe)}</td>
                        <td className="py-1 tabular-nums">{stab}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            {/* C_T */}
            <div>
              <p className="text-xs text-muted-foreground mb-1">
                <Tex>{"C_T"}</Tex> : 時間係数
              </p>
              <TexBlock>
                {`C_T = \\frac{c \\cdot t_{\\text{std}}}{t_{\\text{dur}}}`}
              </TexBlock>
              <p className="text-sm text-foreground mt-1">
                <Tex>{"c"}</Tex> ={" "}
                <V value={timeCoeff} onChange={setTimeCoeff} fmt={(v) => v.toFixed(1)} />
              </p>
              <p className="text-sm text-foreground mt-1">
                <Tex>{"c"}</Tex> は標準時間に対する回答時間の目標比率
              </p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed mt-3">
            <Tex>{"\\text{Score} \\geq 100"}</Tex> が基礎問題の完成基準です。
          </p>
        </section>

        <hr className="border-border" />

        {/* ── Retention ── */}
        <section>
          <h2 className="text-base font-semibold mb-2">
            保持率（Retention）
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            保持率は記憶の定着度を0〜100%で推定します。指数減衰モデルを使用し、初期安定性{" "}
            <Tex>{"S_0"}</Tex> ={" "}
            <V value={baseStability} onChange={setBaseStability} suffix="日" />
            {" "}です。
          </p>
          <TexBlock>{"R(t) = e^{\\,-t / S}"}</TexBlock>
          <p className="text-sm text-muted-foreground leading-relaxed">
            <Tex>{"t"}</Tex> = 最終復習からの経過日数、
            <Tex>{"S"}</Tex> = 安定性。
            復習のたびに評価に応じて <Tex>{"S"}</Tex> が成長します。
            成長率 <Tex>{"\\alpha"}</Tex> ={" "}
            <V
              value={growthFactor}
              onChange={setGrowthFactor}
              fmt={(v) => v.toFixed(1)}
            />
          </p>
          <TexBlock>
            {`S' = S \\times \\bigl(1 + (q - 2) \\times ${growthFactor.toFixed(1)}\\bigr)`}
          </TexBlock>
          <table className="text-xs mt-2">
            <thead>
              <tr className="border-b border-border">
                <th className="pr-4 py-1 text-left font-medium">評価</th>
                <th className="pr-4 py-1 text-left font-medium">
                  <Tex>{"q"}</Tex>
                </th>
                <th className="py-1 text-left font-medium">
                  <Tex>{"S"}</Tex> 倍率
                </th>
              </tr>
            </thead>
            <tbody className="text-muted-foreground">
              {statuses.map((s) => {
                const q = s.sortOrder + 1;
                const mult = q < 2
                  ? `\\times ${missPenalty}`
                  : q === 2
                    ? "\\times 1.0"
                    : `\\times ${(1 + (q - 2) * growthFactor).toFixed(1)}`;
                const note = q < 2 ? "（後退）" : q === 2 ? "（維持）" : null;
                return (
                  <tr key={s.name} className="border-b border-border/50 last:border-0">
                    <td className="pr-4 py-1" style={{ color: s.color ?? "#888" }}>{s.name}</td>
                    <td className="pr-4 py-1 tabular-nums">{q}</td>
                    <td className="py-1">
                      {q < 2 ? (
                        <>
                          <V
                            value={missPenalty}
                            onChange={setMissPenalty}
                            fmt={(v) => `\u00d7${v}`}
                          />
                          <span className="text-muted-foreground ml-1">{note}</span>
                        </>
                      ) : (
                        <>
                          <Tex>{mult}</Tex>
                          {note && <span className="text-muted-foreground ml-1">{note}</span>}
                        </>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>

        <hr className="border-border" />

        {/* ── 復習スケジュール ── */}
        <section>
          <h2 className="text-base font-semibold mb-2">
            復習スケジュール
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            最終解答日から復習間隔 <Tex>{"I_i"}</Tex> 日後が次の復習予定日です。
            {firstStatus && (
              <>{firstStatus.name}（<Tex>{"I = 0"}</Tex>）は即日復習が必要です。</>
            )}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Overdue = 今日 - 復習予定日。正の値は期限超過（復習が必要）を意味します。
          </p>

          <div className="mt-4 border-t border-border pt-3">
            <h3 className="text-sm font-semibold mb-1">実効間隔（Duration 補正）</h3>
            <p className="text-sm text-muted-foreground leading-relaxed">
              実際の次回予定日は解答時間 <Tex>{"t_{\\text{dur}}"}</Tex> によって伸縮します。
              <Tex>{"C_T"}</Tex> を <Tex>{"k"}</Tex> 乗することで、同じステータスでも解答時間に応じて実効間隔が散り、同日バッチのスケジュール団子化を防ぎます。
            </p>
            <TexBlock>
              {"I_{\\text{eff}} = I_i \\times C_T^{\\,k}, \\quad C_T = c \\cdot \\frac{t_{\\text{std}}}{t_{\\text{dur}}}"}
            </TexBlock>
            <p className="text-sm text-foreground -mt-1">
              <Tex>{"c"}</Tex> ={" "}
              <V value={timeCoeff} onChange={setTimeCoeff} fmt={(v) => v.toFixed(1)} />
              {"  "}
              <Tex>{"k"}</Tex> ={" "}
              <V value={kVal} onChange={setKVal} fmt={(v) => String(v)} />
              <span className="text-xs text-muted-foreground ml-2">
                実コードでは <Tex>{"c = 0.5, k = 2"}</Tex> 固定
              </span>
            </p>
            <p className="text-xs text-muted-foreground mt-2">
              <strong>基準点</strong>: <Tex>{"r = t_{\\text{dur}}/t_{\\text{std}} = 0.5"}</Tex> で{" "}
              <Tex>{"C_T^{\\,k} = 1"}</Tex> → nominal 通り。
              これは<strong>学習後半（習熟時）</strong>の想定。mastered 状態では解答時間が標準時間の約半分に落ち着く前提で、
              その時に nominal の間隔で復習が来るよう calibrate されています。
              学習初期は <Tex>{"r"}</Tex> が 1 以上に寄るため <Tex>{"C_T^{\\,k} < 1"}</Tex>
              {" "}となり、実効間隔が自動で短縮 → 高頻度復習で定着を促進します。
            </p>
            <table className="text-xs w-full mt-2">
              <thead>
                <tr className="border-b border-border">
                  <th className="pr-3 py-1 text-left font-medium">評価</th>
                  <th className="pr-3 py-1 text-right font-medium">
                    <Tex>{"I_i"}</Tex>
                  </th>
                  <th className="pr-3 py-1 text-right font-medium">
                    習熟<br />
                    <span className="text-[9px] text-muted-foreground">r=0.5</span>
                  </th>
                  <th className="pr-3 py-1 text-right font-medium">
                    学習中<br />
                    <span className="text-[9px] text-muted-foreground">r=1.0</span>
                  </th>
                  <th className="pr-3 py-1 text-right font-medium">
                    初期/難問<br />
                    <span className="text-[9px] text-muted-foreground">r=1.5</span>
                  </th>
                  <th className="py-1 text-right font-medium">
                    <span className="text-[9px] text-muted-foreground">r=2.0</span>
                  </th>
                </tr>
              </thead>
              <tbody className="text-muted-foreground">
                {statuses.map((s) => {
                  const eff = (r: number) => {
                    if (s.stabilityDays <= 0) return 0;
                    const ct = timeCoeff / r;
                    const ctk = Math.min(10, Math.max(0.1, Math.pow(ct, kVal)));
                    return Math.round(s.stabilityDays * ctk);
                  };
                  return (
                    <tr key={s.name} className="border-b border-border/50 last:border-0">
                      <td className="pr-3 py-1" style={{ color: s.color ?? "#888" }}>{s.name}</td>
                      <td className="pr-3 py-1 text-right tabular-nums font-medium">{s.stabilityDays}d</td>
                      <td className="pr-3 py-1 text-right tabular-nums">{eff(0.5)}d</td>
                      <td className="pr-3 py-1 text-right tabular-nums">{eff(1.0)}d</td>
                      <td className="pr-3 py-1 text-right tabular-nums">{eff(1.5)}d</td>
                      <td className="py-1 text-right tabular-nums">{eff(2.0)}d</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-xs text-muted-foreground mt-2 leading-relaxed">
              SM-2 / FSRS の canonical 間隔（Rough 3-7d, Fair 10-14d, Fluent 30-45d, Done 90-180d）と比較するときは、
              <strong>nominal ではなく「習熟時の実効値」列</strong>を見てください。同じ桁感になります。
              暴走防止で <Tex>{"C_T^{\\,k}"}</Tex> は <Tex>{"[0.1, 10]"}</Tex> にクランプしています。
            </p>
          </div>

          {/* FSRS 保持率モデル（補足） */}
          <details className="mt-3">
            <summary className="text-xs text-muted-foreground cursor-pointer hover:text-foreground transition-colors">
              FSRS 保持率モデル（詳細）
            </summary>
            <div className="mt-2">
              <p className="text-xs text-muted-foreground leading-relaxed">
                復習予定日の背景にはFSRS準拠のべき乗関数による保持率推定があります。
              </p>
              <TexBlock>
                {`R(t, S) = \\left(1 + ${fVal.toFixed(4)} \\times \\frac{t}{S}\\right)^{${cVal.toFixed(1)}}`}
              </TexBlock>
              <p className="text-sm text-foreground -mt-1">
                <Tex>{"F"}</Tex> ={" "}
                <V value={fVal} onChange={setFVal} fmt={(v) => v.toFixed(4)} />
                {" "}<Tex>{"C"}</Tex> ={" "}
                <V value={cVal} onChange={setCVal} fmt={(v) => v.toFixed(1)} />
              </p>
            </div>
          </details>
        </section>

        <hr className="border-border" />

        {/* ── Sort ── */}
        <section>
          <h2 className="text-base font-semibold mb-2">
            並び替え（Overdue順）
          </h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            スコアダッシュボードのデフォルト並び替えは
            <strong>Overdue降順</strong>
            （期限超過日数が大きい順）です。復習優先度は以下の通りです。
          </p>
          <ol className="text-xs text-muted-foreground list-decimal list-inside space-y-1 mt-2">
            <li>高評価で期限切れ（<Tex>{"S"}</Tex>日数超過）— 忘却直前、最優先</li>
            <li>低評価で数日経過 — 忘却リスク高</li>
            <li>最低評価で複数回着手済み — 定着しかけている</li>
            <li>新規問題 — 時間が余った場合のみ</li>
          </ol>
          <p className="text-sm text-muted-foreground leading-relaxed mt-2">
            1日の配分目安: 復習75%、新規25%。新規投入を抑制し「広く浅く」を防ぎます。
          </p>
        </section>
        <hr className="border-border" />

        {/* ── 背景理論 ── */}
        <section>
          <h2 className="text-base font-semibold mb-2">背景となる理論</h2>
          <ul className="text-xs text-muted-foreground space-y-2 mt-2">
            <li>
              <span className="text-foreground font-medium">忘却曲線（Ebbinghaus, 1885）</span> —
              記憶は時間とともに指数的に減衰する。復習しなければ1日で約70%を忘れるが、
              適切なタイミングで復習すると忘却速度が緩やかになり、少ない回数で長期記憶に移行できる。
            </li>
            <li>
              <span className="text-foreground font-medium">間隔反復（Spaced Repetition）</span> —
              復習間隔を段階的に広げることで、最小の復習回数で記憶を維持する学習法。
              本サイトではステータスごとに固定の復習間隔 <Tex>{"I_i"}</Tex> を設定し、次回復習日を算出する。
            </li>
            <li>
              <span className="text-foreground font-medium">FSRS（Free Spaced Repetition Scheduler）</span> —
              Ankiで採用されているアルゴリズム。べき乗関数で保持率を推定し、
              復習回数・成功/失敗の履歴から安定性 <Tex>{"S"}</Tex> を更新する。
              本サイトのStats保持率推定はFSRS準拠のモデルを使用。
            </li>
            <li>
              <span className="text-foreground font-medium">Stevens&apos; Power Law</span> —
              刺激の物理量と主観的な知覚強度がべき乗関係にあるという心理物理学の法則。
              復習間隔（日数）から評価点 <Tex>{"P_i"}</Tex> への変換に指数 <Tex>{"\\gamma"}</Tex> を適用し、
              直感的なスコアを導出するために利用。
            </li>
          </ul>
        </section>
      </article>
    </div>
  );
}
