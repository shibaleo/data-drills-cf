/** Backlog filter spec (subject/level/topic) selector. Multi-select per category. */
import { useSubjectsList } from "@/hooks/queries/use-subjects";
import { useLevelsList } from "@/hooks/queries/use-levels";
import { useTopicsList } from "@/hooks/queries/use-topics";
import { Checkbox } from "@/components/ui/checkbox";
import type { BacklogFilterInput } from "@/lib/schemas/backlog";

type Props = {
  projectId: string;
  value: BacklogFilterInput;
  onChange: (v: BacklogFilterInput) => void;
};

export function BacklogFilterPicker({ projectId, value, onChange }: Props) {
  const { data: subjects = [] } = useSubjectsList(projectId);
  const { data: levels = [] } = useLevelsList(projectId);
  const { data: topics = [] } = useTopicsList(projectId);

  function toggle(field: keyof BacklogFilterInput, id: string) {
    const cur = value[field] ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onChange({ ...value, [field]: next.length ? next : undefined });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <Group title="Subject" items={subjects} selected={value.subjectIds ?? []} onToggle={(id) => toggle("subjectIds", id)} />
      <Group title="Level" items={levels} selected={value.levelIds ?? []} onToggle={(id) => toggle("levelIds", id)} />
      <Group title="Topic" items={topics} selected={value.topicIds ?? []} onToggle={(id) => toggle("topicIds", id)} />
    </div>
  );
}

function Group({
  title,
  items,
  selected,
  onToggle,
}: {
  title: string;
  items: { id: string; name: string; code?: string }[];
  selected: string[];
  onToggle: (id: string) => void;
}) {
  return (
    <div className="border rounded p-3">
      <div className="text-sm font-semibold mb-2">{title} <span className="text-xs text-muted-foreground">({selected.length || "all"})</span></div>
      <div className="max-h-40 overflow-y-auto space-y-1">
        {items.length === 0 && <div className="text-xs text-muted-foreground">no items</div>}
        {items.map((it) => (
          <label key={it.id} className="flex items-center gap-2 cursor-pointer text-sm">
            <Checkbox checked={selected.includes(it.id)} onCheckedChange={() => onToggle(it.id)} />
            <span>{it.name}{it.code ? ` (${it.code})` : ""}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
