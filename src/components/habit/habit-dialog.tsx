import { useMemo, useState } from "react";
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
import { Label } from "@/components/ui/label";
import type { HabitRow } from "@/hooks/queries/use-habits";
import { useTogglHabitCandidates } from "@/hooks/queries/use-toggl-habit-candidates";

export type HabitFormPayload = {
  cadence: "daily" | "weekly";
  toggl_project: string;
  toggl_description: string;
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: HabitRow | null;
  onSave: (payload: HabitFormPayload) => Promise<void>;
  onDelete?: () => void;
};

export function HabitDialog({ open, onOpenChange, item, onSave, onDelete }: Props) {
  const isCreate = item === null;
  const candidatesQuery = useTogglHabitCandidates();
  const candidates = candidatesQuery.data ?? [];

  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [togglProject, setTogglProject] = useState("");
  const [togglDescription, setTogglDescription] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 利用可能な project 一覧 (候補から distinct、alphabetical)
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

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        onOpenChange(o);
        if (o) {
          setCadence((item?.cadence as "daily" | "weekly") ?? "daily");
          setTogglProject(item?.togglProject ?? "");
          setTogglDescription(item?.togglDescription ?? "");
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
          <p className="text-xs text-muted-foreground">
            表示名・色・所要時間は Toggl のデータから自動的に決まります。
          </p>
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
              if (!togglProject || !togglDescription) {
                setError("Toggl project + description are required");
                return;
              }
              setSaving(true);
              try {
                await onSave({
                  cadence,
                  toggl_project: togglProject,
                  toggl_description: togglDescription,
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
