"use client";

import { useState } from "react";
import { toast } from "sonner";
import { api } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { usePageTitle } from "@/lib/page-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

interface ScanItem {
  driveFileId: string;
  fileName: string;
  code: string;
  subtopic: string;
  subjectName: string;
  levelCode: string;
  fileRole: "problem" | "answer-sheet";
  problemPages: number[];
  totalPages: number;
  action: "update" | "create";
  existingProblemId?: string;
  existingName?: string;
}

const LEVEL_LABELS: Record<string, string> = {
  training: "トレ",
  "theme-exec": "テーマ",
  "skill-test": "実力",
};

export default function PdfSyncPage() {
  usePageTitle("PDF Sync");
  const { currentProject } = useProject();

  const [scanning, setScanning] = useState(false);
  const [items, setItems] = useState<ScanItem[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [applying, setApplying] = useState<Record<number, boolean>>({});
  const [applied, setApplied] = useState<Set<number>>(new Set());
  const [editedNames, setEditedNames] = useState<Record<number, string>>({});

  const handleScan = async () => {
    if (!currentProject?.id) return;
    setScanning(true);
    setItems([]);
    setSkipped([]);
    setApplied(new Set());
    setEditedNames({});
    try {
      const res = await api.post<{
        data: { items: ScanItem[]; skipped: string[] };
      }>("/pdf-sync/scan", {
        project_id: currentProject.id,
      });
      setItems(res.data.items);
      setSkipped(res.data.skipped);
      const names: Record<number, string> = {};
      res.data.items.forEach((item, i) => {
        names[i] = item.subtopic;
      });
      setEditedNames(names);
      toast.success(`${res.data.items.length} 件検出`);
    } catch (err) {
      toast.error(`スキャン失敗: ${err instanceof Error ? err.message : err}`);
    } finally {
      setScanning(false);
    }
  };

  const handleApply = async (index: number) => {
    if (!currentProject?.id) return;
    const item = items[index];
    setApplying((prev) => ({ ...prev, [index]: true }));
    try {
      await api.post("/pdf-sync/apply", {
        project_id: currentProject.id,
        item: {
          ...item,
          name: editedNames[index] ?? item.subtopic,
        },
      });
      setApplied((prev) => new Set(prev).add(index));
      toast.success(`${item.code} 適用完了`);
    } catch (err) {
      toast.error(`適用失敗: ${err instanceof Error ? err.message : err}`);
    } finally {
      setApplying((prev) => ({ ...prev, [index]: false }));
    }
  };

  const handleApplyAll = async () => {
    if (!currentProject?.id) return;
    const pending = items
      .map((_, i) => i)
      .filter((i) => !applied.has(i));
    for (const i of pending) {
      await handleApply(i);
    }
  };

  return (
    <div className="space-y-6">
      {/* Scan controls */}
      <div className="flex items-center gap-3">
        <Button onClick={handleScan} disabled={scanning}>
          {scanning ? "スキャン中..." : "スキャン"}
        </Button>
        {items.length > 0 && (
          <Button
            variant="outline"
            onClick={handleApplyAll}
            disabled={applied.size === items.length}
          >
            全て適用 ({items.length - applied.size})
          </Button>
        )}
      </div>

      {/* Results table */}
      {items.length > 0 && (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-40">コード</TableHead>
                <TableHead>名前</TableHead>
                <TableHead className="w-20 text-center">ページ</TableHead>
                <TableHead className="w-24 text-center">アクション</TableHead>
                <TableHead className="w-24 text-center" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((item, i) => {
                const isDone = applied.has(i);
                const isApplying = applying[i];
                return (
                  <TableRow
                    key={i}
                    className={isDone ? "opacity-50" : undefined}
                  >
                    <TableCell className="text-sm">
                      <span className="font-mono">{item.code}</span>
                      <span className="ml-1.5 text-[10px] text-muted-foreground">
                        {item.subjectName}/{LEVEL_LABELS[item.levelCode] ?? item.levelCode}
                      </span>
                      {item.fileRole === "answer-sheet" && (
                        <span className="ml-1 text-[10px] text-orange-500">答案</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        className="h-7 text-sm"
                        value={editedNames[i] ?? item.subtopic}
                        onChange={(e) =>
                          setEditedNames((prev) => ({
                            ...prev,
                            [i]: e.target.value,
                          }))
                        }
                        disabled={isDone}
                      />
                      {item.existingName && (
                        <span className="text-[10px] text-muted-foreground">
                          現在: {item.existingName}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-sm">
                      {item.problemPages.length}/{item.totalPages}
                    </TableCell>
                    <TableCell className="text-center">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          item.action === "create"
                            ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                            : "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                        }`}
                      >
                        {item.action === "create" ? "新規" : "更新"}
                      </span>
                    </TableCell>
                    <TableCell className="text-center">
                      <Button
                        size="sm"
                        variant={isDone ? "ghost" : "default"}
                        disabled={isDone || isApplying}
                        onClick={() => handleApply(i)}
                      >
                        {isDone ? "済" : isApplying ? "..." : "適用"}
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Skipped files */}
      {skipped.length > 0 && (
        <details className="text-sm">
          <summary className="cursor-pointer text-muted-foreground">
            スキップ: {skipped.length} 件
          </summary>
          <ul className="mt-1 ml-4 list-disc text-muted-foreground">
            {skipped.map((name, i) => (
              <li key={i}>{name}</li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
