/**
 * Member filter (field/subject/level) selector。
 *
 * UX:
 * 1. トップは Field chip row (multi-select)
 * 2. 選択された field の subjects / levels のみ表示
 * 3. 各 sub-row は左端の縦罫線 + 小さな field 名 (= field 色) で
 *    どの field の項目か視覚的に示す
 * 4. ピルは独立にシングルクリックで on/off。空配列 (= "all") 状態のときも
 *    on 表示のピルをクリックするとそれだけが off になる (内部で
 *    "all-expand → toggle → 全選択なら空に戻す" で実現)
 */
import { useQueries } from "@tanstack/react-query";
import { useFields, type Field as FieldType } from "@/hooks/queries/use-field-data";
import {
  subjectsKeys,
  type SubjectRow,
} from "@/hooks/queries/use-subjects";
import { levelsKeys, type LevelRow } from "@/hooks/queries/use-levels";
import { rpc, unwrap } from "@/lib/rpc-client";
import { OpaqueTag } from "@/components/problem-card";
import type { MemberFilterInput } from "@/lib/schemas/member-filter";

type Props = {
  /** 単一 field 用 (新規ページ等)。filter.fieldIds が空のとき採用 */
  fieldId?: string;
  value: MemberFilterInput;
  onChange: (v: MemberFilterInput) => void;
  /** flat 時、Level 行の右端に並べる任意要素 */
  trailing?: React.ReactNode;
};

export function MemberFilterPicker({ fieldId, value, onChange, trailing }: Props) {
  const { data: fields = [] } = useFields();

  // Effective fields = subjects/levels を表示する対象
  // - value.fieldIds が undefined (= "all")  → 全 user field
  // - value.fieldIds = []        (= "none") → 空 (Subject/Level も非表示)
  // - value.fieldIds = [...]                → その field
  // - 上記いずれでもなく fieldId prop があれば              → [fieldId]
  const explicitFieldIds =
    value.fieldIds !== undefined
      ? new Set(value.fieldIds)
      : fieldId
        ? new Set([fieldId])
        : null;
  const effectiveFields = explicitFieldIds
    ? fields.filter((f) => explicitFieldIds.has(f.id))
    : fields;

  // 各 effective field の subjects / levels を並列 fetch (staleTime 共有で軽量)
  const subjectQueries = useQueries({
    queries: effectiveFields.map((f) => ({
      queryKey: subjectsKeys.list(f.id),
      queryFn: async () => {
        const json = await unwrap(
          rpc.api.v1.fields[":id"].subjects.$get({ param: { id: f.id } }),
        );
        return json.data;
      },
      staleTime: 5 * 60_000,
    })),
  });
  const levelQueries = useQueries({
    queries: effectiveFields.map((f) => ({
      queryKey: levelsKeys.list(f.id),
      queryFn: async () => {
        const json = await unwrap(
          rpc.api.v1.fields[":id"].levels.$get({ param: { id: f.id } }),
        );
        return json.data;
      },
      staleTime: 5 * 60_000,
    })),
  });

  const subjectsByField = effectiveFields.map((f, i) => ({
    field: f,
    items: (subjectQueries[i]?.data ?? []) as SubjectRow[],
  }));
  const levelsByField = effectiveFields.map((f, i) => ({
    field: f,
    items: (levelQueries[i]?.data ?? []) as LevelRow[],
  }));

  const allSubjectIds = subjectsByField.flatMap((g) => g.items.map((it) => it.id));
  const allLevelIds = levelsByField.flatMap((g) => g.items.map((it) => it.id));
  const allFieldIds = fields.map((f) => f.id);

  function setCategory(
    category: keyof MemberFilterInput,
    next: string[] | undefined,
  ) {
    onChange({ ...value, [category]: next });
  }

  function toggleId(
    category: keyof MemberFilterInput,
    id: string,
    allCandidates: string[],
  ) {
    const cur = value[category];
    // undefined ("all") のときは「全 candidates が暗黙 ON」と扱って expand
    const effective = cur === undefined ? allCandidates : cur;
    const next = effective.includes(id)
      ? effective.filter((x) => x !== id)
      : [...effective, id];
    // 常に明示配列を保存 (空配列 [] = 0 件選択は維持。"all" には戻さない)
    setCategory(category, next);
  }

  /** category を "all" (undefined) に戻す */
  function resetCategory(category: keyof MemberFilterInput) {
    setCategory(category, undefined);
  }

  function isOn(category: keyof MemberFilterInput, id: string): boolean {
    const arr = value[category];
    if (arr === undefined) return true; // "all" mode
    return arr.includes(id);
  }

  return (
    <div className="space-y-2.5">
      {fields.length > 1 && (
        <ChipRow
          label="Field"
          items={fields.map((f) => ({ id: f.id, name: f.name, color: f.color ?? null }))}
          isOn={(id) => isOn("fieldIds", id)}
          onToggle={(id) => toggleId("fieldIds", id, allFieldIds)}
          summary={summarize(value.fieldIds, fields.length)}
          isExplicit={value.fieldIds !== undefined}
          onReset={() => resetCategory("fieldIds")}
        />
      )}

      {effectiveFields.length === 0 ? (
        <div className="text-xs text-muted-foreground italic px-1">
          Pick at least one field
        </div>
      ) : (
        <>
          <CategoryGroup
            label="Subject"
            summary={summarize(value.subjectIds, allSubjectIds.length)}
            isExplicit={value.subjectIds !== undefined}
            onReset={() => resetCategory("subjectIds")}
          >
            {subjectsByField.map(({ field, items }) => (
              <FieldGroupedChipRow
                key={field.id}
                field={field}
                items={items}
                isOn={(id) => isOn("subjectIds", id)}
                onToggle={(id) => toggleId("subjectIds", id, allSubjectIds)}
              />
            ))}
          </CategoryGroup>
          <CategoryGroup
            label="Level"
            summary={summarize(value.levelIds, allLevelIds.length)}
            isExplicit={value.levelIds !== undefined}
            onReset={() => resetCategory("levelIds")}
            trailing={trailing}
          >
            {levelsByField.map(({ field, items }) => (
              <FieldGroupedChipRow
                key={field.id}
                field={field}
                items={items}
                isOn={(id) => isOn("levelIds", id)}
                onToggle={(id) => toggleId("levelIds", id, allLevelIds)}
              />
            ))}
          </CategoryGroup>
        </>
      )}
    </div>
  );
}

function summarize(arr: string[] | undefined, totalCount: number): string {
  if (arr === undefined) return "all";
  if (arr.length === 0) return "none";
  return `${arr.length} / ${totalCount}`;
}

/* ── grouped layout (per-field rows) ── */

function CategoryGroup({
  label,
  summary,
  isExplicit,
  onReset,
  children,
  trailing,
}: {
  label: string;
  summary: string;
  isExplicit: boolean;
  onReset: () => void;
  children: React.ReactNode;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2">
        <div className="text-xs font-semibold text-foreground">{label}</div>
        <div className="text-[10px] text-muted-foreground/60">{summary}</div>
        {isExplicit && (
          <button
            type="button"
            onClick={onReset}
            className="text-[10px] text-primary hover:underline"
            title="Clear constraint (reset to all)"
          >
            reset
          </button>
        )}
        {trailing && <div className="ml-auto">{trailing}</div>}
      </div>
      <div className="space-y-1">{children}</div>
    </div>
  );
}

function FieldGroupedChipRow({
  field,
  items,
  isOn,
  onToggle,
}: {
  field: FieldType;
  items: (SubjectRow | LevelRow)[];
  isOn: (id: string) => boolean;
  onToggle: (id: string) => void;
}) {
  const fieldColor = field.color ?? "rgb(115 115 115)";
  return (
    <div
      className="flex items-center gap-2 pl-2 border-l-2"
      style={{ borderColor: fieldColor }}
    >
      <span
        className="text-[10px] font-medium w-20 shrink-0 truncate"
        style={{ color: fieldColor }}
      >
        {field.name}
      </span>
      <div className="flex items-center flex-wrap gap-1.5 py-0.5">
        {items.length === 0 && (
          <span className="text-[10px] text-muted-foreground/60 italic">—</span>
        )}
        {items.map((it) => (
          <Pill
            key={it.id}
            name={it.name}
            color={it.color ?? null}
            on={isOn(it.id)}
            onClick={() => onToggle(it.id)}
          />
        ))}
      </div>
    </div>
  );
}

/* ── single-row chip layout ── */

function ChipRow({
  label,
  items,
  isOn,
  onToggle,
  summary,
  isExplicit,
  onReset,
  trailing,
}: {
  label: string;
  items: { id: string; name: string; color: string | null }[];
  isOn: (id: string) => boolean;
  onToggle: (id: string) => void;
  summary: string;
  isExplicit?: boolean;
  onReset?: () => void;
  trailing?: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 flex-wrap">
      <span className="text-xs font-semibold text-foreground w-16 shrink-0">
        {label}
      </span>
      {items.map((it) => (
        <Pill
          key={it.id}
          name={it.name}
          color={it.color}
          on={isOn(it.id)}
          onClick={() => onToggle(it.id)}
        />
      ))}
      <span className="text-[10px] text-muted-foreground/60 ml-1">{summary}</span>
      {isExplicit && onReset && (
        <button
          type="button"
          onClick={onReset}
          className="text-[10px] text-primary hover:underline"
          title="Clear constraint (reset to all)"
        >
          reset
        </button>
      )}
      {trailing && <div className="ml-auto">{trailing}</div>}
    </div>
  );
}

function Pill({
  name,
  color,
  on,
  onClick,
}: {
  name: string;
  color: string | null;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={on}
      className={`transition-opacity ${on ? "opacity-100" : "opacity-30 hover:opacity-60"}`}
    >
      <OpaqueTag name={name} color={color} />
    </button>
  );
}
