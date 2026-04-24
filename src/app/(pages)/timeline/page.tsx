"use client";

import { useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { useSubjectLevelFilter } from "@/hooks/use-subject-level-filter";
import { useAnswerForm, useEditAnswerForm } from "@/hooks/use-answer-form";
import { useProblemsList, useDeleteProblem, problemsKeys } from "@/hooks/queries/use-problems";
import { usePageTitle } from "@/lib/page-context";
import { Fab } from "@/components/shared/fab";
import { ProblemCard, type ProblemWithAnswers } from "@/components/problem-card";
import { ProblemEditDialog } from "@/components/problem-edit-dialog";
import { AnswerDialog } from "@/components/answer-dialog";
import type { Problem } from "@/lib/types";

export default function TimelinePage() {
  usePageTitle("Timeline");
  const { currentProject, subjects, levels } = useProject();
  const qc = useQueryClient();
  const { data: problems = [], isLoading: loading } = useProblemsList(currentProject?.id);
  const deleteProblem = useDeleteProblem(currentProject?.id);

  const invalidate = useCallback(() => {
    if (currentProject) qc.invalidateQueries({ queryKey: problemsKeys.list(currentProject.id) });
  }, [qc, currentProject]);

  // Problem edit dialog
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editProblem, setEditProblem] = useState<Problem | null>(null);

  const now = useMemo(() => new Date(), []);

  const filtered = useSubjectLevelFilter(problems as ProblemWithAnswers[], { subject: "subject_id", level: "level_id" });

  // Answer create form
  const answerForm = useAnswerForm(invalidate);

  // Answer edit form
  const editForm = useEditAnswerForm(invalidate);

  const handleEditProblem = (p: Problem) => {
    setEditProblem(p);
    setEditDialogOpen(true);
  };

  const handleDeleteProblem = (id: string) => {
    deleteProblem.mutate(id, {
      onSuccess: () => {
        toast.success("削除しました");
        invalidate();
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました"),
    });
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
      ) : filtered.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">No problems found</div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4">
          {filtered.map((p) => (
            <ProblemCard
              key={p.id}
              problem={p}
              now={now}
              onCheck={(prob) => answerForm.openForProblem(prob as Problem & { answers: { date: string | null; status: string | null }[] })}
              onEditProblem={handleEditProblem}
              onEditAnswer={editForm.openFor}
              onDelete={handleDeleteProblem}
              onPdfLinked={() => invalidate()}
            />
          ))}
        </div>
      )}

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

      <Fab onClick={() => answerForm.openBlank()} />
    </div>
  );
}
