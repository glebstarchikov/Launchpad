import { NavLink, useNavigate } from "react-router-dom";
import { Rocket, LayoutDashboard, FolderKanban, Lightbulb, Files, LogOut } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: "Dashboard" },
  { to: "/projects", icon: FolderKanban, label: "Projects" },
  { to: "/ideas", icon: Lightbulb, label: "Ideas" },
  { to: "/files", icon: Files, label: "Files" },
];

export default function Sidebar() {
  const { data: user } = useQuery({ queryKey: ["me"], queryFn: api.auth.me });
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const logout = useMutation({
    mutationFn: api.auth.logout,
    onSuccess: () => {
      queryClient.clear();
      navigate("/login");
    },
  });

  const initials = user?.name
    .split(" ")
    .map((w: string) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2) ?? "?";

  return (
    <aside className="fixed left-0 top-0 h-screen w-[240px] bg-background border-r border-border flex flex-col z-50">
      {/* Logo */}
      <div className="flex items-center gap-2.5 px-5 h-[60px] border-b border-border shrink-0">
        <Rocket size={16} className="text-foreground" />
        <span className="font-semibold text-[15px] tracking-tight">Launchpad</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-3 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"} className="block">
            {({ isActive }) => (
              <div
                className={cn(
                  "flex items-center gap-2.5 w-full px-3 py-[7px] rounded-md text-[13px] transition-colors",
                  isActive
                    ? "bg-card text-foreground font-medium border border-border"
                    : "text-muted-foreground hover:text-foreground hover:bg-card/50"
                )}
              >
                <Icon size={15} className="shrink-0" />
                {label}
              </div>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User row */}
      <div className="px-3 py-3 border-t border-border flex items-center gap-2.5 shrink-0">
        <Avatar className="h-7 w-7 shrink-0">
          <AvatarFallback className="text-[11px] font-medium bg-card text-muted-foreground border border-border">
            {initials}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-[13px] font-medium truncate leading-tight">{user?.name}</p>
          <p className="text-[11px] text-muted-foreground truncate">{user?.email}</p>
        </div>
        <button
          onClick={() => logout.mutate()}
          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-card transition-colors"
          aria-label="Sign out"
        >
          <LogOut size={13} />
        </button>
      </div>
    </aside>
  );
}
