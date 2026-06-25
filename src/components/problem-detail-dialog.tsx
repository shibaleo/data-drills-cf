"use client";

import { X } from "lucide-react";
import { ProblemCard, type ProblemWithAnswers } from "@/components/problem-card";
import type { Problem } from "@/lib/types";
import {
  Dialog, DialogContent, DialogClose, DialogHeader, DialogTitle, DialogDescription,
} from "@/components/ui/dialog";

interface ProblemDetailDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  problem: ProblemWithAnswers | null;
  now: Date;
  onEditProblem: (problem: Problem) => void;
  onCheck: (problem: ProblemWithAnswers) => void;
  onDelete?: (id: string) => void;
  onPdfLinked?: (problemId: string) => void;
  /** review 保存後の invalidate callback */
  onReviewSaved?: () => void;
}

export function ProblemDetailDialog({
  open,
  onOpenChange,
  problem,
  now,
  onEditProblem,
  onCheck,
  onDelete,
  onPdfLinked,
  onReviewSaved,
}: ProblemDetailDialogProps) {
  if (!problem) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent hideClose className="max-w-4xl w-[90vw] max-h-[85vh] overflow-y-auto px-6 py-4">
        <DialogHeader className="flex flex-row items-center -mb-4">
          <DialogTitle className="sr-only">{problem.code} {problem.name}</DialogTitle>
          <DialogDescription className="sr-only">Problem detail</DialogDescription>
          <DialogClose className="ml-auto rounded-sm opacity-70 transition-opacity hover:opacity-100">
            <X className="size-4" />
          </DialogClose>
        </DialogHeader>
        <ProblemCard
          problem={problem}
          now={now}
          onEditProblem={onEditProblem}
          onCheck={onCheck}
          onDelete={onDelete}
          onPdfLinked={onPdfLinked}
          editableReviews
          onReviewSaved={onReviewSaved}
          bare
        />
      </DialogContent>
    </Dialog>
  );
}
