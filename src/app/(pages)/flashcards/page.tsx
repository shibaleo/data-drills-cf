"use client";

import { useState, useEffect, useMemo, useRef } from "react";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MarkdownEditor } from "@/components/markdown-editor";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { ApiError } from "@/lib/api-client";
import { useField } from "@/hooks/use-field";
import { useMasterField } from "@/hooks/use-master-field";
import { MasterFieldPicker } from "@/components/master-field-picker";
import {
  useFlashcardsData,
  useCreateFlashcard,
  useUpdateFlashcard,
  useDeleteFlashcard,
  useRateFlashcard,
  type FlashcardRow,
  type FlashcardReviewRow,
} from "@/hooks/queries/use-flashcards";
import { usePageTitle, usePageSubtitle } from "@/lib/page-context";
import { Fab } from "@/components/shared/fab";
import { StatusTag } from "@/components/color-tags";
import { RetentionBarRaw } from "@/components/retention-bar";
import { Markdown } from "@/components/markdown";
import { randomCode } from "@/lib/utils";
import { computeStability, retention } from "@/lib/forgetting-curve";
import { toJSTDateString, jstDayDiff } from "@/lib/date-utils";

/* ── Types ── */

interface FlashcardWithReviews extends FlashcardRow {
  reviews: FlashcardReviewRow[];
}

/* ── FlipCard ── */

function FlipCard({ flipped, front, back }: { flipped: boolean; front: React.ReactNode; back: React.ReactNode }) {
  const frontRef = useRef<HTMLDivElement>(null);
  const backRef = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number>(0);

  useEffect(() => {
    function measure() {
      const fh = frontRef.current?.scrollHeight ?? 0;
      const bh = backRef.current?.scrollHeight ?? 0;
      setHeight(Math.max(fh, bh));
    }
    measure();
    const ro = new ResizeObserver(measure);
    if (frontRef.current) ro.observe(frontRef.current);
    if (backRef.current) ro.observe(backRef.current);
    return () => ro.disconnect();
  }, [front, back]);

  return (
    <div className="flip-container">
      <div className={`flip-inner ${flipped ? "flipped" : ""}`} style={{ height }}>
        <div ref={frontRef} className="flip-front">{front}</div>
        <div ref={backRef} className="flip-back">{back}</div>
      </div>
    </div>
  );
}

/* ── Compute card retention ── */

function cardRetention(reviews: FlashcardReviewRow[], now: Date) {
  if (reviews.length === 0) return { ret: 0, stability: 0, elapsedDays: Infinity, reviewCount: 0 };
  const sorted = [...reviews].sort((a, b) => a.reviewedAt.localeCompare(b.reviewedAt));
  const qualities = sorted.map((r) => r.quality);
  const stab = computeStability(qualities);
  const elapsedDays = Math.max(0, jstDayDiff(toJSTDateString(now), sorted[sorted.length - 1].reviewedAt));
  const ret = retention(elapsedDays, stab);
  return { ret, stability: stab, elapsedDays, reviewCount: sorted.length };
}

/* ── Page ── */

export default function FlashcardsPage() {
  usePageTitle("Flashcards");
  const { statuses } = useField();
  const { field } = useMasterField();
  const fieldId = field?.id;
  const { cards: rawCards, reviews, isLoading } = useFlashcardsData(fieldId);
  const createCard = useCreateFlashcard(fieldId);
  const updateCard = useUpdateFlashcard(fieldId);
  const deleteCard = useDeleteFlashcard(fieldId);
  const rateCard = useRateFlashcard();
  const isSaving = createCard.isPending || updateCard.isPending;

  // Create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<FlashcardRow | null>(null);
  const [formFront, setFormFront] = useState("");
  const [formBack, setFormBack] = useState("");

  // Inline reveal state
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const cards = useMemo<FlashcardWithReviews[]>(() => {
    const reviewMap = new Map<string, FlashcardReviewRow[]>();
    for (const r of reviews) {
      const list = reviewMap.get(r.flashcardId) ?? [];
      list.push(r);
      reviewMap.set(r.flashcardId, list);
    }
    const combined = rawCards.map((fc) => ({
      ...fc,
      reviews: reviewMap.get(fc.id) ?? [],
    }));
    const now = new Date();
    combined.sort((a, b) =>
      cardRetention(a.reviews, now).ret - cardRetention(b.reviews, now).ret,
    );
    return combined;
  }, [rawCards, reviews]);

  usePageSubtitle(cards.length > 0 ? `${cards.length}枚` : "");

  function openCreateDialog() {
    setEditItem(null);
    setFormFront("");
    setFormBack("");
    setDialogOpen(true);
  }

  function openEditDialog(card: FlashcardRow) {
    setEditItem(card);
    setFormFront(card.front);
    setFormBack(card.back);
    setDialogOpen(true);
  }

  const handleSave = () => {
    if (!formFront.trim() || !formBack.trim()) {
      toast.error("表面と裏面を入力してください");
      return;
    }
    const base = {
      front: formFront.trim(),
      back: formBack.trim(),
    };
    const onDone = {
      onSuccess: () => {
        toast.success(editItem ? "カードを更新しました" : "カードを作成しました");
        setDialogOpen(false);
      },
      onError: (e: Error) => toast.error(e.message ?? "保存に失敗"),
    };
    if (editItem) {
      updateCard.mutate({ id: editItem.id, payload: base }, onDone);
    } else {
      createCard.mutate(
        { ...base, field_id: field!.id, code: randomCode() },
        onDone,
      );
    }
  };

  const handleDelete = (id: string) => {
    deleteCard.mutate(id, {
      onSuccess: () => {
        toast.success("カードを削除しました");
        setDialogOpen(false);
      },
      onError: (e) =>
        toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました"),
    });
  };

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const handleRate = (cardId: string, quality: number) => {
    rateCard.mutate({ cardId, quality });
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
  };

  if (!field) {
    return (
      <div className="p-4 md:p-6 space-y-3">
        <MasterFieldPicker />
        <div className="text-center py-12 text-muted-foreground">Select a field</div>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="p-4 md:p-6">
      <div className="mb-3"><MasterFieldPicker /></div>
      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4">
          {cards.map((card) => {
            const info = cardRetention(card.reviews, now);
            const revealed = revealedIds.has(card.id);
            return (
              <FlipCard
                key={card.id}
                flipped={revealed}
                front={
                  <Card className="h-full flex flex-col py-4">
                    <CardContent className="flex flex-col flex-1 gap-3">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditDialog(card)}
                            title="編集"
                            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors"
                          >
                            <Pencil className="size-3" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDelete(card.id)}
                            title="削除"
                            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                          >
                            <Trash2 className="size-3" />
                          </button>
                        </div>
                      </div>

                      {info.reviewCount > 0 ? (
                        <RetentionBarRaw retention={info.ret} elapsedDays={info.elapsedDays} />
                      ) : (
                        <span className="text-[10px] text-muted-foreground">未復習</span>
                      )}

                      {/* Front content */}
                      <div className="flex-1 flex items-center">
                        <div className="text-sm text-foreground leading-relaxed">
                          <Markdown>{card.front}</Markdown>
                        </div>
                      </div>

                      {/* Reveal button */}
                      <button
                        type="button"
                        onClick={() => toggleReveal(card.id)}
                        className="self-start inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                      >
                        <Eye className="size-3.5" /> 裏面を表示
                      </button>
                    </CardContent>
                  </Card>
                }
                back={
                  <Card className="py-4">
                    <CardContent className="space-y-3">
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        <div className="ml-auto flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditDialog(card)}
                            title="編集"
                            className="inline-flex size-6 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors"
                          >
                            <Pencil className="size-3" />
                          </button>
                        </div>
                      </div>

                      <div className="rounded-md border border-border bg-muted/30 p-3 text-sm text-foreground leading-relaxed">
                        <Markdown>{card.back}</Markdown>
                      </div>

                      <div className="flex flex-wrap gap-1.5">
                        {statuses.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            onClick={() => handleRate(card.id, s.point ?? 0)}
                            className="transition-opacity hover:opacity-80"
                          >
                            <StatusTag status={s.name} color={s.color} opaque />
                          </button>
                        ))}
                      </div>

                      <button
                        type="button"
                        onClick={() => toggleReveal(card.id)}
                        className="inline-flex items-center gap-1.5 rounded px-3 py-1.5 text-sm bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
                      >
                        <EyeOff className="size-3.5" /> 表面に戻す
                      </button>
                    </CardContent>
                  </Card>
                }
              />
            );
          })}
          {cards.length === 0 && (
            <p className="text-center text-muted-foreground py-8">カードがありません</p>
          )}
        </div>
      )}

      <Fab onClick={openCreateDialog} />

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[85vh] flex flex-col overflow-hidden">
          <DialogHeader>
            <DialogTitle>{editItem ? "カードを編集" : "カードを作成"}</DialogTitle>
            <DialogDescription className="sr-only">{editItem ? "Edit flashcard" : "Create a new flashcard"}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-2 overflow-y-auto min-h-0">
            <div className="grid gap-2">
              <Label>表面（質問）</Label>
              <MarkdownEditor
                compact
                defaultValue={formFront}
                onChange={setFormFront}
                placeholder="覚えたい内容・質問"
              />
            </div>
            <div className="grid gap-2">
              <Label>裏面（答え）</Label>
              <MarkdownEditor
                compact
                defaultValue={formBack}
                onChange={setFormBack}
                placeholder="答え・解説"
              />
            </div>
          </div>
          <DialogFooter>
            {editItem && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive mr-auto" onClick={() => handleDelete(editItem.id)}>
                削除
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={isSaving}>{isSaving ? "保存中..." : editItem ? "保存" : "作成"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
