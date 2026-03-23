import { NavLink, useNavigate } from "react-router-dom";
import { Rocket, LayoutDashboard, FolderKanban, Lightbulb, Files, LogOut } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
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
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border shrink-0">
        <Rocket size={16} className="text-foreground" />
        <span className="font-bold text-[15px] tracking-tight">Launchpad</span>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 space-y-0.5 overflow-y-auto">
        {NAV.map(({ to, icon: Icon, label }) => (
          <NavLink key={to} to={to} end={to === "/"}>
            {({ isActive }) => (
              <Button
                variant="ghost"
                className={cn(
                  "justify-start gap-3 w-full",
                  isActive
                    ? "bg-secondary text-foreground border-l-2 border-foreground rounded-l-none pl-[14px]"
                    : "text-muted-foreground"
                )}
              >
                <Icon size={16} />
                {label}
              </Button>
            )}
          </NavLink>
        ))}
      </nav>

      {/* User row */}
      <div className="p-3 border-t border-border flex items-center gap-3 shrink-0">
        <Avatar className="h-7 w-7">
          <AvatarFallback className="text-xs bg-secondary">{initials}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">{user?.name}</p>
          <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 text-muted-foreground hover:text-foreground"
          onClick={() => logout.mutate()}
        >
          <LogOut size={14} />
        </Button>
      </div>
    </aside>
  );
}
