import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { TrendingUp, FolderKanban, Lightbulb, AlertTriangle, ArrowUpRight } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StageBadge, Empty, fmt, STAGE_META } from "@/components/app-ui";
import { api } from "@/lib/api";
import type { ProjectStage } from "@/lib/types";

const STAGES: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];

export default function Dashboard() {
  const navigate = useNavigate();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard.get,
  });

  if (isLoading) {
    return (
      <div className="px-8 py-6">
        <div className="h-7 w-32 bg-card rounded border border-border animate-pulse mb-2" />
        <div className="h-4 w-48 bg-card rounded border border-border animate-pulse opacity-60" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mt-8">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[100px] bg-card rounded-lg border border-border animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="px-8 py-6">
        <p className="text-destructive text-sm">Failed to load dashboard.</p>
      </div>
    );
  }

  const { mrr, projectCount, ideaCount, legalPending, stageDist, recentProjects, recentIdeas } = data;

  const total = stageDist.reduce(
    (s: number, x: { stage: string; count: number }) => s + x.count,
    0
  ) || 1;
  const countByStage = Object.fromEntries(
    stageDist.map((x: { stage: string; count: number }) => [x.stage, x.count])
  );

  return (
    <div className="px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Dashboard</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-muted-foreground uppercase tracking-widest">Total MRR</span>
              <TrendingUp size={14} className="text-muted-foreground/70" />
            </div>
            <p className={cn("font-mono text-[28px] font-semibold tracking-tight leading-none", mrr > 0 ? "text-success" : "text-foreground")}>{fmt(mrr)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-muted-foreground uppercase tracking-widest">Projects</span>
              <FolderKanban size={14} className="text-muted-foreground/70" />
            </div>
            <p className="font-mono text-[28px] font-semibold tracking-tight leading-none text-foreground">{projectCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-muted-foreground uppercase tracking-widest">Idea Inbox</span>
              <Lightbulb size={14} className="text-muted-foreground/70" />
            </div>
            <p className="font-mono text-[28px] font-semibold tracking-tight leading-none text-warning">{ideaCount}</p>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-[11px] text-muted-foreground uppercase tracking-widest">Legal Pending</span>
              <AlertTriangle size={14} className="text-muted-foreground/70" />
            </div>
            <p className={cn(
              "font-mono text-[28px] font-semibold tracking-tight leading-none",
              legalPending > 0 ? "text-destructive" : "text-foreground"
            )}>{legalPending}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Pipeline */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Pipeline</CardTitle>
              <span className="text-[11px] text-muted-foreground tabular-nums font-mono">{total} total</span>
            </div>
          </CardHeader>
          <CardContent>
            <div className="flex rounded-full overflow-hidden h-2 bg-secondary">
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
            <div className="flex flex-wrap gap-x-5 gap-y-2 mt-4">
              {STAGES.filter((s) => (countByStage[s] ?? 0) > 0).map((stage) => (
                <div key={stage} className="flex items-center gap-2">
                  <div className={cn("w-2 h-2 rounded-full shrink-0", STAGE_META[stage].className)} />
                  <span className="text-[12px] text-muted-foreground">
                    {STAGE_META[stage].label}
                  </span>
                  <span className="text-[12px] text-foreground font-medium font-mono tabular-nums">
                    {countByStage[stage]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Recent Projects */}
        <Card>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Projects</CardTitle>
              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{projectCount}</span>
            </div>
          </CardHeader>
          <CardContent>
            {recentProjects.length === 0 ? (
              <Empty icon={<FolderKanban size={20} />} title="No projects yet" />
            ) : (
              <div className="-mx-2">
                {recentProjects.map((project) => (
                  <button
                    key={project.id}
                    onClick={() => navigate(`/projects/${project.id}`)}
                    className="w-full flex items-center gap-2.5 px-2 py-2.5 rounded-md hover:bg-secondary transition-colors group text-left"
                  >
                    <span className="text-[13px] font-medium flex-1 truncate">{project.name}</span>
                    <StageBadge stage={project.stage} />
                    <ArrowUpRight
                      size={12}
                      className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity"
                    />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Idea Inbox */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Idea Inbox</CardTitle>
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{ideaCount}</span>
          </div>
        </CardHeader>
        <CardContent>
          {recentIdeas.length === 0 ? (
            <Empty
              icon={<Lightbulb size={20} />}
              title="No ideas yet"
              sub="Capture raw ideas before they slip away."
            />
          ) : (
            <div className="divide-y divide-border">
              {recentIdeas.map((idea) => (
                <div key={idea.id} className="py-3 first:pt-0 last:pb-0">
                  <p className="text-[13px] font-medium">{idea.title}</p>
                  {idea.body && (
                    <p className="text-[12px] text-muted-foreground mt-0.5 line-clamp-1">{idea.body}</p>
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
