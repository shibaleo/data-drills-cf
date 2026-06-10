"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ScopeDetail, ScopeRow } from "@/hooks/queries/use-scopes";
import { useScopeBatchSave } from "@/hooks/queries/use-scopes";
import type { ScopeBatchInput, ScopeUpdateInput } from "@/lib/schemas/scope";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";
import { applyMemberFilter } from "@/lib/member-filter";
import { allocate, type MemberInput } from "@/lib/backlog-allocate";

export type LocalLayer = {
  id: string;
  name: string;
  color: string | null;
  opacity_pct: number | null;
  line_style: "solid" | "dashed" | "dotted" | null;
  line_width: number | null;
};
export type LocalMilestone = {
  id: string;
  layer_id: string;
  target: number;
  date: string;
};

type ProblemRow = {
  id: string;
  code: string;
  name: string | null;
  standard_time: number | null;
  field_id?: string | null;
  subject_id?: string | null;
  level_id?: string | null;
  topic_id?: string | null;
  answers: { date: string }[];
};

const tmpId = () => `tmp-${(crypto as Crypto & { randomUUID(): string }).randomUUID()}`;
const isTmp = (id: string) => id.startsWith("tmp-");

const snapshotLayers = (layers: ScopeDetail["layers"]): LocalLayer[] =>
  layers.map((l) => ({
    id: l.id,
    name: l.name,
    color: l.color ?? null,
    opacity_pct: l.opacity_pct ?? null,
    line_style: (l.line_style as "solid" | "dashed" | "dotted" | null) ?? null,
    line_width: l.line_width ?? null,
  }));
const snapshotMilestones = (ms: ScopeDetail["milestones"]): LocalMilestone[] =>
  ms.map((m) => ({ id: m.id, layer_id: m.layer_id, target: m.target, date: m.date }));

/**
 * /scopes/$scopeId と /plan で共有する scope 編集 state。
 *
 * - server data (ScopeDetail) を 1 度だけ local state に sync (revision 単位)
 * - dirty 判定、reset、batch save、computed (effectiveMembers / allocated) を提供
 * - 過去 asOf の場合 first_answer_date を asOf でフィルタする「過去再現モード」を取り扱う
 */
export function useScopeEditState(args: {
  scopeId: string;
  data: ScopeDetail | null;
  /** asOf 含み、現在日。chart の drag に追従。 */
  today: string;
  /** 「現在」の JST 日付。asOf が null か等価なら past モードを抑制する判定に使う。 */
  realToday: string;
  /** asOf state (null = live)。past 再現モードのトグルに使う。 */
  asOf: string | null;
  /** filter 変更時に scope 全 member を再計算するための problems 一覧。 */
  allProblems: ProblemRow[];
  /**
   * sync dedupe key。同じ key の間は server data の変化を local state に上書きしない
   * (= 編集中の入力を保護)。デフォルトは `data.scope.revision`。
   * AsOf 再生では caller 側で `${asOf}-${scope.revision}` 等を渡すと、asOf 切替で
   * 必ず再 sync (= timeline 切替) しつつ同 asOf 内では編集を守れる。
   */
  syncKey?: string | number | null;
}) {
  const { scopeId, data, today, realToday, asOf, allProblems, syncKey } = args;
  const batchSave = useScopeBatchSave(scopeId);

  const [name, setName] = useState("");
  const [dailyMinutes, setDailyMinutes] = useState(60);
  const [timeMultiplier, setTimeMultiplier] = useState(1.0);
  const [weekdayWeights, setWeekdayWeights] = useState<number[]>([1, 1, 1, 1, 1, 1, 1]);
  const [localLayers, setLocalLayers] = useState<LocalLayer[]>([]);
  const [localMilestones, setLocalMilestones] = useState<LocalMilestone[]>([]);
  const [localFilter, setLocalFilter] = useState<MemberFilterInput>({});

  const lastSyncRevRef = useRef<number | string | null>(null);
  useEffect(() => {
    if (!data) return;
    const key = syncKey ?? data.scope.revision;
    if (lastSyncRevRef.current === key) return;
    lastSyncRevRef.current = key;
    setName(data.scope.name);
    setDailyMinutes(data.scope.daily_minutes);
    setTimeMultiplier(data.scope.time_multiplier_pct / 100);
    setWeekdayWeights(data.scope.weekday_weights);
    setLocalLayers(snapshotLayers(data.layers));
    setLocalMilestones(snapshotMilestones(data.milestones));
    setLocalFilter(data.scope.filter ?? {});
  }, [data]);

  const reset = useCallback(() => {
    if (!data) return;
    setName(data.scope.name);
    setDailyMinutes(data.scope.daily_minutes);
    setTimeMultiplier(data.scope.time_multiplier_pct / 100);
    setWeekdayWeights(data.scope.weekday_weights);
    setLocalLayers(snapshotLayers(data.layers));
    setLocalMilestones(snapshotMilestones(data.milestones));
    setLocalFilter(data.scope.filter ?? {});
  }, [data]);

  const multPct = Math.round(timeMultiplier * 100);
  const effectiveSyncKey = syncKey ?? data?.scope.revision ?? null;
  const synced = data ? lastSyncRevRef.current === effectiveSyncKey : false;
  const planDirty = synced && data ? (
    name !== data.scope.name ||
    dailyMinutes !== data.scope.daily_minutes ||
    multPct !== data.scope.time_multiplier_pct ||
    JSON.stringify(weekdayWeights) !== JSON.stringify(data.scope.weekday_weights)
  ) : false;
  const layersDirty = synced && data
    ? JSON.stringify(localLayers) !== JSON.stringify(snapshotLayers(data.layers))
    : false;
  const milestonesDirty = synced && data
    ? JSON.stringify(localMilestones) !== JSON.stringify(snapshotMilestones(data.milestones))
    : false;
  const filterDirty = synced && data
    ? JSON.stringify(localFilter) !== JSON.stringify(data.scope.filter ?? {})
    : false;
  const dirty = planDirty || layersDirty || milestonesDirty || filterDirty;

  const effectiveMembers = useMemo(() => {
    if (!data) return [];
    const sameFilter = JSON.stringify(data.scope.filter ?? {}) === JSON.stringify(localFilter);
    const pastAsOf = asOf && asOf < realToday ? asOf : null;
    if (sameFilter && !pastAsOf) return data.members;
    if (allProblems.length === 0) return data.members;
    const filtered = applyMemberFilter(
      allProblems.map((p) => ({
        fieldId: p.field_id ?? null,
        subjectId: p.subject_id || null,
        levelId: p.level_id || null,
        _orig: p,
      })),
      localFilter,
    );
    return filtered
      .map(({ _orig: p }) => {
        const firstAns = pastAsOf
          ? p.answers.find((a) => a.date <= pastAsOf)?.date ?? null
          : p.answers[0]?.date ?? null;
        return {
          id: p.id,
          code: p.code,
          name: p.name || null,
          standard_time: p.standard_time,
          field_id: p.field_id ?? "",
          subject_id: p.subject_id || null,
          level_id: p.level_id || null,
          topic_id: p.topic_id ?? null,
          first_answer_date: firstAns,
        };
      })
      .sort((a, b) => a.code === b.code ? a.id.localeCompare(b.id) : a.code.localeCompare(b.code));
  }, [data, localFilter, allProblems, asOf, realToday]);

  const allocated = useMemo(() => {
    if (!data) return [];
    const members: MemberInput[] = effectiveMembers.map((m) => ({
      id: m.id, code: m.code, name: m.name,
      standardTimeSec: m.standard_time, firstAnswerDate: m.first_answer_date,
    }));
    return allocate(members, localMilestones, dailyMinutes, today, multPct, weekdayWeights);
  }, [data, effectiveMembers, localMilestones, dailyMinutes, multPct, weekdayWeights, today]);

  // ── milestone / layer 編集 callbacks (BacklogChart が要求する形) ───────────
  const onMilestoneDateDraft = useCallback((id: string, newDate: string) =>
    setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, date: newDate } : m))), []);
  const onMilestoneDateChange = onMilestoneDateDraft;
  const onMilestoneLayerDraft = useCallback((id: string, newLayerId: string) =>
    setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, layer_id: newLayerId } : m))), []);
  const onMilestoneLayerChange = onMilestoneLayerDraft;
  const onMilestoneTargetChange = useCallback((id: string, newTarget: number) =>
    setLocalMilestones((prev) => prev.map((m) => (m.id === id ? { ...m, target: newTarget } : m))), []);
  const onMilestoneRemove = useCallback((id: string) =>
    setLocalMilestones((prev) => prev.filter((m) => m.id !== id)), []);
  const onMilestoneAddToLayer = useCallback((layerId: string, atDate: string | undefined, fallbackDate: string, memberCount: number) =>
    setLocalMilestones((prev) => [
      ...prev,
      { id: tmpId(), layer_id: layerId, target: memberCount, date: atDate ?? fallbackDate },
    ]), []);
  const onLayerNameChange = useCallback((id: string, newName: string) =>
    setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, name: newName } : l))), []);
  const onLayerColorChange = useCallback((id: string, newColor: string | null) =>
    setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, color: newColor } : l))), []);
  const onLayerStyleChange = useCallback((id: string, patch: Partial<LocalLayer>) =>
    setLocalLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l))), []);
  const onLayerRemove = useCallback((id: string) => {
    setLocalLayers((prev) => prev.filter((l) => l.id !== id));
    setLocalMilestones((prev) => prev.filter((m) => m.layer_id !== id));
  }, []);
  const onAddLayer = useCallback(() =>
    setLocalLayers((prev) => [
      ...prev,
      { id: tmpId(), name: "", color: null, opacity_pct: null, line_style: null, line_width: null },
    ]), []);
  const onReorderLayers = useCallback((ids: string[]) =>
    setLocalLayers((prev) => {
      const map = new Map(prev.map((l) => [l.id, l]));
      return ids.map((id) => map.get(id)).filter((x): x is LocalLayer => !!x);
    }), []);

  const save = useCallback(async () => {
    if (!data) return;
    const payload: ScopeBatchInput = {
      layer_deletes: [], layer_creates: [], layer_updates: [],
      milestone_deletes: [], milestone_creates: [], milestone_updates: [],
    };
    if (planDirty || filterDirty) {
      const upd: ScopeUpdateInput = {};
      if (planDirty) {
        upd.name = name;
        upd.daily_minutes = dailyMinutes;
        upd.time_multiplier_pct = multPct;
        upd.weekday_weights = weekdayWeights;
      }
      if (filterDirty) upd.filter = localFilter;
      payload.scope_update = upd;
    }
    const localLayerIds = new Set(localLayers.map((l) => l.id));
    for (const sv of data.layers) {
      if (!localLayerIds.has(sv.id)) payload.layer_deletes!.push(sv.id);
    }
    for (let i = 0; i < localLayers.length; i++) {
      const l = localLayers[i];
      if (isTmp(l.id)) {
        payload.layer_creates!.push({
          temp_id: l.id, scope_id: scopeId, name: l.name,
          color: l.color ?? undefined,
          opacity_pct: l.opacity_pct ?? undefined,
          line_style: l.line_style ?? undefined,
          line_width: l.line_width ?? undefined,
          sort_order: i,
        });
      } else {
        const orig = data.layers.find((o) => o.id === l.id);
        if (!orig) continue;
        const origOrder = data.layers.findIndex((o) => o.id === l.id);
        const diff: { name?: string; color?: string | null; opacity_pct?: number | null; line_style?: "solid" | "dashed" | "dotted" | null; line_width?: number | null; sort_order?: number } = {};
        if (orig.name !== l.name) diff.name = l.name;
        if ((orig.color ?? null) !== (l.color ?? null)) diff.color = l.color;
        if ((orig.opacity_pct ?? null) !== (l.opacity_pct ?? null)) diff.opacity_pct = l.opacity_pct;
        if ((orig.line_style ?? null) !== (l.line_style ?? null)) diff.line_style = l.line_style;
        if ((orig.line_width ?? null) !== (l.line_width ?? null)) diff.line_width = l.line_width;
        if (origOrder !== i) diff.sort_order = i;
        if (Object.keys(diff).length > 0) payload.layer_updates!.push({ id: l.id, payload: diff });
      }
    }
    const localMsIds = new Set(localMilestones.map((m) => m.id));
    for (const sv of data.milestones) {
      if (!localMsIds.has(sv.id)) payload.milestone_deletes!.push(sv.id);
    }
    for (const m of localMilestones) {
      if (isTmp(m.id)) {
        payload.milestone_creates!.push({
          temp_id: m.id, scope_id: scopeId,
          layer_id: m.layer_id,
          target: m.target, date: m.date,
        });
      } else {
        const orig = data.milestones.find((o) => o.id === m.id);
        if (!orig) continue;
        const diff: { layer_id?: string; target?: number; date?: string } = {};
        if (orig.layer_id !== m.layer_id) diff.layer_id = m.layer_id;
        if (orig.target !== m.target) diff.target = m.target;
        if (orig.date !== m.date) diff.date = m.date;
        if (Object.keys(diff).length > 0) payload.milestone_updates!.push({ id: m.id, payload: diff });
      }
    }
    await batchSave.mutateAsync(payload);
    lastSyncRevRef.current = null;
  }, [data, scopeId, name, dailyMinutes, multPct, weekdayWeights, localLayers, localMilestones, localFilter, planDirty, filterDirty, batchSave]);

  return {
    // state
    name, setName,
    dailyMinutes, setDailyMinutes,
    timeMultiplier, setTimeMultiplier,
    weekdayWeights, setWeekdayWeights,
    localLayers, setLocalLayers,
    localMilestones, setLocalMilestones,
    localFilter, setLocalFilter,
    // dirty
    dirty, planDirty, layersDirty, milestonesDirty, filterDirty, synced,
    // computed
    multPct, effectiveMembers, allocated,
    // ops
    reset, save, isSaving: batchSave.isPending,
    // edit callbacks (BacklogChart 互換)
    handlers: {
      onMilestoneDateDraft, onMilestoneDateChange,
      onMilestoneLayerDraft, onMilestoneLayerChange,
      onMilestoneTargetChange, onMilestoneRemove, onMilestoneAddToLayer,
      onLayerNameChange, onLayerColorChange, onLayerStyleChange,
      onLayerRemove, onAddLayer, onReorderLayers,
    },
  };
}

export type ScopeEditState = ReturnType<typeof useScopeEditState>;

// 型を絞り込みすぎないために unused 警告回避用
export type _ScopeRow = ScopeRow;
