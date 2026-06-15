import { useState } from "react";
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
  const [name, setName] = useState("");
  const [cadence, setCadence] = useState<"daily" | "weekly">("daily");
  const [togglProject, setTogglProject] = useState("");
  const [togglDescription, setTogglDescription] = useState("");
  const [categoryColor, setCategoryColor] = useState(DEFAULT_COLOR);
  const [minutesEstimate, setMinutesEstimate] = useState(5);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
              <Input value={togglProject} onChange={(e) => setTogglProject(e.target.value)} placeholder="Hygiene" />
            </div>
            <div className="space-y-1.5">
              <Label>Toggl description</Label>
              <Input value={togglDescription} onChange={(e) => setTogglDescription(e.target.value)} placeholder="brush teeth" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Color</Label>
              <div className="flex items-center gap-2">
                <input
                  type="color"
                  value={categoryColor}
                  onChange={(e) => setCategoryColor(e.target.value)}
                  className="h-9 w-14 cursor-pointer rounded border bg-transparent"
                />
                <Input
                  value={categoryColor}
                  onChange={(e) => setCategoryColor(e.target.value)}
                  className="font-mono text-xs flex-1"
                />
              </div>
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
              if (!togglProject.trim() || !togglDescription.trim()) {
                setError("Toggl project + description are required");
                return;
              }
              setSaving(true);
              try {
                await onSave({
                  name: name.trim(),
                  cadence,
                  toggl_project: togglProject.trim(),
                  toggl_description: togglDescription.trim(),
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
