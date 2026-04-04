import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Lightbulb,
  Files,
  LogOut,
  Search,
  ChevronDown,
  ChevronRight,
  PanelLeft,
} from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/ideas", icon: Lightbulb, label: "Ideas" },
  { to: "/files", icon: Files, label: "Files" },
];

interface SidebarProps {
  onCollapse: () => void;
}

function CollapsibleSection({
  title,
  defaultOpen = false,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center w-full px-4 py-1.5 text-[12px] font-medium text-muted-foreground hover:text-foreground transition-colors"
      >
        <span className="flex-1 text-left">{title}</span>
        {open ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
      </button>
      {open && <div className="mt-0.5">{children}</div>}
    </div>
  );
}

export default function Sidebar({ onCollapse }: SidebarProps) {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: api.auth.me });
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
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

  const recentProjects = (projects ?? []).slice(0, 5);
  const isMac =
    typeof navigator !== "undefined" && navigator.userAgent.includes("Mac");

  return (
    <>
      {/* Header: scope switcher + collapse toggle */}
      <div className="flex items-center justify-between px-3 h-[48px] shrink-0">
        <button className="flex items-center gap-2 px-1.5 py-1 rounded-md hover:bg-card/60 transition-colors min-w-0">
          <Avatar className="h-[18px] w-[18px] shrink-0">
            <AvatarFallback className="text-[8px] font-semibold bg-card text-muted-foreground border border-border">
              {initials}
            </AvatarFallback>
          </Avatar>
          <span className="text-[13px] font-semibold truncate">Launchpad</span>
          <ChevronDown size={12} className="text-muted-foreground shrink-0" />
        </button>
        <button
          onClick={onCollapse}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card/60 transition-colors shrink-0"
          aria-label="Collapse sidebar"
        >
          <PanelLeft size={15} />
        </button>
      </div>

      {/* Nav section */}
      <div className="px-2 pb-2 space-y-0.5">
        {/* Search */}
        <button className="flex items-center gap-2.5 w-full px-3 py-[7px] rounded-md text-[13px] text-muted-foreground hover:text-foreground hover:bg-card/50 transition-colors">
          <Search size={15} className="shrink-0" />
          <span>Search</span>
          <kbd className="ml-auto text-[10px] text-muted-foreground/50 font-mono">
            {isMac ? "\u2318K" : "Ctrl+K"}
          </kbd>
        </button>

        {/* Nav links */}
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"} className="block">
            {({ isActive }) => (
              <div
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-[7px] rounded-md text-[13px] transition-colors",
                  isActive
                    ? "bg-card text-foreground font-medium"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
              >
                <Icon size={15} className="shrink-0" />
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </div>

      {/* Lower scrollable section */}
      <div className="flex-1 overflow-y-auto pt-3 space-y-1 border-t border-border">
        {/* Favorites — collapsed by default (matching v0 screenshot: ">" chevron) */}
        <CollapsibleSection title="Favorites" defaultOpen={false}>
          <div className="px-3 py-2">
            <div className="border border-dashed border-border rounded-md px-3 py-4 text-center">
              <p className="text-[12px] text-muted-foreground">
                Star a project to pin it here.
              </p>
            </div>
          </div>
        </CollapsibleSection>

        {/* Recent — expanded by default (matching v0 screenshot: "v" chevron) */}
        <CollapsibleSection title="Recent" defaultOpen={true}>
          {recentProjects.length === 0 ? (
            <div className="px-3 py-2">
              <div className="border border-dashed border-border rounded-md px-3 py-4 text-center">
                <p className="text-[12px] text-muted-foreground">
                  You haven't created any projects yet.
                </p>
              </div>
            </div>
          ) : (
            <div className="space-y-0.5 px-1">
              {recentProjects.map((p: { id: number; name: string }) => (
                <NavLink key={p.id} to={`/projects/${p.id}`} className="block">
                  {({ isActive }) => (
                    <div
                      className={cn(
                        "flex items-center gap-2 px-3 py-[6px] rounded-md text-[13px] transition-colors",
                        isActive
                          ? "bg-card text-foreground"
                          : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                      )}
                    >
                      <FolderKanban
                        size={13}
                        className="shrink-0 opacity-50"
                      />
                      <span className="truncate">{p.name}</span>
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          )}
        </CollapsibleSection>
      </div>

      {/* User row */}
      <div className="px-3 py-3 border-t border-border flex items-center gap-2.5 shrink-0">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="text-[11px] font-medium bg-card text-muted-foreground border border-border">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate leading-tight">
            {user?.name}
          </p>
          <p className="text-[11px] text-muted-foreground truncate">
            {user?.email}
          </p>
        </div>
        <button
          onClick={() => logout.mutate()}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          aria-label="Sign out"
        >
          <LogOut size={13} />
        </button>
      </div>
    </>
  );
}
