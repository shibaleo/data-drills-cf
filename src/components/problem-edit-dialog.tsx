"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { rpc, unwrap } from "@/lib/rpc-client";
import { secondsToHms, hmsToSeconds } from "@/lib/duration";
import { MarkdownEditor } from "@/components/markdown-editor";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";
import {
  Select, SelectTrigger, SelectValue, SelectContent, SelectItem,
} from "@/components/ui/select";

interface LookupItem {
  id: string;
  name: string;
}

interface ProblemRow {
  id: string;
  code: string;
  name: string | null;
  subjectId: string | null;
  levelId: string | null;
  checkpoint: string | null;
  standardTime: number | null;
}

interface ProblemEditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problem: ProblemRow | null; // null = create mode
  projectId: string;
  subjects: LookupItem[];
  levels: LookupItem[];
  onSaved: () => void;
  onDelete?: () => void;
}

export function ProblemEditDialog({
  open, onOpenChange, problem, projectId, subjects, levels, onSaved, onDelete,
}: ProblemEditDialogProps) {
  const [saving, setSaving] = useState(false);
  const [formCode, setFormCode] = useState("");
  const [formName, setFormName] = useState("");
  const [formSubject, setFormSubject] = useState("");
  const [formLevel, setFormLevel] = useState("");
  const [formCheckpoint, setFormCheckpoint] = useState("");
  const [formStandardTime, setFormStandardTime] = useState("");

  useEffect(() => {
    if (!open) return;
    if (problem) {
      setFormCode(problem.code);
      setFormName(problem.name ?? "");
      setFormSubject(problem.subjectId ?? "");
      setFormLevel(problem.levelId ?? "");
      setFormCheckpoint(problem.checkpoint ?? "");
      setFormStandardTime(problem.standardTime != null ? secondsToHms(problem.standardTime) : "");
    } else {
      setFormCode("");
      setFormName("");
      setFormSubject(subjects[0]?.id ?? "");
      setFormLevel(levels[0]?.id ?? "");
      setFormCheckpoint("");
      setFormStandardTime("");
    }
  }, [open, problem, subjects, levels]);

  async function handleSave() {
    if (saving) return;
    if (!formCode.trim()) {
      toast.error("コードを入力してください");
      return;
    }
    setSaving(true);

    const payload = {
      code: formCode.trim(),
      name: formName.trim() || null,
      subject_id: formSubject || null,
      level_id: formLevel || null,
      checkpoint: formCheckpoint.trim() || null,
      standard_time: formStandardTime.trim() ? hmsToSeconds(formStandardTime.trim()) : null,
      project_id: projectId,
    };

    try {
      if (problem) {
        await unwrap(
          rpc.api.v1.problems[":id"].$put({
            param: { id: problem.id },
            json: payload,
          }),
        );
        toast.success("更新しました");
      } else {
        await unwrap(rpc.api.v1.problems.$post({ json: payload }));
        toast.success("登録しました");
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "保存に失敗しました");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden">
        <DialogHeader>
          <DialogTitle>{problem ? "問題を編集" : "問題を登録"}</DialogTitle>
          <DialogDescription className="sr-only">
            {problem ? "Edit problem" : "Create problem"}
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 py-2 overflow-y-auto min-h-0">
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="grid gap-2">
              <Label>科目</Label>
              <Select value={formSubject} onValueChange={setFormSubject}>
                <SelectTrigger>
                  <SelectValue placeholder="選択..." />
                </SelectTrigger>
                <SelectContent>
                  {subjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid gap-2">
              <Label>レベル</Label>
              <Select value={formLevel} onValueChange={setFormLevel}>
                <SelectTrigger>
                  <SelectValue placeholder="選択..." />
                </SelectTrigger>
                <SelectContent>
                  {levels.map((l) => (
                    <SelectItem key={l.id} value={l.id}>{l.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid sm:grid-cols-[1fr_1fr_100px] gap-4">
            <div className="grid gap-2">
              <Label>コード</Label>
              <Input
                placeholder="例: 29-45"
                value={formCode}
                onChange={(e) => setFormCode(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>問題名</Label>
              <Input
                placeholder="例: 連結CF"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </div>
            <div className="grid gap-2">
              <Label>標準時間</Label>
              <Input
                placeholder="00:05:00"
                value={formStandardTime}
                onChange={(e) => setFormStandardTime(e.target.value)}
              />
            </div>
          </div>
          <div className="grid gap-2">
            <Label>チェックポイント</Label>
            <MarkdownEditor
              compact
              defaultValue={formCheckpoint}
              onChange={setFormCheckpoint}
              placeholder="この問題で確認すべきこと"
            />
          </div>
        </div>
        <div className="flex gap-2">
          {problem && onDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete} className="mr-auto">
              削除
            </Button>
          )}
          <Button variant="outline" onClick={() => onOpenChange(false)} className={problem && onDelete ? "" : "flex-1"}>
            キャンセル
          </Button>
          <Button onClick={handleSave} disabled={saving} className={problem && onDelete ? "" : "flex-1"}>
            {problem ? "更新" : "登録"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
