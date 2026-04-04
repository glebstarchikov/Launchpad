import { useState, useEffect, useCallback } from "react";

const STORAGE_KEY = "sidebar-state";

type SidebarState = "expanded" | "collapsed";

export function useSidebar() {
  const [state, setState] = useState<SidebarState>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored === "collapsed") return "collapsed";
    } catch {}
    return "expanded";
  });

  const [isPeeking, setIsPeeking] = useState(false);

  const expanded = state === "expanded";
  const collapsed = state === "collapsed";

  const toggle = useCallback(() => {
    setState((prev) => {
      const next = prev === "expanded" ? "collapsed" : "expanded";
      try {
        localStorage.setItem(STORAGE_KEY, next);
      } catch {}
      return next;
    });
    setIsPeeking(false);
  }, []);

  const expand = useCallback(() => {
    setState("expanded");
    setIsPeeking(false);
    try {
      localStorage.setItem(STORAGE_KEY, "expanded");
    } catch {}
  }, []);

  const collapse = useCallback(() => {
    setState("collapsed");
    setIsPeeking(false);
    try {
      localStorage.setItem(STORAGE_KEY, "collapsed");
    } catch {}
  }, []);

  // Keyboard shortcut: Cmd+B (Mac) / Ctrl+B (Windows/Linux)
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "b") {
        e.preventDefault();
        toggle();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [toggle]);

  return { state, expanded, collapsed, isPeeking, setIsPeeking, toggle, expand, collapse };
}
