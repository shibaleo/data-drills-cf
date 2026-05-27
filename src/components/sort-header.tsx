import { ArrowUp, ArrowDown, ArrowUpDown } from "lucide-react";
import { Button } from "@/components/ui/button";

export function SortHeader({ column, children }: {
  column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc: boolean) => void };
  children: React.ReactNode;
}) {
  const sorted = column.getIsSorted();
  return (
    <Button
      variant="ghost"
      className="-ml-3 h-8"
      onClick={() => column.toggleSorting(sorted === "asc")}
    >
      {children}
      {sorted === "asc" ? <ArrowUp className="ml-1 size-3.5" />
        : sorted === "desc" ? <ArrowDown className="ml-1 size-3.5" />
        : <ArrowUpDown className="ml-1 size-3.5 opacity-40" />}
    </Button>
  );
}
