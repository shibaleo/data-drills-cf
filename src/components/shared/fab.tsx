"use client";

import { Plus } from "lucide-react";
import { usePageContext } from "@/lib/page-context";

export function Fab({ onClick }: { onClick: () => void }) {
  const { scrollingDown } = usePageContext();

  return (
    <button
      type="button"
      onClick={onClick}
      className={`fixed bottom-3 right-3 z-30 flex size-8 items-center justify-center rounded-full bg-primary/70 text-primary-foreground shadow-lg transition-all duration-200 active:scale-95 ${
        scrollingDown
          ? "translate-y-4 opacity-0 pointer-events-none"
          : "translate-y-0 opacity-100"
      }`}
    >
      <Plus className="size-4" />
    </button>
  );
}
