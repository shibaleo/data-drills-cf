import { Link } from "@tanstack/react-router";
import { useScopes } from "@/hooks/queries/use-scopes";

type Props = {
  value: string | null;
  onChange: (v: string | null) => void;
  dirty?: boolean;
  disabled?: boolean;
};

export function ScopePickerBar({ value, onChange, dirty, disabled }: Props) {
  const { data: scopes = [] } = useScopes();
  return (
    <div className={`rounded-md border px-3 py-1.5 text-xs flex items-center gap-2 ${dirty ? "border-primary/40 bg-primary/5" : ""}`}>
      <span className="text-[10px] text-muted-foreground">Scope:</span>
      <select
        className="text-[11px] rounded border bg-background px-2 py-0.5"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        disabled={disabled}
      >
        <option value="">— inline filter (legacy)</option>
        {scopes.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      {value && (
        <Link
          to={"/scopes/$scope_id" as string}
          params={{ scope_id: value }}
          className="text-[10px] text-primary hover:underline"
        >
          Edit scope →
        </Link>
      )}
    </div>
  );
}
