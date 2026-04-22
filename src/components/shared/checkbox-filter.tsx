"use client";

import { ChevronsUpDown } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";

interface CheckboxFilterItem {
  value: string;
  label: string;
}

/**
 * Multi-select checkbox filter in a popover.
 *
 * - selected が空 = 全選択扱い (allLabel 表示)
 * - 1つ以上チェック = 選択されたもののみフィルタ
 */
export function CheckboxFilter({
  items,
  selected,
  onChange,
  allLabel,
  width = "w-[140px]",
}: {
  items: CheckboxFilterItem[];
  selected: Set<string>;
  onChange: (next: Set<string>) => void;
  allLabel: string;
  width?: string;
}) {
  const label =
    selected.size === 0 || selected.size === items.length
      ? allLabel
      : `${selected.size} 件選択`;

  const toggle = (value: string, checked: boolean | "indeterminate") => {
    const next = new Set(selected);
    if (checked === true) next.add(value);
    else next.delete(value);
    onChange(next);
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          className={`h-7 ${width} justify-between text-xs font-normal`}
        >
          <span className="truncate">{label}</span>
          <ChevronsUpDown className="ml-1 size-3 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-2 max-h-60 overflow-y-auto">
        {items.map((item) => (
          <label
            key={item.value}
            className="flex items-center gap-2 px-2 py-1.5 text-xs rounded-sm hover:bg-accent cursor-pointer"
          >
            <Checkbox
              checked={selected.has(item.value)}
              onCheckedChange={(checked) => toggle(item.value, checked)}
            />
            {item.label}
          </label>
        ))}
      </PopoverContent>
    </Popover>
  );
}
