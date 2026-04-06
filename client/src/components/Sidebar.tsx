import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  LayoutDashboard,
  FolderKanban,
  Lightbulb,
  Files,
  ChevronDown,
  ChevronRight,
  Star,
  Newspaper,
} from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Home" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/ideas", icon: Lightbulb, label: "Ideas" },
  { to: "/news", icon: Newspaper, label: "News" },
  { to: "/files", icon: Files, label: "Files" },
];

function CollapsibleSection({
  title,
  defaultOpen = true,
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

export default function Sidebar() {
  const { data: projects } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const allProjects = projects ?? [];
  const starredProjects = allProjects.filter((p) => p.starred);
  const recentProjects = allProjects.slice(0, 5);

  return (
    <div className="flex flex-col h-full">
      {/* Nav section */}
      <div className="px-2 pt-2 pb-2 space-y-0.5">
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
        {/* Starred — only shown when there are starred projects */}
        {starredProjects.length > 0 && (
          <CollapsibleSection title="Starred" defaultOpen={true}>
            <div className="space-y-0.5 px-1">
              {starredProjects.map((p) => (
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
                      <Star size={13} className="shrink-0 fill-warning text-warning" />
                      <span className="truncate">{p.name}</span>
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          </CollapsibleSection>
        )}

        {/* Recent — only shown when there are projects */}
        {recentProjects.length > 0 && (
          <CollapsibleSection title="Recent" defaultOpen={true}>
            <div className="space-y-0.5 px-1">
              {recentProjects.map((p) => (
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
                      <FolderKanban size={13} className="shrink-0 opacity-50" />
                      <span className="truncate">{p.name}</span>
                    </div>
                  )}
                </NavLink>
              ))}
            </div>
          </CollapsibleSection>
        )}
      </div>
    </div>
  );
}
