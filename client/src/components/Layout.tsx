import { useRef, useCallback } from "react";
import { Outlet } from "react-router-dom";
import { Rocket, PanelLeft, LogOut } from "lucide-react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { cn } from "@/lib/utils";
import { useSidebar } from "@/hooks/use-sidebar";
import { api } from "@/lib/api";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import Sidebar from "./Sidebar";

export default function Layout() {
  const { state, collapsed, isPeeking, setIsPeeking, expand, collapse, toggle } =
    useSidebar();
  const peekTimeout = useRef<ReturnType<typeof setTimeout>>();
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: api.auth.me });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login");
    },
    onError: () => {
      queryClient.clear();
      navigate("/login");
    },
  });

  const initials =
    user?.name
      ?.split(" ")
      .map((w: string) => w[0])
      .join("")
      .toUpperCase()
      .slice(0, 2) ?? "?";

  const handlePeekEnter = useCallback(() => {
    if (!collapsed) return;
    clearTimeout(peekTimeout.current);
    setIsPeeking(true);
  }, [collapsed, setIsPeeking]);

  const handlePeekLeave = useCallback(() => {
    if (!collapsed) return;
    peekTimeout.current = setTimeout(() => {
      setIsPeeking(false);
    }, 150);
  }, [collapsed, setIsPeeking]);

  const handleSidebarMouseEnter = useCallback(() => {
    if (isPeeking) {
      clearTimeout(peekTimeout.current);
    }
  }, [isPeeking]);

  const handleSidebarMouseLeave = useCallback(() => {
    if (isPeeking) {
      peekTimeout.current = setTimeout(() => {
        setIsPeeking(false);
      }, 200);
    }
  }, [isPeeking, setIsPeeking]);

  const isMac =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");
  const shortcutLabel = isMac ? "\u2318B" : "Ctrl+B";

  return (
    <TooltipProvider delayDuration={400}>
      <div className="flex flex-col h-screen overflow-hidden bg-background">
        {/* ═══ Global header bar — always visible, full width ═══ */}
        <header className="h-[48px] flex items-center px-3 shrink-0 border-b border-border/50 bg-background z-[60] relative">
          {/* Left: toggle + brand */}
          <div className="flex items-center gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors hidden sm:flex"
                  onClick={() => (collapsed ? expand() : collapse())}
                  onMouseEnter={handlePeekEnter}
                  onMouseLeave={handlePeekLeave}
                  aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
                >
                  <PanelLeft size={15} />
                </button>
              </TooltipTrigger>
              <TooltipContent side="bottom" className="flex items-center gap-2">
                <span>{collapsed ? "Expand" : "Collapse"} Sidebar</span>
                <kbd className="text-[10px] text-muted-foreground font-mono bg-muted px-1.5 py-0.5 rounded">
                  {shortcutLabel}
                </kbd>
              </TooltipContent>
            </Tooltip>

            {/* Mobile toggle */}
            <Sheet>
              <SheetTrigger asChild>
                <button
                  className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors sm:hidden"
                  aria-label="Open sidebar"
                >
                  <PanelLeft size={15} />
                </button>
              </SheetTrigger>
              <SheetContent
                side="left"
                className="w-[240px] p-0 bg-background border-r border-border"
              >
                <Sidebar />
              </SheetContent>
            </Sheet>

            <div className="h-4 w-px bg-border/60 hidden sm:block" />
            <div className="flex items-center gap-1.5">
              <Rocket size={14} className="text-foreground" />
              <span className="text-[13px] font-semibold tracking-tight">Launchpad</span>
            </div>
          </div>

          {/* Right: user avatar + logout */}
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-2">
              <Avatar className="h-6 w-6">
                <AvatarFallback className="text-[9px] font-medium bg-card text-muted-foreground border border-border">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <span className="text-[12px] text-muted-foreground hidden sm:block">
                {user?.name}
              </span>
            </div>
            <button
              onClick={() => logout.mutate()}
              className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors"
              aria-label="Sign out"
            >
              <LogOut size={13} />
            </button>
          </div>
        </header>

        {/* ═══ Below header: sidebar + main content ═══ */}
        <div className="flex flex-1 min-h-0">
          {/* Desktop sidebar wrapper */}
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
              <Sidebar />
            </aside>
          </div>

          {/* Main content in a shell */}
          <main className="flex-1 min-w-0 overflow-auto">
            <Outlet />
          </main>
        </div>
      </div>
    </TooltipProvider>
  );
}
