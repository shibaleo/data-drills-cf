"use client";

import type { ColumnDef } from "@tanstack/react-table";
import type { ColDef, ICellRendererParams } from "ag-grid-community";
import { SortHeader } from "@/components/sort-header";
import { StatusTag } from "@/components/color-tags";
import { OpaqueTag } from "@/components/problem-card";
import { formatRelDay } from "@/lib/relative-day";
import type { SrsRow } from "@/hooks/queries/use-srs";

/** Plan の Schedule テーブル row 形 (SrsRow の answerCount → reviewCount に rename)。 */
export interface ScheduleRow extends Omit<SrsRow, "answerCount"> {
  reviewCount: number;
  standardTime: number | null;
}

/** @deprecated TanStack Table 用。AG Grid 化後は planScheduleColDefs を使う。 */
export const planScheduleColumns: ColumnDef<ScheduleRow>[] = [
  {
    accessorKey: "lastStatus",
    header: ({ column }) => <SortHeader column={column}>Status</SortHeader>,
    cell: ({ row }) => (
      <StatusTag status={row.original.lastStatus} color={row.original.statusColor} opaque className="text-[10px]" />
    ),
    size: 70,
  },
  {
    accessorKey: "fieldName",
    header: ({ column }) => <SortHeader column={column}>Field</SortHeader>,
    cell: ({ row }) => row.original.fieldName ? (
      <OpaqueTag name={row.original.fieldName} color={row.original.fieldColor} />
    ) : null,
    size: 80,
  },
  {
    accessorKey: "subjectName",
    header: ({ column }) => <SortHeader column={column}>Subject</SortHeader>,
    cell: ({ row }) => row.original.subjectName ? (
      <OpaqueTag name={row.original.subjectName} color={row.original.subjectColor} />
    ) : null,
    size: 70,
  },
  {
    accessorKey: "levelName",
    header: ({ column }) => <SortHeader column={column}>Level</SortHeader>,
    cell: ({ row }) => row.original.levelName ? (
      <OpaqueTag name={row.original.levelName} color={row.original.levelColor} />
    ) : null,
    size: 70,
  },
  {
    accessorKey: "code",
    header: ({ column }) => <SortHeader column={column}>Code</SortHeader>,
    cell: ({ getValue }) => (
      <span className="font-mono text-xs">{getValue<string>()}</span>
    ),
    size: 64,
  },
  {
    accessorKey: "name",
    header: ({ column }) => <SortHeader column={column}>Name</SortHeader>,
    cell: ({ getValue }) => (
      <span className="truncate block text-xs">{getValue<string>()}</span>
    ),
    size: 240,
  },
  {
    accessorKey: "daysUntil",
    header: ({ column }) => <SortHeader column={column}>Days</SortHeader>,
    size: 64,
    cell: ({ getValue }) => {
      const d = getValue<number>();
      return (
        <span className={`text-xs tabular-nums font-medium ${
          d < 0 ? "text-red-500" : d === 0 ? "text-foreground" : "text-muted-foreground"
        }`}>
          {formatRelDay(d)}
        </span>
      );
    },
  },
  {
    accessorKey: "nextReview",
    header: ({ column }) => <SortHeader column={column}>Next</SortHeader>,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground tabular-nums">{getValue<string>()}</span>
    ),
    size: 100,
  },
  {
    accessorKey: "reviewCount",
    header: ({ column }) => <SortHeader column={column}>Ans</SortHeader>,
    cell: ({ getValue }) => (
      <span className="text-xs text-muted-foreground tabular-nums">{getValue<number>()}</span>
    ),
    size: 64,
  },
];

/** AG Grid 用 ColDef (列幅は TanStack 版と同一)。 */
const CENTER_CELL = "ag-cell-center";
const CENTER_HEADER = "ag-header-center";

export const planScheduleColDefs: ColDef<ScheduleRow>[] = [
  {
    headerName: "Status",
    field: "lastStatus",
    width: 70,
    cellClass: CENTER_CELL,
    headerClass: CENTER_HEADER,
    cellRenderer: (p: ICellRendererParams<ScheduleRow>) => (
      <StatusTag
        status={p.data?.lastStatus ?? ""}
        color={p.data?.statusColor ?? null}
        opaque
        className="text-[10px]"
      />
    ),
  },
  {
    headerName: "Field",
    field: "fieldName",
    width: 80,
    hide: true,
    cellClass: CENTER_CELL,
    headerClass: CENTER_HEADER,
    cellRenderer: (p: ICellRendererParams<ScheduleRow>) =>
      p.data?.fieldName ? <OpaqueTag name={p.data.fieldName} color={p.data.fieldColor ?? null} /> : null,
  },
  {
    headerName: "Subject",
    field: "subjectName",
    width: 70,
    cellClass: CENTER_CELL,
    headerClass: CENTER_HEADER,
    cellRenderer: (p: ICellRendererParams<ScheduleRow>) =>
      p.data?.subjectName ? <OpaqueTag name={p.data.subjectName} color={p.data.subjectColor ?? null} /> : null,
  },
  {
    headerName: "Level",
    field: "levelName",
    width: 70,
    cellClass: CENTER_CELL,
    headerClass: CENTER_HEADER,
    cellRenderer: (p: ICellRendererParams<ScheduleRow>) =>
      p.data?.levelName ? <OpaqueTag name={p.data.levelName} color={p.data.levelColor ?? null} /> : null,
  },
  {
    headerName: "Code",
    field: "code",
    width: 64,
    cellClass: "font-mono text-xs",
  },
  {
    headerName: "Name",
    field: "name",
    width: 240,
    cellClass: "text-xs",
  },
  {
    headerName: "Days",
    field: "daysUntil",
    width: 64,
    cellClass: "text-xs tabular-nums font-medium",
    cellRenderer: (p: ICellRendererParams<ScheduleRow, number>) => {
      const d = p.value ?? 0;
      const cls = d < 0 ? "text-red-500" : d === 0 ? "text-foreground" : "text-muted-foreground";
      return <span className={cls}>{formatRelDay(d)}</span>;
    },
  },
  {
    headerName: "Next",
    field: "nextReview",
    width: 100,
    cellClass: "text-xs text-muted-foreground tabular-nums",
  },
  {
    headerName: "Ans",
    field: "reviewCount",
    width: 64,
    cellClass: "text-xs text-muted-foreground tabular-nums",
  },
];

/** SrsRow → ScheduleRow への変換 (answerCount → reviewCount)。 */
export function toScheduleRow(r: SrsRow): ScheduleRow {
  return {
    problemId: r.problemId,
    code: r.code,
    name: r.name,
    fieldId: r.fieldId,
    fieldName: r.fieldName,
    fieldColor: r.fieldColor,
    subjectId: r.subjectId,
    subjectName: r.subjectName,
    subjectColor: r.subjectColor,
    levelId: r.levelId,
    levelName: r.levelName,
    levelColor: r.levelColor,
    color: r.color,
    lastStatusId: r.lastStatusId,
    lastStatus: r.lastStatus,
    statusColor: r.statusColor,
    nextReview: r.nextReview,
    daysUntil: r.daysUntil,
    reviewCount: r.answerCount,
    standardTime: r.standardTime,
    lastDuration: r.lastDuration,
    answerHistory: r.answerHistory,
  };
}
