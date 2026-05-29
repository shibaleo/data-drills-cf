/** Backlog filter spec (subject/level) selector. Uses shared FilterSection layout. */
import { useSubjectsList } from "@/hooks/queries/use-subjects";
import { useLevelsList } from "@/hooks/queries/use-levels";
import { FilterSection } from "@/components/filter-section";
import type { BacklogFilterInput } from "@/lib/schemas/backlog";

type Props = {
  projectId: string;
  value: BacklogFilterInput;
  onChange: (v: BacklogFilterInput) => void;
};

export function BacklogFilterPicker({ projectId, value, onChange }: Props) {
  const { data: subjects = [] } = useSubjectsList(projectId);
  const { data: levels = [] } = useLevelsList(projectId);

  function apply(field: keyof BacklogFilterInput, next: Set<string>) {
    onChange({ ...value, [field]: next.size ? [...next] : undefined });
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-3">
      <FilterSection
        label={`Subject (${value.subjectIds?.length || "all"})`}
        items={subjects.map((s) => ({ value: s.id, label: s.name }))}
        selected={new Set(value.subjectIds ?? [])}
        onChange={(next) => apply("subjectIds", next)}
      />
      <FilterSection
        label={`Level (${value.levelIds?.length || "all"})`}
        items={levels.map((l) => ({ value: l.id, label: l.name }))}
        selected={new Set(value.levelIds ?? [])}
        onChange={(next) => apply("levelIds", next)}
      />
    </div>
  );
}
