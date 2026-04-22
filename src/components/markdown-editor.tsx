import { lazy, Suspense, useRef, useCallback } from "react";
import { cn } from "@/lib/utils";

interface MarkdownEditorProps {
  defaultValue: string;
  onChange: (markdown: string) => void;
  placeholder?: string;
  compact?: boolean;
  className?: string;
}

const CodeMirrorEditor = lazy(() => import("./codemirror-editor"));

export function MarkdownEditor({ defaultValue, onChange, placeholder, compact, className }: MarkdownEditorProps) {
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const stableOnChange = useCallback((value: string) => {
    onChangeRef.current(value);
  }, []);

  return (
    <div className={cn(
      "cm-wrapper rounded-md border border-input bg-background text-sm",
      compact ? "min-h-0" : "min-h-[300px]",
      className,
    )}>
      <Suspense fallback={<div className="min-h-[120px]" />}>
        <CodeMirrorEditor
          defaultValue={defaultValue}
          onChange={stableOnChange}
          placeholder={placeholder}
          compact={compact}
        />
      </Suspense>
    </div>
  );
}
