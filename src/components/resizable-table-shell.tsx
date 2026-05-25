/**
 * テーブル領域を縦リサイズ可能なスクロールコンテナで包む共通コンポーネント。
 * schedule / plan 詳細ページで共有。
 *
 * 既定の高さ・最小/最大値は両ページで同じ運用 (10 行ぶん〜80vh)。
 * forwardRef で内部要素を露出し、呼び出し側が `scrollIntoView` 用に
 * `data-problem-id="..."` などをクエリできるようにする。
 */
import { forwardRef, type ReactNode } from "react";

export type ResizableTableShellProps = {
  children: ReactNode;
  className?: string;
};

export const ResizableTableShell = forwardRef<HTMLDivElement, ResizableTableShellProps>(
  function ResizableTableShell({ children, className = "" }, ref) {
    return (
      <div
        ref={ref}
        className={`rounded-md border overflow-auto resize-y ${className}`}
        style={{ height: "calc(10 * 2.25rem)", minHeight: "6rem", maxHeight: "80vh" }}
      >
        {children}
      </div>
    );
  },
);
