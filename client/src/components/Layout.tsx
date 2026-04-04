import { useRef, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { PanelLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Sidebar from "./Sidebar";

export default function Layout() {
  const { state, collapsed, isPeeking, setIsPeeking, expand, collapse } =
    useSidebar();
  const peekTimeout = useRef<ReturnType<typeof setTimeout>>();

  // --- Peek handlers ---
  // Toggle button hover → start peeking (sidebar slides in as overlay)
  const handlePeekEnter = useCallback(() => {
    if (!collapsed) return;
    clearTimeout(peekTimeout.current);
    setIsPeeking(true);
  }, [collapsed, setIsPeeking]);

  // Mouse leaves toggle button → start delayed close
  const handlePeekLeave = useCallback(() => {
    if (!collapsed) return;
    peekTimeout.current = setTimeout(() => {
      setIsPeeking(false);
    }, 150);
  }, [collapsed, setIsPeeking]);

  // Mouse enters sidebar panel (while peeking) → cancel the close
  const handleSidebarMouseEnter = useCallback(() => {
    if (isPeeking) {
      clearTimeout(peekTimeout.current);
    }
  }, [isPeeking]);

  // Mouse leaves sidebar panel → delayed close
  const handleSidebarMouseLeave = useCallback(() => {
    if (isPeeking) {
      peekTimeout.current = setTimeout(() => {
        setIsPeeking(false);
      }, 200);
    }
  }, [isPeeking, setIsPeeking]);

  // Click while peeking or collapsed → expand (lock in)
  const handleExpandClick = useCallback(() => {
    expand();
  }, [expand]);

  const isMac =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
  const shortcutLabel = isMac ? "\u2318B" : "Ctrl+B";

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex min-h-screen bg-background">
        {/* ═══ Desktop sidebar wrapper ═══ */}
        <div
          className={cn(
            "sidebar-wrapper hidden sm:block",
            isPeeking && "sidebar-peeking"
          )}
          data-state={state}
        >
          <aside
            className={cn("sidebar-aside", isPeeking && "sidebar-peeking")}
            data-state={state}
            onMouseEnter={handleSidebarMouseEnter}
            onMouseLeave={handleSidebarMouseLeave}
          >
            <Sidebar onCollapse={collapse} />
          </aside>
        </div>

        {/* ═══ Main content area ═══ */}
        <div className="flex-1 min-w-0 flex flex-col min-h-screen">
          {/* Top bar — only shows toggle button when sidebar is collapsed */}
          {collapsed && (
            <div className="h-[48px] items-center px-3 shrink-0 hidden sm:flex">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
                    onClick={handleExpandClick}
                    onMouseEnter={handlePeekEnter}
                    onMouseLeave={handlePeekLeave}
                    aria-label="Expand sidebar"
                  >
                    <PanelLeft size={15} />
                  </button>
                </TooltipTrigger>
                <TooltipContent
                  side="right"
                  className="flex items-center gap-2"
                >
                  <span>Expand Sidebar</span>
                  <kbd className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                    {shortcutLabel}
                  </kbd>
                </TooltipContent>
              </Tooltip>
            </div>
          )}

          {/* Mobile hamburger — always visible on small screens */}
          <div className="h-[48px] flex items-center px-3 shrink-0 sm:hidden">
            <Sheet>
              <SheetTrigger asChild>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
                  aria-label="Open sidebar"
                >
                  <PanelLeft size={15} />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[240px] p-0 bg-background border-r border-border"
              >
                <Sidebar onCollapse={() => {}} />
              </SheetContent>
            </Sheet>
          </div>

          {/* Page content */}
          <main className="flex-1 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
