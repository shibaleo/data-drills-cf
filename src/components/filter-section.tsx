import { Checkbox } from "@/components/ui/checkbox";

/**
 * Filter popover 内のチェックボックス列。Review / Backlog / Throughput 共通。
 */
export function FilterSection({
  label,
  items,
  selected,
  onChange,
}: {
  label: string;
  items: { value: string; label: string }[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
}) {
  const toggle = (value: string, checked: boolean | "indeterminate") => {
    const next = new Set(selected);
    if (checked === true) next.add(value); else next.delete(value);
    onChange(next);
  };
  return (
    <div>
      <div className="text-[10px] font-medium text-muted-foreground mb-1">{label}</div>
      {items.map((item) => (
        <label key={item.value} className="flex items-center gap-2 px-1 py-1 text-xs rounded-sm hover:bg-accent cursor-pointer">
          <Checkbox className="size-3.5" checked={selected.has(item.value)}
            onCheckedChange={(checked) => toggle(item.value, checked)}/>
          {item.label}
        </label>
      ))}
    </div>
  );
}
