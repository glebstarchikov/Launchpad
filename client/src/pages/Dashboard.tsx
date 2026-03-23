import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { TrendingUp, FolderKanban, Lightbulb, AlertTriangle, ChevronRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StageBadge, TypeBadge, Empty, fmt, STAGE_META } from "@/components/app-ui";
import { api } from "@/lib/api";
import type { Project, Idea, ProjectStage, DashboardData } from "@/lib/types";

interface StatCardProps {
  label: string;
  value: string;
  sub?: string;
  colour: string;
  icon: React.ReactNode;
}

function StatCard({ label, value, sub, colour, icon }: StatCardProps) {
  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <p className="text-xs text-muted-foreground uppercase tracking-wider">{label}</p>
          <div className="p-1.5 bg-muted rounded-md text-muted-foreground">{icon}</div>
        </div>
        <p className={cn("font-mono text-3xl font-medium mt-2", colour)}>{value}</p>
        {sub && <p className="text-sm text-muted-foreground mt-1">{sub}</p>}
      </CardContent>
    </Card>
  );
}

const STAGES: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];

export default function Dashboard() {
  const navigate = useNavigate();

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard.get,
  });

  if (isLoading || !data) {
    return (
      <div className="p-8">
        <p className="text-muted-foreground">Loading...</p>
      </div>
    );
  }

  const total = (data as DashboardData).stageDist.reduce(
    (s: number, x: { stage: string; count: number }) => s + x.count,
    0
  ) || 1;
  const countByStage = Object.fromEntries(
    (data as DashboardData).stageDist.map((x: { stage: string; count: number }) => [x.stage, x.count])
  );

  return (
    <div className="p-8 max-w-7xl mx-auto">
      <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
      <p className="text-ink-2 mt-1">Your founder command centre</p>

      {/* 4 stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-6">
        <StatCard
          label="Total MRR"
          value={fmt((data as DashboardData).mrr)}
          colour="text-success"
          icon={<TrendingUp size={16} />}
        />
        <StatCard
          label="Projects"
          value={(data as DashboardData).projectCount.toString()}
          colour="text-foreground"
          icon={<FolderKanban size={16} />}
        />
        <StatCard
          label="Idea Inbox"
          value={(data as DashboardData).ideaCount.toString()}
          colour="text-warning"
          icon={<Lightbulb size={16} />}
        />
        <StatCard
          label="Legal Pending"
          value={(data as DashboardData).legalPending.toString()}
          colour="text-destructive"
          icon={<AlertTriangle size={16} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 mt-4">
        {/* Pipeline bar — col-span-2 */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Pipeline</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex rounded-full overflow-hidden h-2.5">
              {STAGES.map((stage) => {
                const count = countByStage[stage] ?? 0;
                if (count === 0) return null;
                const pct = (count / total) * 100;
                return (
                  <div
                    key={stage}
                    style={{ width: `${pct}%` }}
                    className={STAGE_META[stage].className}
                    title={`${STAGE_META[stage].label}: ${count}`}
                  />
                );
              })}
            </div>
            <div className="flex flex-wrap gap-3 mt-3">
              {STAGES.filter((s) => (countByStage[s] ?? 0) > 0).map((stage) => (
                <div key={stage} className="flex items-center gap-1.5">
                  <div className={cn("w-2 h-2 rounded-full", STAGE_META[stage].className)} />
                  <span className="text-xs text-muted-foreground">
                    {STAGE_META[stage].label} ({countByStage[stage]})
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Projects — col-span-1 */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Recent Projects</CardTitle>
              <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
                {(data as DashboardData).projectCount}
              </span>
            </div>
          </CardHeader>
          <CardContent>
            {(data as DashboardData).recentProjects.length === 0 ? (
              <Empty icon={<FolderKanban size={24} />} title="No projects yet" />
            ) : (
              <div className="space-y-0.5">
                {(data as DashboardData).recentProjects.map((project: Project) => (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="w-full flex items-center gap-2 px-2 py-2 rounded hover:bg-secondary/50 transition-colors group"
                  >
                    <span className="text-sm font-medium flex-1 text-left truncate">{project.name}</span>
                    <StageBadge stage={project.stage} />
                    <TypeBadge type={project.type} />
                    <ChevronRight size={14} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Idea Inbox preview */}
      <Card className="mt-4">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>Idea Inbox</CardTitle>
            <span className="text-xs bg-muted text-muted-foreground px-2 py-0.5 rounded-full">
              {(data as DashboardData).ideaCount}
            </span>
          </div>
        </CardHeader>
        <CardContent>
          {(data as DashboardData).recentIdeas.length === 0 ? (
            <Empty
              icon={<Lightbulb size={24} />}
              title="No ideas yet"
              sub="Capture raw ideas before they slip away."
            />
          ) : (
            <div className="divide-y divide-border">
              {(data as DashboardData).recentIdeas.map((idea: Idea) => (
                <div key={idea.id} className="py-2.5 px-1">
                  <p className="text-sm font-medium">{idea.title}</p>
                  {idea.body && (
                    <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">{idea.body}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
