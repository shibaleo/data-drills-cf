/**
 * Member filter (field/subject/level) selector — colored chip toggles。
 *
 * - 1 field のみ対象 (fieldId prop または filter.fieldIds = [single]): flat 表示
 * - 複数 field 対象: テーブル形式 (行 = field、列 = Subject / Level)
 * - 行 = 「effective field」: filter.fieldIds が指定されていればその集合、
 *   未指定なら fieldId prop の field、それも無ければ全 user field
 */
import { useSubjectsList, type SubjectRow } from "@/hooks/queries/use-subjects";
import { useLevelsList, type LevelRow } from "@/hooks/queries/use-levels";
import { useFields, type Field as FieldType } from "@/hooks/queries/use-field-data";
import { OpaqueTag } from "@/components/problem-card";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";

type Props = {
  /** 単一 field のときに渡す (新規ページ用)。filter.fieldIds が空のとき採用 */
  fieldId?: string;
  value: MemberFilterInput;
  onChange: (v: MemberFilterInput) => void;
  /** Level 行 (flat 時) または最終 cell の右端に並べる任意要素 */
  trailing?: React.ReactNode;
};

type ToggleFn = (field: keyof MemberFilterInput, id: string) => void;

export function MemberFilterPicker({ fieldId, value, onChange, trailing }: Props) {
  const { data: fields = [] } = useFields();

  const toggle: ToggleFn = (field, id) => {
    const cur = value[field] ?? [];
    const next = cur.includes(id) ? cur.filter((x) => x !== id) : [...cur, id];
    onChange({ ...value, [field]: next.length ? next : undefined });
  };

  // Effective fields = subjects/levels を表示する対象。
  // priority: filter.fieldIds > fieldId prop > 全 user field
  const explicitFieldIds =
    value.fieldIds && value.fieldIds.length > 0
      ? new Set(value.fieldIds)
      : fieldId
        ? new Set([fieldId])
        : null;
  const effectiveFields = explicitFieldIds
    ? fields.filter((f) => explicitFieldIds.has(f.id))
    : fields;

  return (
    <div className="space-y-2">
      {fields.length > 1 && (
        <ChipRow
          label="Field"
          items={fields.map((f) => ({ id: f.id, name: f.name, color: f.color ?? null }))}
          selectedIds={value.fieldIds ?? []}
          onToggle={(id) => toggle("fieldIds", id)}
        />
      )}
      {effectiveFields.length === 0 ? (
        <div className="text-xs text-muted-foreground italic px-1">
          Field を 1 つ以上選んでください
        </div>
      ) : effectiveFields.length === 1 ? (
        <FlatLayout
          field={effectiveFields[0]}
          value={value}
          toggle={toggle}
          trailing={trailing}
        />
      ) : (
        <TableLayout fields={effectiveFields} value={value} toggle={toggle} />
      )}
    </div>
  );
}

/* ── single-field flat layout (= 既存の見た目) ── */

function FlatLayout({
  field,
  value,
  toggle,
  trailing,
}: {
  field: FieldType;
  value: MemberFilterInput;
  toggle: ToggleFn;
  trailing?: React.ReactNode;
}) {
  const { data: subjects = [] } = useSubjectsList(field.id);
  const { data: levels = [] } = useLevelsList(field.id);
  return (
    <div className="space-y-1.5">
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

/* ── multi-field table layout ── */

function TableLayout({
  fields,
  value,
  toggle,
}: {
  fields: FieldType[];
  value: MemberFilterInput;
  toggle: ToggleFn;
}) {
  return (
    <div className="rounded-md border overflow-hidden">
      <div className="grid grid-cols-[auto_1fr_1fr] text-xs">
        <HeaderCell>Field</HeaderCell>
        <HeaderCell>Subject</HeaderCell>
        <HeaderCell>Level</HeaderCell>
        {fields.map((f, i) => (
          <FieldTableRow
            key={f.id}
            field={f}
            value={value}
            toggle={toggle}
            isLast={i === fields.length - 1}
          />
        ))}
      </div>
    </div>
  );
}

function HeaderCell({ children }: { children: React.ReactNode }) {
  return (
    <div className="px-2.5 py-1.5 font-semibold bg-muted/40 border-b border-border/60 text-muted-foreground">
      {children}
    </div>
  );
}

function FieldTableRow({
  field,
  value,
  toggle,
  isLast,
}: {
  field: FieldType;
  value: MemberFilterInput;
  toggle: ToggleFn;
  isLast: boolean;
}) {
  const { data: subjects = [] } = useSubjectsList(field.id);
  const { data: levels = [] } = useLevelsList(field.id);
  const border = isLast ? "" : "border-b border-border/40";
  return (
    <>
      <div className={`px-2.5 py-2 flex items-center gap-2 bg-muted/10 ${border}`}>
        <OpaqueTag name={field.name} color={field.color ?? null} />
      </div>
      <ChipCell
        items={subjects}
        selectedIds={value.subjectIds ?? []}
        onToggle={(id) => toggle("subjectIds", id)}
        border={border}
      />
      <ChipCell
        items={levels}
        selectedIds={value.levelIds ?? []}
        onToggle={(id) => toggle("levelIds", id)}
        border={border}
      />
    </>
  );
}

function ChipCell({
  items,
  selectedIds,
  onToggle,
  border,
}: {
  items: (SubjectRow | LevelRow)[];
  selectedIds: string[];
  onToggle: (id: string) => void;
  border: string;
}) {
  const allSelected = selectedIds.length === 0;
  return (
    <div className={`px-2.5 py-2 flex items-center flex-wrap gap-1.5 ${border}`}>
      {items.length === 0 && (
        <span className="text-[10px] text-muted-foreground/60 italic">—</span>
      )}
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
            <OpaqueTag name={it.name} color={it.color ?? null} />
          </button>
        );
      })}
    </div>
  );
}

/* ── single-row chip layout (flat) ── */

function ChipRow({
  label,
  items,
  selectedIds,
  onToggle,
  trailing,
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
