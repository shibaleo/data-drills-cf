"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useParams, useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { useProject } from "@/hooks/use-project";
import { useThroughputList } from "@/hooks/queries/use-throughput";
import { useProblemsList } from "@/hooks/queries/use-problems";
import { useProblemDialogs } from "@/hooks/use-problem-dialogs";
import { useStatsScope, useUpdateStatsScope, useArchiveStatsScope, useStatsScopeRevisions } from "@/hooks/queries/use-stats-scopes";
import { usePageTitle, useHeaderSlot, usePageBack } from "@/lib/page-context";
import { StatusTransitionMatrix } from "@/components/status-transition-matrix";
import { TimeBottleneckList } from "@/components/time-bottleneck-list";
import { CycleTimeStats } from "@/components/cycle-time-stats";
import { StaleDoneList } from "@/components/stale-done-list";
import { ActivityHeatmap } from "@/components/activity-heatmap";
import { HourPattern } from "@/components/hour-pattern";
import { SameDayRepeatStats } from "@/components/same-day-repeat-stats";
import { MemberFilterPicker } from "@/components/member-filter-picker";
import { ScopePickerBar } from "@/components/scope-picker-bar";
import { applyMemberFilter } from "@/lib/member-filter";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Loader2, Save, RotateCcw, MoreVertical, ListFilter, Archive, Check, X } from "lucide-react";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";

export default function StatsDetailPage() {
  usePageTitle("Stats");
  const renderHeaderSlot = useHeaderSlot();
  const { scopeId } = useParams({ strict: false }) as { scopeId: string };
  const navigate = useNavigate();
  usePageBack(useCallback(() => navigate({ to: "/stats" as string }), [navigate]));
  const { currentProject, statuses } = useProject();

  const scopeQuery = useStatsScope(scopeId);
  const updateScope = useUpdateStatsScope(scopeId, currentProject?.id);
  const archiveScope = useArchiveStatsScope(currentProject?.id);

  const [localName, setLocalName] = useState("");
  const [localFilter, setLocalFilter] = useState<MemberFilterInput>({});
  const [localScopeId, setLocalScopeId] = useState<string | null>(null);
  const [membersEditorOpen, setMembersEditorOpen] = useState(false);
  const [moreMenuOpen, setMoreMenuOpen] = useState(false);
  const [matrixPeriod, setMatrixPeriod] = useState<"7d" | "30d" | "all">("30d");

  const lastSyncRevRef = useRef<number | null>(null);
  useEffect(() => {
    const sc = scopeQuery.data?.scope;
    if (!sc) return;
    if (lastSyncRevRef.current === sc.revision) return;
    lastSyncRevRef.current = sc.revision;
    setLocalName(sc.name);
    setLocalFilter(sc.filter ?? {});
    setLocalScopeId((sc as { scope_id?: string | null }).scope_id ?? null);
  }, [scopeQuery.data]);

  const { data: rawRows = [] } = useThroughputList(currentProject?.id);
  const { data: allProblems = [] } = useProblemsList(currentProject?.id);
  // scope の member filter を throughput rows と problems の両方に適用
  const rows = useMemo(() => {
    if (!localFilter.subjectIds?.length && !localFilter.levelIds?.length) return rawRows;
    return applyMemberFilter(
      rawRows.map((r) => ({ subjectId: r.subjectId, levelId: r.levelId, _r: r })),
      localFilter,
    ).map(({ _r }) => _r);
  }, [rawRows, localFilter]);
  const filteredProblems = useMemo(() => {
    if (!localFilter.subjectIds?.length && !localFilter.levelIds?.length) return allProblems;
    return applyMemberFilter(
      allProblems.map((p) => ({
        subjectId: p.subject_id || null,
        levelId: p.level_id || null,
        _p: p,
      })),
      localFilter,
    ).map(({ _p }) => _p);
  }, [allProblems, localFilter]);

  const { openDetail, renderDialogs } = useProblemDialogs({ allProblems, onDataChanged: () => {} });

  const scope = scopeQuery.data?.scope;
  const synced = !!scope && lastSyncRevRef.current === scope.revision;
  const filterDirty = synced && JSON.stringify(localFilter) !== JSON.stringify(scope!.filter ?? {});
  const nameDirty = synced && localName !== scope!.name;
  const scopeIdDirty = synced && localScopeId !== ((scope as { scope_id?: string | null }).scope_id ?? null);
  const dirty = filterDirty || nameDirty || scopeIdDirty;
  const membersOpen = membersEditorOpen || filterDirty;

  async function onConfirm() {
    if (!scope) return;
    await updateScope.mutateAsync({
      ...(nameDirty && { name: localName }),
      ...(filterDirty && { filter: localFilter }),
      ...(scopeIdDirty && { scope_id: localScopeId }),
    });
    lastSyncRevRef.current = null;
    toast.success("Saved");
  }

  async function onArchive() {
    if (!confirm("Archive this stats scope?")) return;
    await archiveScope.mutateAsync(scopeId);
    navigate({ to: "/stats" as string });
  }

  if (!currentProject) return <div className="p-6 text-muted-foreground">Please select a project</div>;

  return (
    <div className="p-3 md:p-4 flex flex-col gap-2 max-w-4xl">
      {renderHeaderSlot(
      <>
        <Input value={localName} onChange={(e) => setLocalName(e.target.value)}
          className="h-7 text-xs max-w-xs"/>
        {dirty && (
          <div className="ml-auto flex items-center gap-2">
            <button type="button"
              onClick={() => { if (scope) { setLocalName(scope.name); setLocalFilter(scope.filter ?? {}); setLocalScopeId((scope as { scope_id?: string | null }).scope_id ?? null); } }}
              disabled={updateScope.isPending}
              className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground disabled:opacity-50"
              title="Discard changes"><RotateCcw className="size-3"/>Reset</button>
            <Button size="sm" onClick={onConfirm} disabled={updateScope.isPending}
              className="h-7 text-xs">
              {updateScope.isPending ? <Loader2 className="size-3 mr-1 animate-spin"/> : <Save className="size-3 mr-1"/>}
              {updateScope.isPending ? "Saving..." : "Save"}
            </Button>
          </div>
        )}
        <Popover open={moreMenuOpen} onOpenChange={setMoreMenuOpen}>
          <PopoverTrigger asChild>
            <button type="button" title="More"
              aria-pressed={moreMenuOpen || membersOpen}
              className={`${dirty ? "" : "ml-auto"} inline-flex items-center justify-center size-7 rounded-md border transition-colors ${
                filterDirty
                  ? "border-primary/50 text-primary"
                  : (membersOpen || moreMenuOpen)
                    ? "bg-accent text-accent-foreground border-accent-foreground/40"
                    : "text-muted-foreground hover:bg-muted"
              }`}>
              <MoreVertical className="size-3.5"/>
            </button>
          </PopoverTrigger>
          <PopoverContent className="w-44 p-1" align="end">
            <MenuItem
              icon={<ListFilter className="size-3.5"/>}
              label="Members filter"
              active={membersOpen}
              onClick={() => { setMembersEditorOpen((v) => !v); setMoreMenuOpen(false); }}
            />
            <div className="h-px bg-border my-1"/>
            <MenuItem
              icon={<Archive className="size-3.5"/>}
              label="Archive…"
              destructive
              onClick={() => { setMoreMenuOpen(false); onArchive(); }}
            />
          </PopoverContent>
        </Popover>
      </>
      )}

      <ScopePickerBar value={localScopeId} onChange={setLocalScopeId} dirty={scopeIdDirty} />

      {membersOpen && (
        <div className={`relative rounded-md border ${filterDirty ? "border-primary/40 bg-primary/5" : ""} px-3 py-2 text-xs space-y-2`}>
          <button type="button" onClick={() => setMembersEditorOpen(false)} disabled={filterDirty}
            title="Close"
            className="absolute top-1.5 right-1.5 inline-flex items-center justify-center size-5 rounded-sm text-muted-foreground hover:text-foreground hover:bg-accent disabled:opacity-40 disabled:cursor-not-allowed">
            <X className="size-3.5"/>
          </button>
          <MemberFilterPicker
            projectId={currentProject.id}
            value={localFilter}
            onChange={setLocalFilter}
            trailing={
              filterDirty ? (
                <button type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => scope && setLocalFilter(scope.filter ?? {})}>
                  Reset
                </button>
              ) : null
            }
          />
        </div>
      )}

      <ActivityHeatmap rows={rows} days={90}/>

      <StatusTransitionMatrix
        rows={rows}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color ?? null, sortOrder: s.sortOrder }))}
        period={matrixPeriod}
        setPeriod={setMatrixPeriod}
      />

      <HourPattern rows={rows}/>

      <CycleTimeStats
        problems={filteredProblems}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color ?? null, sortOrder: s.sortOrder }))}
      />

      <TimeBottleneckList
        problems={filteredProblems}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color ?? null, sortOrder: s.sortOrder }))}
        onOpenProblem={openDetail}
      />

      <SameDayRepeatStats
        problems={filteredProblems}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color ?? null, sortOrder: s.sortOrder }))}
      />

      <StaleDoneList
        problems={filteredProblems}
        statuses={statuses.map((s) => ({ id: s.id, name: s.name, color: s.color ?? null, sortOrder: s.sortOrder }))}
        onOpenProblem={openDetail}
      />

      {renderDialogs()}
    </div>
  );
}

function MenuItem({ icon, label, active, destructive, disabled, onClick }: {
  icon: React.ReactNode;
  label: string;
  active?: boolean;
  destructive?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${
        destructive ? "hover:bg-destructive/10 hover:text-destructive" : "hover:bg-accent"
      } ${active ? "text-foreground" : "text-muted-foreground"}`}
    >
      <span className={active ? "text-primary" : ""}>{icon}</span>
      <span className="flex-1 text-left">{label}</span>
      {active && <Check className="size-3 text-primary"/>}
    </button>
  );
}
