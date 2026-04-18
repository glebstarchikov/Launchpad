import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { TrendingUp, FolderKanban, Lightbulb, AlertTriangle, ArrowUpRight, Newspaper, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { cn } from "@/lib/utils";
import { StageBadge, Empty, fmt, STAGE_META } from "@/components/app-ui";
import { api } from "@/lib/api";
import { Button } from "@/components/ui/button";
import Markdown from "@/components/Markdown";
import type { ProjectStage } from "@/lib/types";

const STAGES: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];

function ExpandableCard({
  title,
  icon,
  count,
  isEmpty,
  emptyContent,
  action,
  children,
}: {
  title: string;
  icon?: React.ReactNode;
  count?: string | number;
  isEmpty?: boolean;
  emptyContent?: React.ReactNode;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [expanded, setExpanded] = useState(false);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            {icon}
            {title}
          </CardTitle>
          <div className="flex items-center gap-2">
            {count !== undefined && (
              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{count}</span>
            )}
            {action}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isEmpty ? (
          emptyContent
        ) : (
          <>
            <div className={expanded ? "" : "max-h-[200px] overflow-y-auto"}>
              {children}
            </div>
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition-colors mt-2 w-full justify-center"
            >
              {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
              {expanded ? "Show less" : "Show more"}
            </button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

const SEVERITY_DOT_CLASS: Record<string, string> = {
  critical: "bg-destructive",
  warning: "bg-warning",
  info: "bg-info",
};

const SEVERITY_LABEL: Record<string, string> = {
  critical: "Critical",
  warning: "Warning",
  info: "Info",
};

function deepLinkFor(item: import("@/lib/types").ActionItem): string {
  if (item.target === "news") return "/news";
  if (!item.project_id) return "/projects";
  const tabMap: Record<string, string> = {
    project: "",                    // overview
    legal: "compliance",
    checklist: "overview",
    "tech-debt": "health",
    goals: "revenue",
  };
  const tab = tabMap[item.target] ?? "";
  return tab ? `/projects/${item.project_id}?tab=${tab}` : `/projects/${item.project_id}`;
}

function ActionItemsCard({ className }: { className?: string }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard", "action-items"],
    queryFn: api.dashboard.actionItems,
    staleTime: 60_000,
  });

  const items = data?.items ?? [];
  const counts = data?.counts ?? { critical: 0, warning: 0, info: 0 };

  const bySeverity = {
    critical: items.filter((i) => i.severity === "critical"),
    warning: items.filter((i) => i.severity === "warning"),
    info: items.filter((i) => i.severity === "info"),
  };

  const renderSection = (severity: "critical" | "warning" | "info") => {
    const list = bySeverity[severity];
    if (list.length === 0) return null;
    const isExpanded = expanded[severity] ?? false;
    const visible = isExpanded ? list : list.slice(0, 6);
    const hidden = list.length - visible.length;

    return (
      <div key={severity}>
        <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium mb-1.5 flex items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 rounded-full", SEVERITY_DOT_CLASS[severity])} />
          {SEVERITY_LABEL[severity]} ({list.length})
        </h4>
        <div className="space-y-1">
          {visible.map((item) => (
            <button
              key={item.id}
              onClick={() => navigate(deepLinkFor(item))}
              className="flex items-center gap-3 px-3 py-2 rounded-md hover:bg-secondary/50 group w-full text-left"
            >
              <span className={cn("h-2 w-2 rounded-full shrink-0", SEVERITY_DOT_CLASS[severity])} />
              <span className="text-[13px] flex-1 truncate">{item.label}</span>
              {item.project_name && (
                <span className="text-[11px] text-muted-foreground shrink-0">{item.project_name}</span>
              )}
              <ArrowUpRight size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0" />
            </button>
          ))}
          {hidden > 0 && (
            <button
              onClick={() => setExpanded((e) => ({ ...e, [severity]: true }))}
              className="text-[11px] text-muted-foreground hover:text-foreground pl-3 py-1"
            >
              + {hidden} more
            </button>
          )}
        </div>
      </div>
    );
  };

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Action Items</CardTitle>
          <div className="flex items-center gap-2">
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
              {counts.critical} critical · {counts.warning} warning · {counts.info} info
            </span>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 w-6 p-0"
              onClick={() => queryClient.invalidateQueries({ queryKey: ["dashboard", "action-items"] })}
              title="Refresh"
            >
              <RefreshCw size={11} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-4 space-y-2">
            <div className="h-6 bg-card rounded border border-border animate-pulse" />
            <div className="h-6 bg-card rounded border border-border animate-pulse" />
          </div>
        ) : isError ? (
          <p className="text-xs text-destructive py-2">Failed to load action items.</p>
        ) : items.length === 0 ? (
          <div className="flex items-center gap-2 py-6 justify-center text-success">
            <span className="h-2 w-2 rounded-full bg-success" />
            <span className="text-sm">All clear — nothing needs attention</span>
          </div>
        ) : (
          <div className="space-y-4">
            {renderSection("critical")}
            {renderSection("warning")}
            {renderSection("info")}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function formatRelativeTime(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function ActivityFeedCard() {
  const navigate = useNavigate();
  const [showAll, setShowAll] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "activity"],
    queryFn: api.dashboard.activity,
    staleTime: 60_000,
  });

  const events = data?.events ?? [];
  const visible = showAll ? events : events.slice(0, 8);

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">What moved (last 24h)</CardTitle>
          <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
            {events.length} event{events.length === 1 ? "" : "s"}
          </span>
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="py-2 space-y-2">
            <div className="h-5 bg-card rounded border border-border animate-pulse" />
            <div className="h-5 bg-card rounded border border-border animate-pulse" />
          </div>
        ) : events.length === 0 ? (
          <p className="text-xs text-muted-foreground text-center py-4">No activity yet today</p>
        ) : (
          <div className="space-y-1.5">
            {visible.map((event) => (
              <button
                key={event.id}
                onClick={() => event.deep_link && navigate(event.deep_link)}
                disabled={!event.deep_link}
                className="flex items-center gap-3 px-2 py-1.5 rounded-md hover:bg-secondary/50 group w-full text-left disabled:cursor-default disabled:hover:bg-transparent"
              >
                <span className="text-[11px] text-muted-foreground font-mono tabular-nums shrink-0 w-14">
                  {formatRelativeTime(event.timestamp)}
                </span>
                <span className="text-base shrink-0">{event.icon}</span>
                <span className="text-[13px] flex-1 truncate">{event.label}</span>
                {event.project_name && (
                  <span className="text-[11px] text-muted-foreground shrink-0">{event.project_name}</span>
                )}
              </button>
            ))}
            {events.length > 8 && !showAll && (
              <button
                onClick={() => setShowAll(true)}
                className="text-[11px] text-muted-foreground hover:text-foreground pl-2 py-1 w-full text-left"
              >
                Show {events.length - 8} more
              </button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScoreboardCard() {
  const { data, isLoading } = useQuery({
    queryKey: ["dashboard", "scoreboard"],
    queryFn: api.dashboard.scoreboard,
    staleTime: 60_000,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3"><CardTitle className="text-sm font-medium">This month</CardTitle></CardHeader>
        <CardContent>
          <div className="h-24 bg-card rounded border border-border animate-pulse" />
        </CardContent>
      </Card>
    );
  }

  if (!data) return null;

  const renderDeltaRow = (
    label: string,
    current: string,
    delta: number,
    formatDelta: (n: number) => string,
    deltaPct: number | null = null,
  ) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <div className="flex items-center gap-3">
        <span className="font-mono text-sm tabular-nums">{current}</span>
        {delta !== 0 && (
          <span className={cn("text-xs font-mono tabular-nums", delta > 0 ? "text-success" : "text-destructive")}>
            {delta > 0 ? "↑" : "↓"} {formatDelta(Math.abs(delta))}
            {deltaPct !== null && ` (${deltaPct > 0 ? "+" : ""}${deltaPct}%)`}
          </span>
        )}
      </div>
    </div>
  );

  const renderStaticRow = (label: string, value: string) => (
    <div className="flex items-center justify-between py-2">
      <span className="text-sm text-muted-foreground">{label}</span>
      <span className="font-mono text-sm tabular-nums">{value}</span>
    </div>
  );

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">This month</CardTitle>
      </CardHeader>
      <CardContent className="divide-y divide-border">
        {renderDeltaRow("MRR", fmt(data.mrr.current), data.mrr.delta, fmt, data.mrr.delta_pct)}
        {renderDeltaRow("Projects shipped", String(data.projectsShipped.current), data.projectsShipped.delta, String)}
        {renderStaticRow("Legal complete", `${data.legalComplete.current_pct}%`)}
        {renderStaticRow("Launch checklist", `${data.checklistComplete.current_pct}%`)}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery({
    queryKey: ["dashboard"],
    queryFn: api.dashboard.get,
  });

  const { data: newsItems } = useQuery({
    queryKey: ["news"],
    queryFn: () => api.news.list(),
    staleTime: 60_000,
  });

  const refreshNews = useMutation({
    mutationFn: api.news.fetch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news"] });
    },
  });

  if (isLoading) {
    return (
      <div className="px-8 py-6 space-y-6">
        <div className="h-7 w-32 bg-card rounded border border-border animate-pulse" />
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="h-[88px] bg-card rounded-lg border border-border animate-pulse" />
          ))}
        </div>
        <div className="h-[170px] bg-card rounded-lg border border-border animate-pulse" />
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
      <h1 className="text-lg font-semibold">Dashboard</h1>

      {/* Stat cards — primary anchors */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card
          className="cursor-pointer hover:bg-secondary/30 transition-colors"
          onClick={() => navigate("/projects")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <TrendingUp size={14} />
              <span className="text-xs font-medium">Total MRR</span>
            </div>
            <p className={cn("text-2xl font-bold font-mono tabular-nums", mrr > 0 ? "text-success" : "")}>
              {fmt(mrr)}
            </p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-secondary/30 transition-colors"
          onClick={() => navigate("/projects")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <FolderKanban size={14} />
              <span className="text-xs font-medium">Projects</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">{projectCount}</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-secondary/30 transition-colors"
          onClick={() => navigate("/ideas")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Lightbulb size={14} />
              <span className="text-xs font-medium">Idea Inbox</span>
            </div>
            <p className="text-2xl font-bold font-mono tabular-nums">{ideaCount}</p>
          </CardContent>
        </Card>

        <Card
          className="cursor-pointer hover:bg-secondary/30 transition-colors"
          onClick={() => navigate("/projects")}
        >
          <CardContent className="pt-5 pb-4">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <AlertTriangle size={14} className={legalPending > 0 ? "text-destructive" : ""} />
              <span className="text-xs font-medium">Legal Pending</span>
            </div>
            <p className={cn("text-2xl font-bold font-mono tabular-nums", legalPending > 0 ? "text-destructive" : "")}>
              {legalPending}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Pipeline + Recent Projects */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
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
                  <span className="text-[12px] text-muted-foreground">{STAGE_META[stage].label}</span>
                  <span className="text-[12px] text-foreground font-medium font-mono tabular-nums">
                    {countByStage[stage]}
                  </span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        <Card className="flex flex-col">
          <CardHeader className="pb-3 shrink-0">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium">Recent Projects</CardTitle>
              <span className="text-[11px] font-mono text-muted-foreground tabular-nums">{projectCount}</span>
            </div>
          </CardHeader>
          <CardContent className={cn(recentProjects.length > 0 && "overflow-y-auto max-h-[160px]")}>
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
                    <ArrowUpRight size={12} className="text-muted-foreground opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Action Items + Scoreboard side by side */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-2">
          <ActionItemsCard />
        </div>
        <ScoreboardCard />
      </div>

      {/* Idea Inbox */}
      <ExpandableCard
        title="Idea Inbox"
        count={ideaCount}
        isEmpty={recentIdeas.length === 0}
        emptyContent={<Empty icon={<Lightbulb size={20} />} title="No ideas yet" sub="Capture raw ideas before they slip away." />}
      >
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
      </ExpandableCard>

      {/* Today's Signals */}
      {(() => {
        const oneDayAgo = Date.now() - 86400000;
        const relevant = (newsItems ?? []).filter(i => (i.relevance_score ?? 0) > 0);
        const todaysSignals = relevant.filter(i => i.created_at >= oneDayAgo);
        const signals = todaysSignals.length > 0 ? todaysSignals.slice(0, 5) : relevant.slice(0, 5);
        if (signals.length === 0) return null;
        return (
          <ExpandableCard
            title="Today's Signals"
            icon={<Newspaper size={14} className="text-info" />}
            count={`${signals.filter(i => !i.read).length} unread`}
            isEmpty={false}
            action={
              <Button
                size="sm"
                variant="ghost"
                onClick={() => refreshNews.mutate()}
                disabled={refreshNews.isPending}
                className="h-6 text-[11px] px-2"
              >
                <RefreshCw size={10} className={cn("mr-1", refreshNews.isPending && "animate-spin")} />
                Refresh
              </Button>
            }
          >
            <div className="divide-y divide-border">
              {signals.map((item) => (
                <div key={item.id} className="py-2.5 first:pt-0 last:pb-0">
                  <a
                    href={item.url ?? "#"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-[13px] font-medium hover:text-info transition-colors line-clamp-1"
                  >
                    {item.title}
                  </a>
                  {item.summary && (
                    <Markdown content={item.summary} className="text-[12px] text-muted-foreground mt-0.5" />
                  )}
                </div>
              ))}
            </div>
          </ExpandableCard>
        );
      })()}

      {/* Activity Feed — bottom of page, informational log */}
      <ActivityFeedCard />
    </div>
  );
}
