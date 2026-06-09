/**
 * Member filter (subject/level) selector — colored chip toggles.
 * 各カテゴリを 1 行で並べ、entity の色を OpaqueTag で表示。
 * 選択=不透明、非選択=半透明。デザイン言語は problem-card と統一。
 * backlog / review_scope の両方から利用される。
 */
import { useSubjectsList } from "@/hooks/queries/use-subjects";
import { useLevelsList } from "@/hooks/queries/use-levels";
import { useFields } from "@/hooks/queries/use-field-data";
import { OpaqueTag } from "@/components/problem-card";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";

type Props = {
  fieldId: string;
  value: MemberFilterInput;
  onChange: (v: MemberFilterInput) => void;
  /** 最終行 (Level) の右端に並べる任意要素。count などを置く想定。 */
  trailing?: React.ReactNode;
};

export function MemberFilterPicker({ fieldId, value, onChange, trailing }: Props) {
  const { data: subjects = [] } = useSubjectsList(fieldId);
  const { data: levels = [] } = useLevelsList(fieldId);
  const { data: fields = [] } = useFields();

  function toggle(field: keyof MemberFilterInput, id: string) {
    const cur = value[field] ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onChange({ ...value, [field]: next.length ? next : undefined });
  }

  return (
    <div className="space-y-1.5">
      {fields.length > 1 && (
        <ChipRow
          label="Field"
          items={fields.map((f) => ({ id: f.id, name: f.name, color: f.color ?? null }))}
          selectedIds={value.fieldIds ?? []}
          onToggle={(id) => toggle("fieldIds", id)}
        />
      )}
      <ChipRow
        label="Subject"
        items={subjects.map((s) => ({ id: s.id, name: s.name, color: s.color ?? null }))}
        selectedIds={value.subjectIds ?? []}
        onToggle={(id) => toggle("subjectIds", id)}
      />
      <ChipRow
        label="Level"
        items={levels.map((l) => ({ id: l.id, name: l.name, color: l.color ?? null }))}
        selectedIds={value.levelIds ?? []}
        onToggle={(id) => toggle("levelIds", id)}
        trailing={trailing}
      />
    </div>
  );
}

function ChipRow({
  label, items, selectedIds, onToggle, trailing,
}: {
  label: string;
  items: { id: string; name: string; color: string | null }[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  trailing?: React.ReactNode;
}) {
  const allSelected = selectedIds.length === 0;
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-foreground w-16 shrink-0">
        {label}
      </span>
      {items.map((it) => {
        const isOn = allSelected || selectedIds.includes(it.id);
        return (
          <button
            key={it.id}
            type="button"
            onClick={() => onToggle(it.id)}
            aria-pressed={!allSelected && selectedIds.includes(it.id)}
            className={`transition-opacity ${isOn ? "opacity-100" : "opacity-30 hover:opacity-60"}`}
          >
            <OpaqueTag name={it.name} color={it.color} />
          </button>
        );
      })}
      <span className="text-[10px] text-muted-foreground/60 ml-1">
        {allSelected ? "all" : `${selectedIds.length} selected`}
      </span>
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}
