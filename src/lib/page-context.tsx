"use client";

import { createContext, useContext, useState, useEffect, useRef } from "react";
import { createPortal } from "react-dom";

interface PageContextValue {
  title: string;
  setTitle: (t: string) => void;
  subtitle: string;
  setSubtitle: (s: string) => void;
  headerSlot: React.ReactNode;
  setHeaderSlot: (node: React.ReactNode) => void;
  headerSlotNode: HTMLElement | null;
  setHeaderSlotNode: (el: HTMLElement | null) => void;
  /** title の左に表示する戻るボタンの onClick (= 設定すると戻るアイコンを描画) */
  onBack: (() => void) | null;
  setOnBack: (fn: (() => void) | null) => void;
  scrollingDown: boolean;
  setScrollingDown: (v: boolean) => void;
}

const PageContext = createContext<PageContextValue>({
  title: "",
  setTitle: () => {},
  subtitle: "",
  setSubtitle: () => {},
  headerSlot: null,
  setHeaderSlot: () => {},
  headerSlotNode: null,
  setHeaderSlotNode: () => {},
  onBack: null,
  setOnBack: () => {},
  scrollingDown: false,
  setScrollingDown: () => {},
});

export function PageProvider({ children }: { children: React.ReactNode }) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [headerSlot, setHeaderSlot] = useState<React.ReactNode>(null);
  const [headerSlotNode, setHeaderSlotNode] = useState<HTMLElement | null>(null);
  const [onBack, setOnBack] = useState<(() => void) | null>(null);
  const [scrollingDown, setScrollingDown] = useState(false);
  const lastScrollY = useRef(0);
  const cooldown = useRef(false);

  useEffect(() => {
    function onScroll(e: Event) {
      if (cooldown.current) return;
      const el = e.target === document ? null : (e.target as HTMLElement);
      const y = el ? el.scrollTop : window.scrollY;
      const delta = y - lastScrollY.current;
      if (Math.abs(delta) < 8) return;
      const down = delta > 0 && y > 10;
      setScrollingDown((prev) => {
        if (prev === down) return prev;
        cooldown.current = true;
        setTimeout(() => { cooldown.current = false; }, 300);
        return down;
      });
      lastScrollY.current = y;
    }
    window.addEventListener("scroll", onScroll, { passive: true });
    const main = document.querySelector("main");
    main?.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      main?.removeEventListener("scroll", onScroll);
    };
  }, []);

  return (
    <PageContext.Provider value={{ title, setTitle, subtitle, setSubtitle, headerSlot, setHeaderSlot, headerSlotNode, setHeaderSlotNode, onBack, setOnBack, scrollingDown, setScrollingDown }}>
      {children}
    </PageContext.Provider>
  );
}

export function usePageContext() {
  return useContext(PageContext);
}

export function usePageTitle(title: string) {
  const { setTitle } = usePageContext();
  useEffect(() => {
    setTitle(title);
    return () => setTitle("");
  }, [title, setTitle]);
}

export function usePageSubtitle(subtitle: string) {
  const { setSubtitle } = usePageContext();
  useEffect(() => {
    setSubtitle(subtitle);
    return () => setSubtitle("");
  }, [subtitle, setSubtitle]);
}

/**
 * Global header の slot に detail-page のコンテンツを portal で差し込む。
 * 親 ([components/layout/app-layout.tsx]) が空 div を ref で公開しているので、
 * その div に対して createPortal する。setState ループの心配なし。
 *
 * 使い方:
 *   const slot = useHeaderSlot();
 *   return <>{slot(<div>...header slot content...</div>)} ...page body... </>;
 */
export function useHeaderSlot() {
  const { headerSlotNode } = usePageContext();
  return (children: React.ReactNode) =>
    headerSlotNode ? createPortal(children, headerSlotNode) : null;
}

/**
 * title の左に戻るボタンを描画する。
 * detail page の mount 中だけ表示 (unmount で自動解除)。
 * mobile header では描画しない (= タイトルのみ表示の方針)。
 */
export function usePageBack(onBack: () => void) {
  const { setOnBack } = usePageContext();
  useEffect(() => {
    // 関数を直接 set すると React が "lazy initializer" と誤認するので wrap
    setOnBack(() => onBack);
    return () => setOnBack(null);
  }, [onBack, setOnBack]);
}
