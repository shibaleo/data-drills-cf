"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { Pencil, Trash2, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { MarkdownEditor } from "@/components/markdown-editor";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { api, ApiError, fetchAllPages } from "@/lib/api-client";
import { useProject } from "@/hooks/use-project";
import { Fab } from "@/components/shared/fab";
import { usePageTitle, usePageSubtitle } from "@/lib/page-context";
import { StatusTag } from "@/components/color-tags";
import { RetentionBarRaw } from "@/components/retention-bar";
import { Markdown } from "@/components/markdown";
import { randomCode } from "@/lib/utils";
import { computeStability, retention } from "@/lib/forgetting-curve";
import { toJSTDateString, jstDayDiff } from "@/lib/date-utils";

/* ── Types ── */

interface FlashcardRow {
  id: string;
  code: string;
  projectId: string;
  topicId: string | null;
  front: string;
  back: string;
  createdAt: string;
}

interface FlashcardReviewRow {
  id: string;
  flashcardId: string;
  quality: number;
  reviewedAt: string;
  nextReviewAt: string | null;
}

interface FlashcardWithReviews extends FlashcardRow {
  reviews: FlashcardReviewRow[];
}

interface TopicItem {
  id: string;
  name: string;
  color?: string | null;
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
  const { currentProject, statuses } = useProject();
  const [cards, setCards] = useState<FlashcardWithReviews[]>([]);
  const [topics, setTopics] = useState<TopicItem[]>([]);
  const [loading, setLoading] = useState(true);

  // Create/edit dialog
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editItem, setEditItem] = useState<FlashcardRow | null>(null);
  const [formFront, setFormFront] = useState("");
  const [formBack, setFormBack] = useState("");
  const [formTopicId, setFormTopicId] = useState("__none__");
  const [saving, setSaving] = useState(false);

  // Inline reveal state
  const [revealedIds, setRevealedIds] = useState<Set<string>>(new Set());

  const fetchData = useCallback(async () => {
    if (!currentProject) return;
    setLoading(true);
    try {
      const [rawCards, reviews, tops] = await Promise.all([
        fetchAllPages<FlashcardRow>("/flashcards", { project_id: currentProject.id }),
        fetchAllPages<FlashcardReviewRow>("/flashcard-reviews"),
        fetchAllPages<TopicItem>(`/projects/${currentProject.id}/topics`),
      ]);

      const reviewMap = new Map<string, FlashcardReviewRow[]>();
      for (const r of reviews) {
        const list = reviewMap.get(r.flashcardId) ?? [];
        list.push(r);
        reviewMap.set(r.flashcardId, list);
      }

      const combined: FlashcardWithReviews[] = rawCards.map((fc) => ({
        ...fc,
        reviews: reviewMap.get(fc.id) ?? [],
      }));

      // Sort by retention (lowest first = most urgent)
      const now = new Date();
      combined.sort((a, b) => {
        const ra = cardRetention(a.reviews, now);
        const rb = cardRetention(b.reviews, now);
        return ra.ret - rb.ret;
      });

      setCards(combined);
      setTopics(tops);
    } catch {
      toast.error("Failed to fetch data");
    } finally {
      setLoading(false);
    }
  }, [currentProject]);

  useEffect(() => { fetchData(); }, [fetchData]);
  usePageSubtitle(cards.length > 0 ? `${cards.length}枚` : "");

  function openCreateDialog() {
    setEditItem(null);
    setFormFront("");
    setFormBack("");
    setFormTopicId("__none__");
    setDialogOpen(true);
  }

  function openEditDialog(card: FlashcardRow) {
    setEditItem(card);
    setFormFront(card.front);
    setFormBack(card.back);
    setFormTopicId(card.topicId ?? "__none__");
    setDialogOpen(true);
  }

  async function handleSave() {
    if (!formFront.trim() || !formBack.trim()) {
      toast.error("表面と裏面を入力してください");
      return;
    }
    setSaving(true);
    try {
      const payload: Record<string, unknown> = {
        front: formFront.trim(),
        back: formBack.trim(),
        topic_id: formTopicId === "__none__" ? null : formTopicId,
      };
      if (editItem) {
        await api.put(`/flashcards/${editItem.id}`, payload);
        toast.success("カードを更新しました");
      } else {
        payload.project_id = currentProject!.id;
        payload.code = randomCode();
        await api.post("/flashcards", payload);
        toast.success("カードを作成しました");
      }
      setDialogOpen(false);
      fetchData();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "保存に失敗");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string) {
    try {
      await api.delete(`/flashcards/${id}`);
      toast.success("カードを削除しました");
      setDialogOpen(false);
      fetchData();
    } catch (e) {
      toast.error(e instanceof ApiError ? e.body.error : "削除に失敗しました");
    }
  }

  function toggleReveal(id: string) {
    setRevealedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleRate(cardId: string, quality: number) {
    try {
      await api.post(`/flashcards/${cardId}/reviews`, {
        quality,
        reviewed_at: new Date().toISOString(),
      });
    } catch { /* ignore */ }
    setRevealedIds((prev) => {
      const next = new Set(prev);
      next.delete(cardId);
      return next;
    });
    fetchData();
  }

  if (!currentProject) {
    return (
      <div className="p-4 md:p-6">
        <div className="text-center py-12 text-muted-foreground">Please select a project</div>
      </div>
    );
  }

  const now = new Date();

  return (
    <div className="p-4 md:p-6">
      {loading ? (
        <div className="text-center py-12 text-muted-foreground">読み込み中...</div>
      ) : (
        <div className="max-w-2xl mx-auto space-y-4">
          {cards.map((card) => {
            const info = cardRetention(card.reviews, now);
            const revealed = revealedIds.has(card.id);
            const topic = topics.find((t) => t.id === card.topicId);
            return (
              <FlipCard
                key={card.id}
                flipped={revealed}
                front={
                  <Card className="h-full flex flex-col py-4">
                    <CardContent className="flex flex-col flex-1 gap-3">
                      {/* Header: topic + edit/delete */}
                      <div className="flex items-center gap-2 text-xs flex-wrap">
                        {topic && (
                          <Badge variant="outline" className="text-xs">{topic.name}</Badge>
                        )}
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
                        {topic && (
                          <Badge variant="outline" className="text-xs">{topic.name}</Badge>
                        )}
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
            <div className="grid gap-2">
              <Label>トピック</Label>
              <Select value={formTopicId} onValueChange={setFormTopicId}>
                <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">なし</SelectItem>
                  {topics.map((t) => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            {editItem && (
              <Button variant="outline" size="sm" className="text-destructive hover:text-destructive mr-auto" onClick={() => handleDelete(editItem.id)}>
                削除
              </Button>
            )}
            <Button variant="outline" onClick={() => setDialogOpen(false)}>キャンセル</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "保存中..." : editItem ? "保存" : "作成"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
