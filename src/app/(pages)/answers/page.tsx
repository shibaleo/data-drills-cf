"use client";

import { useState, useCallback, useMemo } from "react";
import { Trash2 } from "lucide-react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useSubjectLevelFilter } from "@/hooks/use-subject-level-filter";
import { useAnswerForm, useEditAnswerForm } from "@/hooks/use-answer-form";
import { usePageTitle } from "@/lib/page-context";
import { ProblemDetailDialog } from "@/components/problem-detail-dialog";
import { ProblemEditDialog } from "@/components/problem-edit-dialog";
import { AnswerDialog } from "@/components/answer-dialog";
import { StatusTag } from "@/components/color-tags";
import {
  useAnswersPageData,
  useDeleteAnswer,
  answersKeys,
} from "@/hooks/queries/use-answers";
import { useDeleteProblem, problemsKeys } from "@/hooks/queries/use-problems";
import type { Problem } from "@/lib/types";
import { toJSTDate } from "@/lib/date-utils";

export default function AnswersPage() {
  usePageTitle("Answers");
  const { currentProject, subjects, levels } = useProject();
  const qc = useQueryClient();

  const { rows, problems: problemsWithAnswers, isLoading } = useAnswersPageData(currentProject?.id);
  const deleteAnswer = useDeleteAnswer(currentProject?.id);
  const deleteProblem = useDeleteProblem(currentProject?.id);

  const invalidate = useCallback(() => {
    if (!currentProject) return;
    qc.invalidateQueries({ queryKey: answersKeys.list(currentProject.id) });
    qc.invalidateQueries({ queryKey: problemsKeys.list(currentProject.id) });
  }, [qc, currentProject]);

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProblemId, setDetailProblemId] = useState<string | null>(null);
  const detailProblem = detailProblemId ? problemsWithAnswers.find(p => p.id === detailProblemId) ?? null : null;

  // Problem edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editProblem, setEditProblem] = useState<Problem | null>(null);

  const now = useMemo(() => new Date(), []);

  const filteredRows = useSubjectLevelFilter(rows, { subject: "subjectId", level: "levelId" });

  // Answer create/edit forms
  const answerForm = useAnswerForm(invalidate);
  const editForm = useEditAnswerForm(invalidate);

  const handleEditProblem = (p: Problem) => {
    setDetailOpen(false);
    setEditProblem(p);
    setEditDialogOpen(true);
  };

  const handleDeleteProblem = (id: string) => {
    deleteProblem.mutate(id, {
      onSuccess: () => {
        toast.success("削除しました");
        setDetailOpen(false);
        invalidate();
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました"),
    });
  };

  const handleDeleteAnswer = (id: string) => {
    deleteAnswer.mutate(id, {
      onSuccess: () => toast.success("削除しました"),
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました"),
    });
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
      {isLoading ? (
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
        onPdfLinked={invalidate}
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
        onSaved={() => { setEditDialogOpen(false); invalidate(); }}
        onDelete={editProblem ? () => handleDeleteProblem(editProblem.id) : undefined}
      />

      {/* Answer create dialog */}
      <AnswerDialog
        open={answerForm.open}
        onOpenChange={answerForm.setOpen}
        title="解答を登録"
        form={answerForm.form}
        reviewsField={answerForm.reviewsField}
        codeSuggestions={answerForm.codeSuggestions}
        checkpointMap={answerForm.checkpointMap}
        nameMap={answerForm.nameMap}
        saveLabel="登録"
        onSave={answerForm.save}
      />

      {/* Answer edit dialog */}
      <AnswerDialog
        open={editForm.open}
        onOpenChange={editForm.setOpen}
        title="解答を編集"
        form={editForm.form}
        reviewsField={editForm.reviewsField}
        codeSuggestions={editForm.codeSuggestions}
        checkpointMap={editForm.checkpointMap}
        nameMap={editForm.nameMap}
        saveLabel="保存"
        onSave={editForm.save}
      />
    </div>
  );
}
