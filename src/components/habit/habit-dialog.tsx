import { useEffect, useMemo, useState } from "react";
import { Plus, X } from "lucide-react";
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
import { Input } from "@/components/ui/input";
import type { HabitRow } from "@/hooks/queries/use-habits";
import { useTogglHabitCandidates } from "@/hooks/queries/use-toggl-habit-candidates";

export type HabitFormPayload = {
  name: string;
  cadence: "daily" | "weekly";
  toggl_description_patterns: string[];
};

type Props = {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  item: HabitRow | null;
  onSave: (payload: HabitFormPayload) => Promise<void>;
  onDelete?: () => void;
};

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function patternFromDescription(desc: string): string {
  const head = desc.split(":")[0].trim();
  return `^${escapeRegex(head)}(:|$)`;
}

export function HabitDialog({ open, onOpenChange, item, onSave, onDelete }: Props) {
  const isCreate = item === null;
  const candidatesQuery = useTogglHabitCandidates();
  const candidates = candidatesQuery.data ?? [];

  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [patterns, setPatterns] = useState<string[]>([]);
  const [filter, setFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // 候補: 全 project の description を "コロン前 head" で集約 (head, project, n)。
  // 同じ head が複数 project にある場合は project 別に別エントリで残す
  // (チップに project 名を併記して区別できるようにする)。
  const candidateChips = useMemo(() => {
    const agg = new Map<string, { head: string; project: string; n: number }>();
    for (const c of candidates) {
      if (!c.project_name || !c.description) continue;
      const head = c.description.split(":")[0].trim();
      if (!head) continue;
      const key = `${c.project_name}|${head}`;
      const slot = agg.get(key);
      if (slot) slot.n += c.n;
      else agg.set(key, { head, project: c.project_name, n: c.n });
    }
    return Array.from(agg.values()).sort((a, b) => b.n - a.n);
  }, [candidates]);

  const visibleChips = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? candidateChips.filter(
          (c) => c.head.toLowerCase().includes(q) || c.project.toLowerCase().includes(q),
        )
      : candidateChips;
    return filtered.slice(0, 60);
  }, [candidateChips, filter]);

  // Dialog が開いた時 (item 変更時) にフォームを初期化。
  useEffect(() => {
    if (!open) return;
    setName(item?.name ?? "");
    setCadence((item?.cadence as "daily" | "weekly") ?? "daily");
    setPatterns(item?.togglDescriptionPatterns ?? []);
    setFilter("");
    setError(null);
  }, [open, item]);

  const hasPattern = (p: string) => patterns.includes(p);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{isCreate ? "New habit" : "Edit habit"}</DialogTitle>
          <DialogDescription className="sr-only">Habit details</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label>Name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. bath"
            />
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

          <div className="space-y-1.5">
            <Label>Match patterns (regex, OR)</Label>
            <p className="text-xs text-muted-foreground">
              An entry matches this habit if its description matches ANY pattern (case-insensitive).
              Click a candidate to insert <code>^head(:|$)</code>, or type your own regex.
            </p>
            <div className="space-y-1.5">
              {patterns.map((p, i) => (
                <div key={i} className="flex gap-1.5 items-center">
                  <Input
                    value={p}
                    onChange={(e) => {
                      const next = patterns.slice();
                      next[i] = e.target.value;
                      setPatterns(next);
                    }}
                    placeholder="^shower(:|$)"
                    className="font-mono text-xs"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    className="size-8 shrink-0"
                    onClick={() => setPatterns(patterns.filter((_, j) => j !== i))}
                    title="Remove pattern"
                  >
                    <X className="size-3.5" />
                  </Button>
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 gap-1.5"
                onClick={() => setPatterns([...patterns, ""])}
              >
                <Plus className="size-3.5" />
                Add pattern
              </Button>
            </div>

            <div className="pt-2 space-y-1.5">
              <div className="flex items-center gap-2">
                <p className="text-xs text-muted-foreground">
                  Candidates from Toggl (click to add):
                </p>
                <Input
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  placeholder="Filter by description or project…"
                  className="h-7 text-xs ml-auto max-w-[220px]"
                />
              </div>
              <div className="flex flex-wrap gap-1 max-h-40 overflow-y-auto">
                {visibleChips.map((c) => {
                  const p = patternFromDescription(c.head);
                  const added = hasPattern(p);
                  return (
                    <button
                      key={`${c.project}|${c.head}`}
                      type="button"
                      disabled={added}
                      onClick={() => setPatterns([...patterns, p])}
                      className={`px-2 py-0.5 text-xs rounded border ${
                        added
                          ? "text-muted-foreground/60 bg-muted/40 cursor-default"
                          : "hover:bg-accent"
                      }`}
                      title={added ? "Already added" : `Add ${p}`}
                    >
                      {c.head}
                      <span className="text-muted-foreground/70 ml-1">
                        · {c.project} ({c.n})
                      </span>
                    </button>
                  );
                })}
                {visibleChips.length === 0 && (
                  <span className="text-xs text-muted-foreground italic">
                    {candidatesQuery.isLoading ? "Loading…" : "No candidates"}
                  </span>
                )}
              </div>
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
              const trimmedPatterns = patterns.map((p) => p.trim()).filter((p) => p.length > 0);
              if (!name.trim()) { setError("Name is required"); return; }
              if (trimmedPatterns.length === 0) {
                setError("At least one match pattern is required");
                return;
              }
              for (const p of trimmedPatterns) {
                try { new RegExp(p, "i"); }
                catch { setError(`Invalid regex: ${p}`); return; }
              }
              setSaving(true);
              try {
                await onSave({
                  name: name.trim(),
                  cadence,
                  toggl_description_patterns: trimmedPatterns,
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
