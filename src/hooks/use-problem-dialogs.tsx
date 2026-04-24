"use client";

import { useState, useCallback, type ReactNode } from "react";
import { toast } from "sonner";
import { ApiError } from "@/lib/api-client";
import { rpc, unwrap } from "@/lib/rpc-client";
import { useProject } from "@/hooks/use-project";
import { useAnswerForm, useEditAnswerForm } from "@/hooks/use-answer-form";
import { ProblemDetailDialog } from "@/components/problem-detail-dialog";
import { ProblemEditDialog } from "@/components/problem-edit-dialog";
import { AnswerDialog } from "@/components/answer-dialog";
import { Fab } from "@/components/shared/fab";
import type { ProblemWithAnswers, AnswerWithReviews } from "@/components/problem-card";
import type { Problem } from "@/lib/types";

/**
 * Shared hook that wires up ProblemDetailDialog, ProblemEditDialog,
 * AnswerDialog (create + edit), and Fab for any page that shows problems.
 *
 * Returns `renderDialogs()` which should be placed at the end of the JSX.
 */
export function useProblemDialogs({
  allProblems,
  onDataChanged,
}: {
  allProblems: ProblemWithAnswers[];
  onDataChanged: () => void;
}) {
  const { currentProject, subjects, levels } = useProject();

  // Detail dialog
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailProblemId, setDetailProblemId] = useState<string | null>(null);
  const detailProblem = detailProblemId
    ? allProblems.find((p) => p.id === detailProblemId) ?? null
    : null;

  // Problem edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editProblem, setEditProblem] = useState<Problem | null>(null);

  const now = new Date();

  const notifyAndRefresh = useCallback(() => {
    onDataChanged();
    window.dispatchEvent(new Event("schedule-changed"));
  }, [onDataChanged]);

  // Answer forms
  const answerForm = useAnswerForm(() => { notifyAndRefresh(); });
  const editForm = useEditAnswerForm(() => { notifyAndRefresh(); });

  const openDetail = useCallback((problemId: string) => {
    setDetailProblemId(problemId);
    setDetailOpen(true);
  }, []);

  const openCreate = useCallback(() => {
    setEditProblem(null);
    setEditDialogOpen(true);
  }, []);

  const handleEditProblem = useCallback((p: Problem) => {
    setDetailOpen(false);
    setEditProblem(p);
    setEditDialogOpen(true);
  }, []);

  const handleDeleteProblem = useCallback(async (id: string) => {
    try {
      await unwrap(rpc.api.v1.problems[":id"].$delete({ param: { id } }));
      toast.success("削除しました");
      setDetailOpen(false);
      notifyAndRefresh();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました");
    }
  }, [notifyAndRefresh]);

  const renderDialogs = useCallback((): ReactNode => {
    if (!currentProject) return null;
    return (
      <>
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
          onPdfLinked={() => notifyAndRefresh()}
        />

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
          onSaved={() => { setEditDialogOpen(false); notifyAndRefresh(); }}
          onDelete={editProblem ? () => handleDeleteProblem(editProblem.id) : undefined}
        />

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

        <Fab onClick={openCreate} />
      </>
    );
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProject, detailOpen, detailProblem, editDialogOpen, editProblem,
      answerForm, editForm, subjects, levels, handleEditProblem, handleDeleteProblem,
      notifyAndRefresh, openCreate]);

  return { openDetail, openCreate, renderDialogs };
}
