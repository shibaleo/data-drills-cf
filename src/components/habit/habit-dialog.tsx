import { useEffect, useMemo, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { HabitRow } from "@/hooks/queries/use-habits";
import { useTogglHabitCandidates } from "@/hooks/queries/use-toggl-habit-candidates";

export type HabitFormPayload = {
  name: string;
  cadence: "daily" | "weekly";
  toggl_project: string;
  toggl_description: string;
  category_color: string;
  minutes_estimate: number;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: HabitRow | null;
  onSave: (payload: HabitFormPayload) => Promise<void>;
  onDelete?: () => void;
};

const DEFAULT_COLOR = "#06b6d4";

export function HabitDialog({ open, onOpenChange, item, onSave, onDelete }: Props) {
  const isCreate = item === null;
  const candidatesQuery = useTogglHabitCandidates();
  const candidates = candidatesQuery.data ?? [];

  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [togglProject, setTogglProject] = useState("");
  const [togglDescription, setTogglDescription] = useState("");
  const [categoryColor, setCategoryColor] = useState(DEFAULT_COLOR);
  const [colorOverridden, setColorOverridden] = useState(false);
  const [minutesEstimate, setMinutesEstimate] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 利用可能な project 一覧 (候補から distinct)
  const projects = useMemo(() => {
    const seen = new Set<string>();
    const out: { name: string; color: string | null }[] = [];
    for (const c of candidates) {
      if (!c.project_name) continue;
      if (seen.has(c.project_name)) continue;
      seen.add(c.project_name);
      out.push({ name: c.project_name, color: c.project_color });
    }
    return out.sort((a, b) => a.name.localeCompare(b.name));
  }, [candidates]);

  // 選択中 project の description 一覧 (ヒット数降順)
  const descriptions = useMemo(() => {
    if (!togglProject) return [];
    return candidates
      .filter((c) => c.project_name === togglProject && c.description)
      .map((c) => ({ description: c.description as string, n: c.n }))
      .sort((a, b) => b.n - a.n);
  }, [candidates, togglProject]);

  // 選択中 project の color
  const selectedProjectColor = useMemo(
    () => projects.find((p) => p.name === togglProject)?.color ?? null,
    [projects, togglProject],
  );

  // project 変更時、color override されていなければ project color に追従
  useEffect(() => {
    if (!open) return;
    if (colorOverridden) return;
    if (selectedProjectColor) setCategoryColor(selectedProjectColor);
  }, [open, selectedProjectColor, colorOverridden]);

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setName(item?.name ?? "");
          setCadence((item?.cadence as "daily" | "weekly") ?? "daily");
          setTogglProject(item?.togglProject ?? "");
          setTogglDescription(item?.togglDescription ?? "");
          setCategoryColor(item?.categoryColor ?? DEFAULT_COLOR);
          // 編集時は既存値を保持 (overridden 扱い)、新規時は project color に追従させる
          setColorOverridden(item !== null);
          setMinutesEstimate(item?.minutesEstimate ?? 5);
          setError(null);
        }
      }}
    >
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New habit" : "Edit habit"}</DialogTitle>
          <DialogDescription className="sr-only">Habit details</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Brush teeth" />
          </div>
          <div className="space-y-1.5">
            <Label>Cadence</Label>
            <select
              value={cadence}
              onChange={(e) => setCadence(e.target.value as "daily" | "weekly")}
              className="w-full h-9 px-2 text-sm border rounded bg-background"
            >
              <option value="daily">daily</option>
              <option value="weekly">weekly</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Toggl project</Label>
              <select
                value={togglProject}
                onChange={(e) => {
                  setTogglProject(e.target.value);
                  setTogglDescription("");  // project が変わったら description は reset
                }}
                disabled={candidatesQuery.isLoading}
                className="w-full h-9 px-2 text-sm border rounded bg-background"
              >
                <option value="">
                  {candidatesQuery.isLoading ? "Loading…" : "Select project"}
                </option>
                {/* 既存値が候補に無い場合 (rename された等) のフォールバック */}
                {togglProject && !projects.some((p) => p.name === togglProject) && (
                  <option value={togglProject}>{togglProject} (stale)</option>
                )}
                {projects.map((p) => (
                  <option key={p.name} value={p.name}>{p.name}</option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Toggl description</Label>
              <select
                value={togglDescription}
                onChange={(e) => setTogglDescription(e.target.value)}
                disabled={!togglProject || candidatesQuery.isLoading}
                className="w-full h-9 px-2 text-sm border rounded bg-background"
              >
                <option value="">
                  {!togglProject ? "Pick project first" : "Select description"}
                </option>
                {togglDescription && !descriptions.some((d) => d.description === togglDescription) && (
                  <option value={togglDescription}>{togglDescription} (stale)</option>
                )}
                {descriptions.map((d) => (
                  <option key={d.description} value={d.description}>
                    {d.description} ({d.n})
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={categoryColor}
                  onChange={(e) => { setCategoryColor(e.target.value); setColorOverridden(true); }}
                  className="h-9 w-14 cursor-pointer rounded border bg-transparent"
                />
                <Input
                  value={categoryColor}
                  onChange={(e) => { setCategoryColor(e.target.value); setColorOverridden(true); }}
                  className="font-mono text-xs flex-1"
                />
              </div>
              {colorOverridden && selectedProjectColor && selectedProjectColor !== categoryColor && (
                <button
                  type="button"
                  className="text-[10px] text-muted-foreground hover:text-foreground"
                  onClick={() => { setColorOverridden(false); setCategoryColor(selectedProjectColor); }}
                >
                  Reset to project color
                </button>
              )}
            </div>
            <div className="space-y-1.5">
              <Label>Minutes estimate</Label>
              <Input
                type="number"
                min={1}
                value={minutesEstimate}
                onChange={(e) => setMinutesEstimate(Math.max(1, parseInt(e.target.value) || 1))}
                className="tabular-nums"
              />
            </div>
          </div>
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          {!isCreate && onDelete && (
            <Button
              variant="outline"
              size="sm"
              className="text-destructive hover:text-destructive mr-auto"
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
          <DialogClose asChild>
            <Button variant="outline" disabled={saving}>Cancel</Button>
          </DialogClose>
          <Button
            onClick={async () => {
              if (!name.trim()) { setError("Name is required"); return; }
              if (!togglProject || !togglDescription) {
                setError("Toggl project + description are required");
                return;
              }
              setSaving(true);
              try {
                await onSave({
                  name: name.trim(),
                  cadence,
                  toggl_project: togglProject,
                  toggl_description: togglDescription,
                  category_color: categoryColor,
                  minutes_estimate: minutesEstimate,
                });
              } catch (e) {
                setError(e instanceof Error ? e.message : "Failed to save");
              } finally {
                setSaving(false);
              }
            }}
            disabled={saving}
          >
            {saving ? "Saving..." : isCreate ? "Create" : "Update"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
