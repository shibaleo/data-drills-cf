"use client";

import { useState, useRef, useEffect } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import { ArrowUpDown, ArrowUp, ArrowDown, Trash2 } from "lucide-react";
import type { ProblemWithAnswers } from "@/hooks/queries/use-problems";
import type { ProblemUpdateInput } from "@/lib/schemas/problem";
import { computeForgettingInfo } from "@/lib/forgetting-curve";
import { secondsToHms, hmsToSeconds } from "@/lib/duration";
import { toJSTDate } from "@/lib/date-utils";
import { problemColor } from "@/lib/problem-color";
import { Button } from "@/components/ui/button";

const TAG_BASE = "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs";

export function OpaqueTag({ name, color }: { name: string; color: string | null }) {
  if (!color) {
    return <span className={`${TAG_BASE} bg-muted text-muted-foreground`}>{name}</span>;
  }
  return (
    <span
      className={TAG_BASE}
      style={{
        color,
        backgroundColor: `color-mix(in srgb, hsl(var(--card)) 80%, ${color})`,
      }}
    >
      {name}
    </span>
  );
}

interface ColumnOpts {
  subjectMap: Map<string, { name: string; color: string | null }>;
  levelMap: Map<string, { name: string; color: string | null }>;
  now: Date;
  onDelete: (id: string) => void;
  onCellUpdate: <K extends keyof ProblemUpdateInput>(
    id: string,
    field: K,
    value: ProblemUpdateInput[K],
  ) => void;
}

export function SortHeader({ column, children }: { column: { getIsSorted: () => false | "asc" | "desc"; toggleSorting: (desc: boolean) => void }; children: React.ReactNode }) {
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

function EditableCell({
  value,
  onSave,
  display,
  format,
  parse,
  className,
}: {
  value: unknown;
  onSave: (v: unknown) => void;
  display?: React.ReactNode;
  format?: (v: unknown) => string;
  parse?: (s: string) => unknown;
  className?: string;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEdit = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDraft(format ? format(value) : String(value ?? ""));
    setEditing(true);
  };

  const commit = () => {
    setEditing(false);
    const parsed = parse ? parse(draft) : draft;
    const original = format ? format(value) : String(value ?? "");
    if (draft !== original) onSave(parsed);
  };

  const cancel = () => {
    setEditing(false);
  };

  return (
    <div
      className={`relative px-1 -mx-1 py-0.5 ${className ?? ""}`}
      onClick={editing ? undefined : startEdit}
    >
      {/* Always render display content to preserve size */}
      <span className={editing ? "invisible" : "cursor-text hover:bg-muted/50 rounded block"}>
        {display ?? (value ? String(value) : <span className="text-muted-foreground">--</span>)}
      </span>
      {editing && (
        <input
          ref={inputRef}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); commit(); }
            if (e.key === "Escape") { e.preventDefault(); cancel(); }
          }}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-0 bg-transparent border-b border-primary outline-none text-xs px-1 py-0.5"
        />
      )}
    </div>
  );
}

export function getColumns({ subjectMap, levelMap, now, onDelete, onCellUpdate }: ColumnOpts): ColumnDef<ProblemWithAnswers>[] {
  return [
    {
      id: "color",
      cell: ({ row }) => {
        const subjectColor = subjectMap.get(row.original.subject_id)?.color ?? null;
        const color = problemColor(row.original.code, row.original.name ?? "", subjectColor);
        return (
          <div
            className="size-2.5 rounded-full"
            style={{ backgroundColor: color }}
          />
        );
      },
      size: 32,
    },
    {
      accessorKey: "name",
      header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.name}
          onSave={(v) => onCellUpdate(row.original.id, "name", (v as string).trim() || null)}
          className="max-w-[200px] truncate"
        />
      ),
    },
    {
      accessorKey: "code",
      header: ({ column }) => <SortHeader column={column}>Code</SortHeader>,
      cell: ({ row }) => (
        <EditableCell
          value={row.original.code}
          onSave={(v) => onCellUpdate(row.original.id, "code", v as string)}
          className="font-mono"
        />
      ),
      size: 80,
    },
    {
      id: "subject",
      accessorFn: (row) => subjectMap.get(row.subject_id)?.name ?? "",
      header: ({ column }) => <SortHeader column={column}>Subject</SortHeader>,
      cell: ({ row }) => {
        const info = subjectMap.get(row.original.subject_id);
        if (!info?.name) return null;
        return <OpaqueTag name={info.name} color={info.color} />;
      },
    },
    {
      id: "level",
      accessorFn: (row) => levelMap.get(row.level_id)?.name ?? "",
      header: ({ column }) => <SortHeader column={column}>Level</SortHeader>,
      cell: ({ row }) => {
        const info = levelMap.get(row.original.level_id);
        if (!info?.name) return null;
        return <OpaqueTag name={info.name} color={info.color} />;
      },
    },
    {
      id: "standardTime",
      accessorFn: (row) => row.standard_time,
      header: ({ column }) => <SortHeader column={column}>Std</SortHeader>,
      cell: ({ row }) => {
        const sec = row.original.standard_time;
        return (
          <EditableCell
            value={sec}
            display={
              sec != null
                ? <span className="tabular-nums">{Math.floor(sec / 60)}:{String(sec % 60).padStart(2, "0")}</span>
                : undefined
            }
            format={(v) => (v != null ? secondsToHms(v as number) : "")}
            parse={(s) => (s.trim() ? hmsToSeconds(s.trim()) : null)}
            onSave={(v) => onCellUpdate(row.original.id, "standard_time", v as number | null)}
            className="tabular-nums"
          />
        );
      },
      sortUndefined: "last",
    },
    {
      id: "answerCount",
      accessorFn: (row) => row.answers.length,
      header: ({ column }) => <SortHeader column={column}>Ans</SortHeader>,
      cell: ({ getValue }) => <span className="text-xs text-muted-foreground tabular-nums">{getValue<number>()}</span>,
    },
    {
      id: "lastAnswerDate",
      accessorFn: (row) => {
        if (row.answers.length === 0) return null;
        return row.answers.reduce((latest, a) =>
          (a.date && (!latest || a.date > latest)) ? a.date : latest,
          null as string | null,
        );
      },
      header: ({ column }) => <SortHeader column={column}>Last</SortHeader>,
      cell: ({ getValue }) => {
        const date = getValue<string | null>();
        if (!date) return <span className="text-muted-foreground text-xs">--</span>;
        return <span className="text-xs tabular-nums">{toJSTDate(date)}</span>;
      },
      sortUndefined: "last",
    },
    {
      id: "retention",
      accessorFn: (row) => computeForgettingInfo(row.answers, now)?.retention ?? -1,
      header: ({ column }) => <SortHeader column={column}>Ret</SortHeader>,
      cell: ({ getValue }) => {
        const ret = getValue<number>();
        if (ret < 0) return <span className="text-muted-foreground text-xs">--</span>;
        const pct = Math.round(ret * 100);
        const hue = ret * 120;
        return (
          <div className="flex items-center gap-1.5">
            <div className="h-1.5 w-10 rounded-full bg-muted overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{ width: `${pct}%`, backgroundColor: `hsl(${hue}, 80%, 50%)` }}
              />
            </div>
            <span className="text-[10px] text-muted-foreground tabular-nums">{pct}%</span>
          </div>
        );
      },
    },
    {
      id: "actions",
      cell: ({ row }) => (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(row.original.id); }}
          className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
        >
          <Trash2 className="size-3.5" />
        </button>
      ),
    },
  ];
}
