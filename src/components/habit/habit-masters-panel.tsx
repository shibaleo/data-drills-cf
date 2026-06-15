import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { HabitDef } from "@/lib/habit-mock";

type Props = {
  habits: HabitDef[];
  onAdd?: () => void;
  onEdit?: (id: string) => void;
};

export function HabitMastersPanel({ habits, onAdd, onEdit }: Props) {
  return (
    <div className="rounded-md border bg-card">
      <div className="flex items-center justify-between border-b px-4 py-2.5">
        <h2 className="text-sm font-medium">Habits</h2>
        <Button type="button" size="sm" variant="outline" onClick={onAdd} className="gap-1.5">
          <Plus className="size-3.5" />
          Add habit
        </Button>
      </div>
      <ul className="divide-y">
        {habits.map((h) => (
          <li
            key={h.id}
            className="flex items-center gap-3 px-4 py-2 hover:bg-accent/40 cursor-pointer text-sm"
            onClick={() => onEdit?.(h.id)}
          >
            <span
              className="inline-block size-3 rounded-sm shrink-0"
              style={{ backgroundColor: h.categoryColor }}
              aria-hidden
            />
            <span className="font-medium min-w-32">{h.name}</span>
            <Badge variant="outline" className="font-normal">
              {h.cadence}
            </Badge>
            <span className="text-muted-foreground text-xs ml-auto">
              {h.togglProject} / {h.togglDescription} · est. {h.minutesEstimate}m
            </span>
          </li>
        ))}
        {habits.length === 0 && (
          <li className="px-4 py-6 text-sm text-muted-foreground text-center">
            No habits yet. Click "Add habit" to start.
          </li>
        )}
      </ul>
    </div>
  );
}
