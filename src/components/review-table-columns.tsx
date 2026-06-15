"use client";

import type { ColumnDef } from "@tanstack/react-table";
import { SortHeader } from "@/components/sort-header";
import { StatusTag } from "@/components/color-tags";
import { OpaqueTag } from "@/components/problem-card";
import { formatRelDay } from "@/lib/relative-day";
import type { ReviewRow as ReviewApiRow } from "@/hooks/queries/use-review-schedule";

/** /review と /plan で共有する row 形 (answerCount → reviewCount に rename)。 */
export interface ScheduleRow extends Omit<ReviewApiRow, "answerCount"> {
  reviewCount: number;
  standardTime: number | null;
}

export const reviewTableColumns: ColumnDef<ScheduleRow>[] = [
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

/** ReviewApiRow → ScheduleRow への変換 (answerCount → reviewCount)。 */
export function toScheduleRow(r: ReviewApiRow): ScheduleRow {
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
