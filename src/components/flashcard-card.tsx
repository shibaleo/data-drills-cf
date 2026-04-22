"use client";

import { Pencil, Plus, Trash2 } from "lucide-react";
import { Markdown } from "@/components/markdown";
import { Card, CardContent } from "@/components/ui/card";

export interface FlashcardReviewRow {
  id: string;
  flashcardId: string;
  quality: number;
  reviewedAt: string;
  nextReviewAt: string | null;
}

export interface FlashcardRow {
  id: string;
  code: string;
  projectId: string;
  topicId: string | null;
  front: string;
  back: string;
  createdAt: string;
}

export interface FlashcardWithReviews extends FlashcardRow {
  reviews: FlashcardReviewRow[];
}

interface TopicItem {
  id: string;
  name: string;
  color?: string | null;
}

interface FlashcardCardProps {
  flashcard: FlashcardWithReviews;
  topics: TopicItem[];
  onEdit: (flashcard: FlashcardRow) => void;
  onAddReview: (flashcard: FlashcardWithReviews) => void;
  onDeleteReview?: (reviewId: string) => void;
}

function qualityColor(q: number): string {
  if (q <= 1) return "#ef4444";
  if (q === 2) return "#f97316";
  if (q === 3) return "#eab308";
  if (q === 4) return "#22c55e";
  return "#3b82f6";
}

function qualityLabel(q: number): string {
  if (q <= 1) return "Again";
  if (q === 2) return "Hard";
  if (q === 3) return "Good";
  if (q === 4) return "Easy";
  return "Perfect";
}

export function FlashcardCard({
  flashcard: fc,
  topics,
  onEdit,
  onAddReview,
  onDeleteReview,
}: FlashcardCardProps) {
  const top = topics.find((t) => t.id === fc.topicId);
  const reviews = [...fc.reviews].sort(
    (a, b) => (b.reviewedAt ?? "").localeCompare(a.reviewedAt ?? ""),
  );

  return (
    <Card className="py-4">
      <CardContent className="space-y-3">
        {/* Header: code + edit | topic badge */}
        <div className="flex items-center gap-1.5 text-xs">
          <span className="font-mono font-medium text-sm whitespace-nowrap">{fc.code}</span>
          <button
            type="button"
            onClick={() => onEdit(fc)}
            title="編集"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <Pencil className="size-3" />
          </button>
          <div className="ml-auto flex items-center gap-1.5">
            {top && (
              <span
                className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs"
                style={top.color ? {
                  color: top.color,
                  backgroundColor: `color-mix(in srgb, hsl(var(--card)) 80%, ${top.color})`,
                } : undefined}
              >
                {top.name}
              </span>
            )}
          </div>
        </div>

        {/* Front */}
        <div className="text-sm font-medium text-foreground">
          <Markdown>{fc.front}</Markdown>
        </div>

        {/* Back */}
        <div className="text-xs text-foreground/70 border-t border-border pt-2">
          <Markdown>{fc.back}</Markdown>
        </div>

        {/* Reviews timeline */}
        {reviews.length > 0 && (
          <div className="relative ml-5">
            {reviews.map((r, i) => {
              const date = r.reviewedAt.slice(0, 10);
              const prevDate = i > 0 ? reviews[i - 1].reviewedAt.slice(0, 10) : null;
              let dayGap: number | null = null;
              if (prevDate && date) {
                dayGap = Math.round(
                  (new Date(prevDate).getTime() - new Date(date).getTime()) / 86400000,
                );
              }
              const color = qualityColor(r.quality);
              return (
                <div key={r.id}>
                  {dayGap !== null && dayGap > 0 && (
                    <div className="relative h-5">
                      <div className="absolute left-[-1px] -translate-x-1/2 top-0 bottom-0 w-0.5 bg-border" />
                      <span className="absolute left-[-1px] -translate-x-1/2 top-1/2 -translate-y-1/2 bg-card px-1.5 text-[10px] text-foreground/60 whitespace-nowrap">
                        {dayGap}日
                      </span>
                    </div>
                  )}
                  <div className="relative pl-9 py-1.5">
                    {i > 0 && <div className="absolute left-[-1px] -translate-x-1/2 top-0 h-[12px] w-0.5 bg-border" />}
                    <div className="absolute left-[-1px] -translate-x-1/2 top-[12px] bottom-0 w-0.5 bg-border" />
                    <div className="absolute left-[-1px] -translate-x-1/2 top-[12px] -translate-y-1/2 whitespace-nowrap">
                      <span
                        className="inline-block size-2.5 rounded-full"
                        style={{ backgroundColor: color }}
                        title={qualityLabel(r.quality)}
                      />
                    </div>
                    <div className="flex items-center gap-2 text-xs">
                      <span className="text-foreground/60">{date}</span>
                      <span
                        className="inline-flex items-center rounded-full px-1.5 py-0 text-[10px] h-4"
                        style={{
                          color,
                          backgroundColor: `color-mix(in srgb, hsl(var(--card)) 80%, ${color})`,
                        }}
                      >
                        {r.quality} - {qualityLabel(r.quality)}
                      </span>
                      {onDeleteReview && (
                        <button
                          type="button"
                          onClick={() => onDeleteReview(r.id)}
                          title="削除"
                          className="ml-auto inline-flex size-5 items-center justify-center rounded text-muted-foreground/40 hover:text-destructive transition-colors"
                        >
                          <Trash2 className="size-3" />
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Action row */}
        <div className="flex items-center justify-end">
          <button
            type="button"
            onClick={() => onAddReview(fc)}
            title="レビューを記録"
            className="inline-flex size-5 shrink-0 items-center justify-center rounded text-muted-foreground/40 hover:text-foreground transition-colors"
          >
            <Plus className="size-3" />
          </button>
        </div>
      </CardContent>
    </Card>
  );
}
