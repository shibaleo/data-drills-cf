/**
 * 評価なし phase の表示ラベル。answer_status table には存在しない
 * placeholder で、code 内 string literal で扱われる。
 *
 * 名前を変えたい時 (例: "New" → "Fresh") はここを編集するだけで
 * plan/digest/scopes/status-transition-matrix の表示が一括変更される。
 *
 * - UNANSWERED_LABEL : "評価なし" の凡例ラベル (past + future no-grade 同色)
 * - ALLOC_KIND_PAST  : allocator の past 側 (= First answer 済 = 初回)
 * - ALLOC_KIND_FUTURE: allocator の future 側 (= 未着手 Planned)
 *
 * ALLOC_KIND は internal な category 識別子も兼ねるので rename には
 * filter-prefs の persist 値 mapping (use-filter-prefs.ts) を確認。
 */
export const STATUS_PHASE = {
  UNANSWERED_LABEL: "New",
  ALLOC_KIND_PAST: "First",
  ALLOC_KIND_FUTURE: "Planned",
} as const;

export type AllocKind = typeof STATUS_PHASE.ALLOC_KIND_PAST | typeof STATUS_PHASE.ALLOC_KIND_FUTURE;
