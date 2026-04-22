"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, ApiError } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useSubjectLevelFilter } from "@/hooks/use-subject-level-filter";
import { useAnswerForm, useEditAnswerForm } from "@/hooks/use-answer-form";
import { usePageTitle } from "@/lib/page-context";
import { ProblemDetailDialog } from "@/components/problem-detail-dialog";
import { ProblemEditDialog } from "@/components/problem-edit-dialog";
import { AnswerDialog } from "@/components/answer-dialog";
import { StatusTag } from "@/components/color-tags";
import type { ProblemWithAnswers } from "@/components/problem-card";
import type { Problem } from "@/lib/types";
import type { AnswerListRow } from "@/lib/api-responses";
import { toJSTDate } from "@/lib/date-utils";

export default function AnswersPage() {
  usePageTitle("Answers");
  const { currentProject, subjects, levels } = useProject();
  const [rows, setRows] = useState<AnswerListRow[]>([]);
  const [problemsWithAnswers, setProblemsWithAnswers] = useState<ProblemWithAnswers[]>([]);
  const [loading, setLoading] = useState(true);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProblemId, setDetailProblemId] = useState<string | null>(null);
  const detailProblem = detailProblemId ? problemsWithAnswers.find(p => p.id === detailProblemId) ?? null : null;

  // Problem edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editProblem, setEditProblem] = useState<Problem | null>(null);

  const now = useMemo(() => new Date(), []);

  const fetchData = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const [rowsRes, problemsRes] = await Promise.all([
        api.get<{ data: AnswerListRow[] }>(`/answers-list?project_id=${currentProject.id}`),
        api.get<{ data: ProblemWithAnswers[] }>(`/problems-list?project_id=${currentProject.id}`),
      ]);
      setRows(rowsRes.data);
      setProblemsWithAnswers(problemsRes.data);
    } catch {
      toast.error("Failed to fetch answers");
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const filteredRows = useSubjectLevelFilter(rows, { subject: "subjectId", level: "levelId" });

  // Answer create/edit forms
  const answerForm = useAnswerForm(() => { fetchData(); });
  const editForm = useEditAnswerForm(() => { fetchData(); });

  const handleEditProblem = (p: Problem) => {
    setDetailOpen(false);
    setEditProblem(p);
    setEditDialogOpen(true);
  };

  const handleDeleteProblem = async (id: string) => {
    try {
      await api.delete(`/problems/${id}`);
      toast.success("削除しました");
      setDetailOpen(false);
      fetchData();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました");
    }
  };

  const handleDeleteAnswer = async (id: string) => {
    try {
      await api.delete(`/answers/${id}`);
      toast.success("削除しました");
      fetchData();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました");
    }
  };

  const handleRowClick = (problemId: string) => {
    setDetailProblemId(problemId);
    setDetailOpen(true);
  };

  if (!currentProject) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">Please select a project</div>
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6">
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">Loading...</div>
      ) : filteredRows.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No answers found</div>
      ) : (
        <div className="border border-border rounded-md overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/50 text-left">
                <th className="py-2 px-3 font-medium">Date</th>
                <th className="py-2 px-3 font-medium">Duration</th>
                <th className="py-2 px-3 font-medium">Status</th>
                <th className="py-2 px-3 font-medium">Problem</th>
                <th className="py-2 px-3 font-medium">Subject</th>
                <th className="py-2 px-3 font-medium">Level</th>
                <th className="py-2 px-3 font-medium">Code</th>
                <th className="py-2 px-3 font-medium w-10"></th>
              </tr>
            </thead>
            <tbody>
              {filteredRows.map((r) => (
                <tr
                  key={r.id}
                  className="border-b border-border/30 transition-colors cursor-pointer hover:bg-accent/20"
                  onClick={() => handleRowClick(r.problemId)}
                >
                  <td className="py-2 px-3 text-xs">{r.date ? toJSTDate(r.date) : ""}</td>
                  <td className="py-2 px-3 font-mono text-xs text-muted-foreground">{r.duration ?? ""}</td>
                  <td className="py-2 px-3">
                    {r.status && <StatusTag status={r.status} color={r.statusColor} opaque />}
                  </td>
                  <td className="py-2 px-3">{r.problemName}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.subjectName}</td>
                  <td className="py-2 px-3 text-muted-foreground">{r.levelName}</td>
                  <td className="py-2 px-3 font-mono text-xs">{r.code}</td>
                  <td className="py-2 px-3">
                    <button
                      type="button"
                      onClick={(e) => { e.stopPropagation(); handleDeleteAnswer(r.id); }}
                      className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Problem detail dialog (ProblemCard) */}
      <ProblemDetailDialog
        open={detailOpen}
        onOpenChange={setDetailOpen}
        problem={detailProblem}
        now={now}
        onEditProblem={handleEditProblem}
        onEditAnswer={(answer, problem) => {
          setDetailOpen(false);
          editForm.openFor(answer, problem);
        }}
        onCheck={(problem) => {
          setDetailOpen(false);
          answerForm.openForProblem(problem as Problem & { answers: { date: string | null; status: string | null }[] });
        }}
        onDelete={handleDeleteProblem}
        onPdfLinked={() => fetchData()}
      />

      {/* Problem edit dialog */}
      <ProblemEditDialog
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        problem={editProblem ? {
          id: editProblem.id,
          code: editProblem.code,
          name: editProblem.name,
          subjectId: editProblem.subject_id,
          levelId: editProblem.level_id,
          checkpoint: editProblem.checkpoint,
          standardTime: editProblem.standard_time,
        } : null}
        projectId={currentProject.id}
        subjects={subjects}
        levels={levels}
        onSaved={() => { setEditDialogOpen(false); fetchData(); }}
        onDelete={editProblem ? () => handleDeleteProblem(editProblem.id) : undefined}
      />

      {/* Answer create dialog */}
      <AnswerDialog
        open={answerForm.open}
        onOpenChange={answerForm.setOpen}
        title="解答を登録"
        subject={answerForm.subject}
        onSubjectChange={answerForm.setSubject}
        level={answerForm.level}
        onLevelChange={answerForm.setLevel}
        code={answerForm.code}
        onCodeChange={answerForm.setCode}
        codeSuggestions={answerForm.codeSuggestions}
        checkpointMap={answerForm.checkpointMap}
        nameMap={answerForm.nameMap}
        status={answerForm.status}
        onStatusChange={answerForm.setStatus}
        duration={answerForm.duration}
        onDurationChange={answerForm.setDuration}
        reviews={answerForm.reviews}
        onAddReview={answerForm.addReview}
        onUpdateReview={answerForm.updateReview}
        onRemoveReview={answerForm.removeReview}
        saveLabel="登録"
        onSave={answerForm.save}
      />

      {/* Answer edit dialog */}
      <AnswerDialog
        open={editForm.open}
        onOpenChange={editForm.setOpen}
        title="解答を編集"
        subject={editForm.subject}
        onSubjectChange={editForm.setSubject}
        level={editForm.level}
        onLevelChange={editForm.setLevel}
        code={editForm.code}
        onCodeChange={editForm.setCode}
        codeSuggestions={editForm.codeSuggestions}
        checkpointMap={editForm.checkpointMap}
        nameMap={editForm.nameMap}
        status={editForm.status}
        onStatusChange={editForm.setStatus}
        duration={editForm.duration}
        onDurationChange={editForm.setDuration}
        reviews={editForm.reviews}
        onAddReview={editForm.addReview}
        onUpdateReview={editForm.updateReview}
        onRemoveReview={editForm.removeReview}
        saveLabel="保存"
        onSave={editForm.save}
      />
    </div>
  );
}
