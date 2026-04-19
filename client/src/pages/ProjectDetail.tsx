import { useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, ChevronDown, ChevronRight, Copy, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X, Check, Star,
  Github, GitCommit, GitPullRequest, CircleDot,
} from "lucide-react";
import { AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { StageBadge, TypeBadge, TagInput, PingDot, fmt, Empty } from "@/components/app-ui";
import FilesView from "@/components/FilesView";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Project, ProjectLink, LaunchChecklistItem, ChecklistCategory, TechDebtItem, TechDebtSeverity, TechDebtCategory, TechDebtEffort, MrrEntry, Goal, ProjectStage, ProjectType, ProjectCountry, LegalItem, LegalPriority, LegalCategory, LegalResource, LegalReviewDiff, LegalReviewMissingItem, Note, GitHubRepoData } from "@/lib/types";

const STAGES: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];
const TYPES: ProjectType[] = ["for-profit", "open-source"];

// Preset link labels for the Links Hub
const LINK_PRESETS = ["GitHub", "Vercel", "Stripe", "Supabase", "Railway", "Linear", "Figma", "Notion", "Analytics", "Production"];

const VALID_TABS = ["overview", "health", "revenue", "compliance", "buildlog", "github", "files"];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const tab = rawTab && VALID_TABS.includes(rawTab) ? rawTab : "overview";
  const setTab = (next: string) => {
    const nextParams = new URLSearchParams(searchParams);
    if (next === "overview") {
      nextParams.delete("tab");
    } else {
      nextParams.set("tab", next);
    }
    setSearchParams(nextParams, { replace: true });
  };

  // Project query
  const { data: project, isLoading } = useQuery({
    queryKey: ["projects", id],
    queryFn: () => api.projects.get(id!),
    enabled: !!id,
  });

  const starProject = useMutation({
    mutationFn: () => api.projects.star(id!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    },
  });

  const { data: githubData } = useQuery({
    queryKey: ["github", id],
    queryFn: () => api.github.getRepoData(id!),
    enabled: !!id,
  });

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!project) return <div className="p-8 text-destructive">Project not found.</div>;

  const TABS = [
    { value: "overview", label: "Overview" },
    { value: "health", label: "Health" },
    ...(project.type === "for-profit" ? [{ value: "revenue", label: "Revenue" }] : []),
    { value: "compliance", label: "Compliance" },
    { value: "buildlog", label: "Build Log" },
    { value: "github", label: "GitHub" },
    { value: "files", label: "Files" },
  ];

  return (
    <div className="flex flex-col h-[calc(100vh-48px)]">
      {/* Sticky header */}
      <div className="sticky top-0 z-10 bg-background border-b border-border px-8 pt-6 pb-0">
        {/* Breadcrumb */}
        <div className="flex items-center gap-1.5 text-sm text-muted-foreground mb-3">
          <Link to="/projects" className="hover:text-foreground transition-colors">Projects</Link>
          <ChevronRight size={14} />
          <span className="text-foreground">{project.name}</span>
        </div>

        {/* Name + badges + actions */}
        <div className="flex items-center gap-3 flex-wrap">
          <h1 className="text-lg font-semibold">{project.name}</h1>
          <button
            onClick={() => starProject.mutate()}
            className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground transition-colors shrink-0"
            aria-label={project.starred ? "Unstar project" : "Star project"}
          >
            <Star size={15} className={project.starred ? "fill-warning text-warning" : ""} />
          </button>
          <StageBadge stage={project.stage} />
          <TypeBadge type={project.type} />
          <div className="ml-auto flex items-center gap-2">
            {project.url && (
              <Button variant="ghost" size="sm" asChild>
                <a href={project.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={14} className="mr-1.5" />
                  Visit
                </a>
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <Tabs value={tab} onValueChange={setTab} className="mt-4">
          <TabsList className="bg-transparent p-0 h-auto gap-0 border-b-0 w-full justify-start rounded-none">
            {TABS.map((t) => (
              <TabsTrigger
                key={t.value}
                value={t.value}
                className={cn(
                  "rounded-none border-b-2 border-transparent pb-3 px-4 text-sm font-medium text-muted-foreground",
                  "data-[state=active]:border-foreground data-[state=active]:text-foreground data-[state=active]:bg-transparent",
                  "hover:text-foreground transition-colors"
                )}
              >
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Tab content is rendered OUTSIDE the sticky header so it scrolls */}
          <div className="sr-only">{/* Tabs content below */}</div>
        </Tabs>
      </div>

      {/* Scrollable content area */}
      <div className="flex-1 p-8">
        <Tabs value={tab} onValueChange={setTab}>
          <TabsContent value="overview" className="mt-0">
            <OverviewTab project={project} id={id!} queryClient={queryClient} navigate={navigate} />
          </TabsContent>
          <TabsContent value="health" className="mt-0">
            <HealthTab project={project} id={id!} queryClient={queryClient} />
          </TabsContent>
          {project.type === "for-profit" && (
            <TabsContent value="revenue" className="mt-0">
              <RevenueTab project={project} id={id!} queryClient={queryClient} />
            </TabsContent>
          )}
          <TabsContent value="compliance" className="mt-0">
            <ComplianceTab id={id!} queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="buildlog" className="mt-0">
            <BuildLogTab id={id!} queryClient={queryClient} />
          </TabsContent>
          <TabsContent value="github" className="mt-0">
            <GitHubTab projectId={id!} githubData={githubData} />
          </TabsContent>
          <TabsContent value="files" className="mt-0">
            <div className="p-4">
              <FilesView projectId={id} />
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

interface OverviewTabProps {
  project: Project;
  id: string;
  queryClient: ReturnType<typeof useQueryClient>;
  navigate: ReturnType<typeof useNavigate>;
}

function OverviewTab({ project, id, queryClient, navigate }: OverviewTabProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Left column — spans 2/3 */}
      <div className="lg:col-span-2 space-y-4">
        <ProjectInfoCard project={project} id={id} queryClient={queryClient} />
        <LaunchChecklistCard id={id} projectStage={project.stage} queryClient={queryClient} />
      </div>

      {/* Right column — 1/3 */}
      <div className="space-y-4">
        <LinksHubCard project={project} id={id} queryClient={queryClient} />
        <DangerZoneCard project={project} id={id} queryClient={queryClient} navigate={navigate} />
      </div>
    </div>
  );
}

function HealthTab({ project, id, queryClient }: { project: Project; id: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [pingStatus, setPingStatus] = useState<"up" | "down" | null>(null);
  const [pingLatency, setPingLatency] = useState<number | null>(null);
  const [pinging, setPinging] = useState(false);
  const [debtNote, setDebtNote] = useState("");
  const [debtSeverity, setDebtSeverity] = useState<TechDebtSeverity>("medium");
  const [debtCategory, setDebtCategory] = useState<TechDebtCategory>("refactor");
  const [debtEffort, setDebtEffort] = useState<TechDebtEffort>("moderate");
  const [filterSeverity, setFilterSeverity] = useState<TechDebtSeverity | "all">("all");
  const [filterCategory, setFilterCategory] = useState<TechDebtCategory | "all">("all");
  const [filterResolved, setFilterResolved] = useState<"all" | "open" | "resolved">("all");

  const { data: techDebt = [] } = useQuery({
    queryKey: ["tech-debt", id],
    queryFn: () => api.projects.techDebt.list(id),
  });

  const addDebt = useMutation({
    mutationFn: (data: { note: string; severity: TechDebtSeverity; category: TechDebtCategory; effort: TechDebtEffort }) =>
      api.projects.techDebt.create(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tech-debt", id] });
      setDebtNote("");
      setDebtSeverity("medium");
      setDebtCategory("refactor");
      setDebtEffort("moderate");
    },
  });

  const updateDebt = useMutation({
    mutationFn: ({ debtId, data }: { debtId: string; data: { resolved?: boolean; severity?: TechDebtSeverity; category?: TechDebtCategory; effort?: TechDebtEffort } }) =>
      api.projects.techDebt.update(id, debtId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tech-debt", id] }),
  });

  const deleteDebt = useMutation({
    mutationFn: (debtId: string) => api.projects.techDebt.delete(id, debtId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["tech-debt", id] }),
  });

  const handlePing = async () => {
    if (!project.url) return;
    setPinging(true);
    try {
      const result = await api.ping(project.url);
      setPingStatus(result.status);
      setPingLatency(result.latencyMs);
    } catch {
      setPingStatus("down");
      setPingLatency(null);
    } finally {
      setPinging(false);
    }
  };

  const handleAddDebt = (e: React.FormEvent) => {
    e.preventDefault();
    if (debtNote.trim()) {
      addDebt.mutate({
        note: debtNote.trim(),
        severity: debtSeverity,
        category: debtCategory,
        effort: debtEffort,
      });
    }
  };

  const filteredDebt = techDebt.filter((item: TechDebtItem) => {
    if (filterSeverity !== "all" && item.severity !== filterSeverity) return false;
    if (filterCategory !== "all" && item.category !== filterCategory) return false;
    if (filterResolved === "open" && item.resolved === 1) return false;
    if (filterResolved === "resolved" && item.resolved === 0) return false;
    return true;
  });

  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
      {/* Site Status card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Site Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-3">
            <PingDot status={pingStatus} />
            <span className="font-mono text-sm truncate min-w-0 flex-1" title={project.url ?? undefined}>
              {project.url ?? "No URL set"}
            </span>
            {pingLatency !== null && (
              <span className={cn("text-xs shrink-0", pingStatus === "up" ? "text-success" : "text-destructive")}>
                {pingStatus === "up" ? `${pingLatency}ms` : "unreachable"}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="gap-1.5 shrink-0"
              disabled={!project.url || pinging}
              onClick={handlePing}
            >
              <RefreshCw size={12} className={cn(pinging && "animate-spin")} />
              Ping Now
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Tech Debt card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Tech Debt</CardTitle>
            <span className="text-[11px] font-mono text-muted-foreground tabular-nums">
              {techDebt.filter((i: TechDebtItem) => i.resolved === 0).length} open
            </span>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {/* Filter bar */}
          {techDebt.length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={filterResolved} onValueChange={(v) => setFilterResolved(v as typeof filterResolved)}>
                <SelectTrigger className="h-7 text-xs w-[110px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="all">All</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterSeverity} onValueChange={(v) => setFilterSeverity(v as typeof filterSeverity)}>
                <SelectTrigger className="h-7 text-xs w-[120px]"><SelectValue placeholder="Severity" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All severity</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as typeof filterCategory)}>
                <SelectTrigger className="h-7 text-xs w-[130px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="refactor">Refactor</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="docs">Docs</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Items */}
          {filteredDebt.length === 0 ? (
            <p className="text-xs text-muted-foreground text-center py-2">
              {techDebt.length === 0 ? "No tech debt tracked yet." : "No items match the current filters."}
            </p>
          ) : (
            <div className="space-y-2">
              {filteredDebt.map((item: TechDebtItem) => {
                const severity = item.severity ?? "medium";
                const category = item.category ?? "refactor";
                const effort = item.effort ?? "moderate";
                const severityClass =
                  severity === "high" ? "bg-destructive/10 text-destructive border-destructive/30" :
                  severity === "low" ? "bg-muted text-muted-foreground border-border" :
                  "bg-warning/10 text-warning border-warning/30";
                return (
                  <div key={item.id} className={cn(
                    "flex items-start gap-3 p-4 rounded-md border",
                    item.resolved === 1 ? "border-border/40 bg-card/50" : "border-border"
                  )}>
                    <Checkbox
                      checked={item.resolved === 1}
                      onCheckedChange={(v) => updateDebt.mutate({ debtId: item.id, data: { resolved: !!v } })}
                      className="mt-1"
                    />
                    <div className="flex-1 min-w-0 space-y-3">
                      <p className={cn("text-sm leading-relaxed", item.resolved === 1 && "line-through text-muted-foreground")}>
                        {item.note}
                      </p>
                      <div className="flex flex-wrap items-center gap-2.5">
                        <span className={cn("text-[11px] px-2.5 py-1 rounded border font-medium leading-none", severityClass)}>
                          {severity}
                        </span>
                        <span className="text-[11px] px-2.5 py-1 rounded border border-border text-muted-foreground leading-none">
                          {category}
                        </span>
                        <span className="text-[11px] px-2.5 py-1 rounded border border-border text-muted-foreground leading-none">
                          {effort}
                        </span>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteDebt.mutate(item.id)}
                    >
                      <Trash2 size={13} />
                    </Button>
                  </div>
                );
              })}
            </div>
          )}

          {/* Add form */}
          <form onSubmit={handleAddDebt} className="space-y-2 pt-2 border-t border-border">
            <Input
              value={debtNote}
              onChange={e => setDebtNote(e.target.value)}
              placeholder="Describe the tech debt..."
            />
            <div className="flex items-center gap-2">
              <Select value={debtSeverity} onValueChange={(v) => setDebtSeverity(v as TechDebtSeverity)}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="low">Low severity</SelectItem>
                  <SelectItem value="medium">Medium severity</SelectItem>
                  <SelectItem value="high">High severity</SelectItem>
                </SelectContent>
              </Select>
              <Select value={debtCategory} onValueChange={(v) => setDebtCategory(v as TechDebtCategory)}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="bug">Bug</SelectItem>
                  <SelectItem value="refactor">Refactor</SelectItem>
                  <SelectItem value="security">Security</SelectItem>
                  <SelectItem value="performance">Performance</SelectItem>
                  <SelectItem value="docs">Docs</SelectItem>
                </SelectContent>
              </Select>
              <Select value={debtEffort} onValueChange={(v) => setDebtEffort(v as TechDebtEffort)}>
                <SelectTrigger className="h-8 text-xs flex-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="quick">Quick</SelectItem>
                  <SelectItem value="moderate">Moderate</SelectItem>
                  <SelectItem value="significant">Significant</SelectItem>
                </SelectContent>
              </Select>
              <Button type="submit" size="sm" disabled={!debtNote.trim() || addDebt.isPending} className="shrink-0">
                Add
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}

function RevenueTab({ project: _project, id, queryClient }: { project: Project; id: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [mrrInput, setMrrInput] = useState("");
  const [usersInput, setUsersInput] = useState("");
  const [goalDialogOpen, setGoalDialogOpen] = useState(false);
  const [goalForm, setGoalForm] = useState({ description: "", target_value: "", current_value: "0", unit: "", target_date: "" });

  const { data: mrrHistory = [] } = useQuery({
    queryKey: ["mrr", id],
    queryFn: () => api.projects.mrr.list(id),
  });

  const { data: goals = [] } = useQuery({
    queryKey: ["goals", id],
    queryFn: () => api.projects.goals.list(id),
  });

  const addMrr = useMutation({
    mutationFn: (data: { mrr: number; user_count: number }) => api.projects.mrr.create(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["mrr", id] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setMrrInput("");
      setUsersInput("");
    },
  });

  const addGoal = useMutation({
    mutationFn: (data: Partial<Goal>) => api.projects.goals.create(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["goals", id] });
      setGoalDialogOpen(false);
      setGoalForm({ description: "", target_value: "", current_value: "0", unit: "", target_date: "" });
    },
  });

  const updateGoal = useMutation({
    mutationFn: ({ goalId, data }: { goalId: string; data: Partial<Goal> }) =>
      api.projects.goals.update(id, goalId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals", id] }),
  });

  const deleteGoal = useMutation({
    mutationFn: (goalId: string) => api.projects.goals.delete(id, goalId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["goals", id] }),
  });

  const latestMrr = mrrHistory.at(-1)?.mrr ?? 0;
  const latestUsers = mrrHistory.at(-1)?.user_count ?? 0;
  const arr = latestMrr * 12;

  const chartData = mrrHistory.map((e: MrrEntry) => ({
    date: new Date(e.recorded_at).toLocaleDateString("en-US", { month: "short", day: "numeric" }),
    mrr: e.mrr,
  }));

  const handleLogMrr = (e: React.FormEvent) => {
    e.preventDefault();
    const mrr = parseFloat(mrrInput);
    const users = parseInt(usersInput || "0", 10);
    if (isNaN(mrr)) return;
    addMrr.mutate({ mrr, user_count: users });
  };

  const handleAddGoal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!goalForm.description || !goalForm.target_value) return;
    addGoal.mutate({
      description: goalForm.description,
      target_value: parseFloat(goalForm.target_value),
      current_value: parseFloat(goalForm.current_value || "0"),
      unit: goalForm.unit || null,
      target_date: goalForm.target_date ? new Date(goalForm.target_date).getTime() : null,
    });
  };

  const handleToggleGoal = (goal: Goal) => {
    updateGoal.mutate({
      goalId: goal.id,
      data: {
        description: goal.description,
        target_value: goal.target_value,
        current_value: goal.current_value,
        unit: goal.unit,
        target_date: goal.target_date,
        completed: goal.completed === 1 ? 0 : 1,
      },
    });
  };

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">MRR</p>
            <p className="font-mono text-3xl font-medium text-success mt-2">{fmt(latestMrr)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">Users</p>
            <p className="font-mono text-3xl font-medium text-foreground mt-2">{latestUsers.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-xs text-muted-foreground uppercase tracking-wider">ARR</p>
            <p className="font-mono text-3xl font-medium text-info mt-2">{fmt(arr)}</p>
          </CardContent>
        </Card>
      </div>

      {/* MRR Chart */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">MRR over time</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">No MRR data yet. Log your first entry below.</p>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="mrrGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(152 69% 50%)" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="hsl(152 69% 50%)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "hsl(0 0% 33.3%)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "hsl(0 0% 33.3%)" }} axisLine={false} tickLine={false}
                  tickFormatter={(v) => `$${v}`} />
                <Tooltip
                  contentStyle={{ background: "hsl(0 0% 5.9%)", border: "1px solid hsl(0 0% 10%)", borderRadius: "6px" }}
                  labelStyle={{ color: "hsl(0 0% 92.5%)" }}
                  formatter={(v: number) => [fmt(v), "MRR"]}
                />
                <Area type="monotone" dataKey="mrr" stroke="hsl(152 69% 50%)" strokeWidth={2}
                  fill="url(#mrrGrad)" />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Log Entry */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-medium">Log Entry</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleLogMrr} className="flex gap-3">
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">MRR ($)</Label>
              <Input type="number" step="0.01" value={mrrInput} onChange={(e) => setMrrInput(e.target.value)} placeholder="0.00" className="mt-1" />
            </div>
            <div className="flex-1">
              <Label className="text-xs text-muted-foreground">Users</Label>
              <Input type="number" value={usersInput} onChange={(e) => setUsersInput(e.target.value)} placeholder="0" className="mt-1" />
            </div>
            <Button type="submit" className="self-end" disabled={!mrrInput || addMrr.isPending}>Log</Button>
          </form>
        </CardContent>
      </Card>

      {/* Goals */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm font-medium">Goals</CardTitle>
            <Button variant="secondary" size="sm" className="gap-1.5" onClick={() => setGoalDialogOpen(true)}>
              <Plus size={13} />
              Add Goal
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {goals.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-4">No goals yet.</p>
          )}
          {goals.map((goal: Goal) => {
            const pct = goal.target_value > 0 ? Math.min(100, (goal.current_value / goal.target_value) * 100) : 0;
            return (
              <div key={goal.id} className={cn(
                "flex items-start gap-3 p-3 rounded border",
                goal.completed === 1 ? "border-success/20" : "border-border"
              )}>
                <Checkbox
                  checked={goal.completed === 1}
                  onCheckedChange={() => handleToggleGoal(goal)}
                  className="mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-sm font-medium", goal.completed === 1 && "line-through text-muted-foreground")}>
                    {goal.description}
                  </p>
                  <div className="flex items-center gap-2 mt-1">
                    <Progress value={pct} className="h-1.5 flex-1" />
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {goal.current_value}/{goal.target_value}{goal.unit ? ` ${goal.unit}` : ""}
                    </span>
                  </div>
                  {goal.target_date && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Target: {new Date(goal.target_date).toLocaleDateString()}
                    </p>
                  )}
                </div>
                <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive shrink-0"
                  onClick={() => deleteGoal.mutate(goal.id)}>
                  <Trash2 size={12} />
                </Button>
              </div>
            );
          })}
        </CardContent>
      </Card>

      {/* Add Goal Dialog */}
      <Dialog open={goalDialogOpen} onOpenChange={setGoalDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Goal</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleAddGoal} className="space-y-3">
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Input value={goalForm.description} onChange={(e) => setGoalForm(f => ({ ...f, description: e.target.value }))} placeholder="e.g. Reach 100 paying users" className="mt-1" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Target Value</Label>
                <Input type="number" value={goalForm.target_value} onChange={(e) => setGoalForm(f => ({ ...f, target_value: e.target.value }))} placeholder="100" className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Current Value</Label>
                <Input type="number" value={goalForm.current_value} onChange={(e) => setGoalForm(f => ({ ...f, current_value: e.target.value }))} placeholder="0" className="mt-1" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Unit (optional)</Label>
                <Input value={goalForm.unit} onChange={(e) => setGoalForm(f => ({ ...f, unit: e.target.value }))} placeholder="users, $, etc." className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Target Date (optional)</Label>
                <Input type="date" value={goalForm.target_date} onChange={(e) => setGoalForm(f => ({ ...f, target_date: e.target.value }))} className="mt-1" />
              </div>
            </div>
            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setGoalDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={!goalForm.description || !goalForm.target_value || addGoal.isPending}>Add Goal</Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

const COUNTRIES = [
  { code: "US", name: "United States" },
  { code: "UK", name: "United Kingdom" },
  { code: "CA", name: "Canada" },
  { code: "AU", name: "Australia" },
  { code: "DE", name: "Germany" },
  { code: "FR", name: "France" },
  { code: "NL", name: "Netherlands" },
  { code: "IN", name: "India" },
  { code: "BR", name: "Brazil" },
  { code: "JP", name: "Japan" },
  { code: "SG", name: "Singapore" },
  { code: "RU", name: "Russia" },
];

function countryFlag(code: string): string {
  const FLAGS: Record<string, string> = {
    EU: "\u{1F1EA}\u{1F1FA}", US: "\u{1F1FA}\u{1F1F8}", UK: "\u{1F1EC}\u{1F1E7}", CA: "\u{1F1E8}\u{1F1E6}", AU: "\u{1F1E6}\u{1F1FA}",
    DE: "\u{1F1E9}\u{1F1EA}", FR: "\u{1F1EB}\u{1F1F7}", NL: "\u{1F1F3}\u{1F1F1}", IN: "\u{1F1EE}\u{1F1F3}", BR: "\u{1F1E7}\u{1F1F7}",
    JP: "\u{1F1EF}\u{1F1F5}", SG: "\u{1F1F8}\u{1F1EC}", RU: "\u{1F1F7}\u{1F1FA}",
  };
  return FLAGS[code] ?? "\u{1F3F3}\u{FE0F}";
}

const EU_MEMBER_CODES = [
  "AT", "BE", "BG", "HR", "CY", "CZ", "DK", "EE", "FI", "FR", "DE", "GR",
  "HU", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PL", "PT", "RO", "SK", "SI", "ES", "SE",
];

function isEuMemberCountry(code: string): boolean {
  return EU_MEMBER_CODES.includes(code);
}

function LegalReviewModal({
  diff,
  isLoading,
  error,
  onClose,
  onApply,
  onRetry,
}: {
  diff: LegalReviewDiff | null;
  isLoading: boolean;
  error: string | null;
  onClose: () => void;
  onApply: (accepted: {
    stale: { id: string; status_note: string }[];
    rename: { id: string; new_item: string }[];
    missing: LegalReviewMissingItem[];
    removed: string[];
  }) => void;
  onRetry: () => void;
}) {
  const [acceptedStale, setAcceptedStale] = useState<Set<number>>(new Set());
  const [acceptedRename, setAcceptedRename] = useState<Set<number>>(new Set());
  const [acceptedMissing, setAcceptedMissing] = useState<Set<number>>(new Set());
  const [acceptedRemoved, setAcceptedRemoved] = useState<Set<number>>(new Set());
  const [allowRemovals, setAllowRemovals] = useState(false);
  const [showOk, setShowOk] = useState(false);

  const toggle = (set: Set<number>, setSet: (s: Set<number>) => void, idx: number) => {
    const next = new Set(set);
    if (next.has(idx)) next.delete(idx);
    else next.add(idx);
    setSet(next);
  };

  const totalAccepted = acceptedStale.size + acceptedRename.size + acceptedMissing.size + acceptedRemoved.size;

  const handleApply = () => {
    if (!diff) return;
    onApply({
      stale: [...acceptedStale].map(i => diff.stale[i]),
      rename: [...acceptedRename].map(i => diff.rename[i]),
      missing: [...acceptedMissing].map(i => diff.missing[i]),
      removed: [...acceptedRemoved].map(i => diff.removed[i]),
    });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
      <div className="bg-card border border-border rounded-lg max-w-3xl w-full max-h-[80vh] flex flex-col">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h2 className="text-base font-semibold">Review Compliance</h2>
          <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onClose}>
            <X size={14} />
          </Button>
        </div>

        <div className="flex-1 overflow-auto p-4 space-y-4">
          {isLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">
              Reviewing compliance items with LLM... this may take 5-15 seconds.
            </p>
          )}

          {error && (
            <div className="text-center py-8 space-y-3">
              <p className="text-sm text-destructive">Review failed: {error}</p>
              <Button onClick={onRetry} size="sm">Retry</Button>
            </div>
          )}

          {diff && !isLoading && !error && (
            <>
              {/* Stale items */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Stale ({diff.stale.length})
                </h3>
                {diff.stale.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No stale items.</p>
                ) : (
                  <div className="space-y-1.5">
                    {diff.stale.map((s, idx) => (
                      <label key={idx} className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-secondary/30">
                        <Checkbox checked={acceptedStale.has(idx)} onCheckedChange={() => toggle(acceptedStale, setAcceptedStale, idx)} className="mt-1" />
                        <div className="flex-1 min-w-0">
                          <p className="text-xs text-muted-foreground">id: {s.id.slice(0, 8)}…</p>
                          <p className="text-sm text-warning leading-snug mt-0.5">{s.status_note}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Renamed items */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Renamed ({diff.rename.length})
                </h3>
                {diff.rename.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No renamed items.</p>
                ) : (
                  <div className="space-y-1.5">
                    {diff.rename.map((r, idx) => (
                      <label key={idx} className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-secondary/30">
                        <Checkbox checked={acceptedRename.has(idx)} onCheckedChange={() => toggle(acceptedRename, setAcceptedRename, idx)} className="mt-1" />
                        <div className="flex-1 min-w-0 text-sm">
                          <p className="text-muted-foreground line-through">{r.id.slice(0, 8)}…</p>
                          <p>→ {r.new_item}</p>
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Missing items */}
              <div>
                <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium mb-2">
                  Missing ({diff.missing.length})
                </h3>
                {diff.missing.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No missing items.</p>
                ) : (
                  <div className="space-y-1.5">
                    {diff.missing.map((m, idx) => (
                      <label key={idx} className="flex items-start gap-2 p-2 rounded border border-border cursor-pointer hover:bg-secondary/30">
                        <Checkbox checked={acceptedMissing.has(idx)} onCheckedChange={() => toggle(acceptedMissing, setAcceptedMissing, idx)} className="mt-1" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium">{m.item}</p>
                          <div className="flex gap-2 mt-1 text-[10px]">
                            <span className="text-muted-foreground">{m.scope === "region" ? "🇪🇺 EU" : m.country_code}</span>
                            <span className="text-muted-foreground">{m.priority}</span>
                            <span className="text-muted-foreground">{m.category}</span>
                          </div>
                          {m.why && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{m.why}</p>}
                        </div>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Removed items (gated) */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    Removed ({diff.removed.length})
                  </h3>
                  {diff.removed.length > 0 && (
                    <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer">
                      <Checkbox checked={allowRemovals} onCheckedChange={(v) => setAllowRemovals(!!v)} />
                      Allow removals
                    </label>
                  )}
                </div>
                {diff.removed.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic">No removals suggested.</p>
                ) : (
                  <div className="space-y-1.5">
                    {diff.removed.map((rid, idx) => (
                      <label
                        key={idx}
                        className={cn(
                          "flex items-start gap-2 p-2 rounded border border-border",
                          allowRemovals ? "cursor-pointer hover:bg-secondary/30" : "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <Checkbox
                          checked={acceptedRemoved.has(idx)}
                          disabled={!allowRemovals}
                          onCheckedChange={() => allowRemovals && toggle(acceptedRemoved, setAcceptedRemoved, idx)}
                          className="mt-1"
                        />
                        <p className="text-sm text-muted-foreground">id: {rid.slice(0, 8)}…</p>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* OK items collapsed */}
              <div>
                <button
                  className="text-xs uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground"
                  onClick={() => setShowOk(s => !s)}
                >
                  OK ({diff.ok.length}) — {showOk ? "hide" : "show"}
                </button>
                {showOk && diff.ok.length > 0 && (
                  <div className="mt-2 space-y-0.5 max-h-40 overflow-auto">
                    {diff.ok.map((oid, idx) => (
                      <p key={idx} className="text-[11px] text-muted-foreground font-mono">{oid}</p>
                    ))}
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <div className="p-4 border-t border-border flex items-center justify-between">
          <span className="text-xs text-muted-foreground">{totalAccepted} change{totalAccepted === 1 ? "" : "s"} selected</span>
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={onClose}>Cancel</Button>
            <Button size="sm" disabled={totalAccepted === 0 || isLoading || !!error} onClick={handleApply}>
              Apply {totalAccepted} change{totalAccepted === 1 ? "" : "s"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

const PRIORITY_BADGE: Record<string, string> = {
  blocker: "bg-destructive/10 text-destructive border-destructive/30",
  important: "bg-warning/10 text-warning border-warning/30",
  recommended: "bg-muted text-muted-foreground border-border",
};

const CATEGORY_LABEL: Record<string, string> = {
  privacy: "Privacy",
  tax: "Tax",
  terms: "Terms",
  ip: "IP",
  accessibility: "Accessibility",
  data: "Data",
  corporate: "Corporate",
};

function LegalScopeCard({
  title,
  items,
  done,
  total,
  pct,
  onToggle,
  onDelete,
  onAddCustom,
}: {
  title: string;
  items: LegalItem[];
  done: number;
  total: number;
  pct: number;
  onToggle: (itemId: string, completed: boolean) => void;
  onDelete: (itemId: string) => void;
  onAddCustom: (item: string, priority: LegalPriority, category: LegalCategory) => void;
}) {
  const [expanded, setExpanded] = useState<Record<string, { why: boolean; action: boolean }>>({});
  const [customInput, setCustomInput] = useState("");
  const [customPriority, setCustomPriority] = useState<LegalPriority>("recommended");
  const [customCategory, setCustomCategory] = useState<LegalCategory>("terms");
  const [showCustomForm, setShowCustomForm] = useState(false);

  const toggleExpanded = (id: string, field: "why" | "action") => {
    setExpanded(prev => ({
      ...prev,
      [id]: { ...prev[id], [field]: !prev[id]?.[field] },
    }));
  };

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">{title}</CardTitle>
          <span className="text-xs text-muted-foreground">{done}/{total}</span>
        </div>
        <Progress value={pct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-3">
        {items.length === 0 && (
          <p className="text-xs text-muted-foreground text-center py-2">No items match the current filters.</p>
        )}
        {items.map((item: LegalItem) => {
          const priority = item.priority ?? "recommended";
          const category = item.category ?? "terms";
          const priorityClass = PRIORITY_BADGE[priority];
          const isExpanded = expanded[item.id] ?? { why: false, action: false };

          return (
            <div key={item.id} className={cn(
              "flex items-start gap-3 p-4 rounded-md border",
              item.completed === 1 ? "border-border/40 bg-card/50" : "border-border"
            )}>
              <Checkbox
                id={`legal-${item.id}`}
                checked={item.completed === 1}
                onCheckedChange={(v) => onToggle(item.id, !!v)}
                className="mt-1"
              />
              <div className="flex-1 min-w-0 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <label
                    htmlFor={`legal-${item.id}`}
                    className={cn(
                      "text-sm leading-snug flex-1 cursor-pointer",
                      item.completed === 1 && "line-through text-muted-foreground"
                    )}
                  >
                    {item.item}
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className={cn("text-[11px] px-2.5 py-1 rounded border font-medium leading-none", priorityClass)}>
                    {priority}
                  </span>
                  <span className="text-[11px] px-2.5 py-1 rounded border border-border text-muted-foreground leading-none">
                    {CATEGORY_LABEL[category]}
                  </span>
                  {item.status_note && (
                    <span
                      title={item.status_note}
                      className="inline-flex items-center gap-1 text-[11px] text-warning"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-warning" />
                      needs review
                    </span>
                  )}
                </div>
                {item.why && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.id, "why")}
                      className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      {isExpanded.why ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      Why this matters
                    </button>
                    {isExpanded.why && (
                      <p className="text-xs text-muted-foreground leading-relaxed mt-1.5">{item.why}</p>
                    )}
                  </div>
                )}
                {item.action && (
                  <div>
                    <button
                      type="button"
                      onClick={() => toggleExpanded(item.id, "action")}
                      className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium hover:text-foreground transition-colors flex items-center gap-1"
                    >
                      {isExpanded.action ? <ChevronDown size={11} /> : <ChevronRight size={11} />}
                      Action
                    </button>
                    {isExpanded.action && (
                      <p className="text-xs leading-relaxed mt-1.5">{item.action}</p>
                    )}
                  </div>
                )}
                {item.resources && item.resources.length > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {(item.resources as LegalResource[]).map((r, i) => (
                      <a
                        key={i}
                        href={r.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-[11px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:border-foreground transition-colors inline-flex items-center gap-1"
                      >
                        {r.label}
                        <ExternalLink size={9} />
                      </a>
                    ))}
                  </div>
                )}
                {item.status_note && (
                  <p className="text-[11px] text-warning bg-warning/5 border border-warning/20 rounded p-2 leading-relaxed">
                    {item.status_note}
                  </p>
                )}
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive shrink-0"
                onClick={() => onDelete(item.id)}
              >
                <Trash2 size={13} />
              </Button>
            </div>
          );
        })}

        {/* Add custom item form */}
        {showCustomForm ? (
          <div className="space-y-2 p-3 border border-dashed border-border rounded-md">
            <Input
              value={customInput}
              onChange={e => setCustomInput(e.target.value)}
              placeholder="Custom legal item..."
              className="text-sm h-9"
              autoFocus
            />
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={customPriority} onValueChange={(v) => setCustomPriority(v as LegalPriority)}>
                <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="blocker">Blocker</SelectItem>
                  <SelectItem value="important">Important</SelectItem>
                  <SelectItem value="recommended">Recommended</SelectItem>
                </SelectContent>
              </Select>
              <Select value={customCategory} onValueChange={(v) => setCustomCategory(v as LegalCategory)}>
                <SelectTrigger className="h-8 text-xs flex-1 min-w-[120px]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="privacy">Privacy</SelectItem>
                  <SelectItem value="tax">Tax</SelectItem>
                  <SelectItem value="terms">Terms</SelectItem>
                  <SelectItem value="ip">IP</SelectItem>
                  <SelectItem value="accessibility">Accessibility</SelectItem>
                  <SelectItem value="data">Data</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                </SelectContent>
              </Select>
              <Button
                size="sm"
                className="h-8 text-xs"
                disabled={!customInput.trim()}
                onClick={() => {
                  onAddCustom(customInput.trim(), customPriority, customCategory);
                  setCustomInput("");
                  setShowCustomForm(false);
                }}
              >
                Add
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-8 text-xs"
                onClick={() => { setShowCustomForm(false); setCustomInput(""); }}
              >
                <X size={13} />
              </Button>
            </div>
          </div>
        ) : (
          <button
            onClick={() => setShowCustomForm(true)}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full pt-1"
          >
            <Plus size={11} />
            Add custom item
          </button>
        )}
      </CardContent>
    </Card>
  );
}

function ComplianceTab({ id, queryClient }: { id: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [selectedCountry, setSelectedCountry] = useState("");
  const [customItemInputs, setCustomItemInputs] = useState<Record<string, string>>({});
  const [showCustomForm, setShowCustomForm] = useState<Record<string, boolean>>({});
  const [filterPriority, setFilterPriority] = useState<"all" | "blocker" | "important" | "recommended">("all");
  const [filterCategory, setFilterCategory] = useState<"all" | "privacy" | "tax" | "terms" | "ip" | "accessibility" | "data" | "corporate">("all");
  const [filterStatus, setFilterStatus] = useState<"all" | "open" | "done" | "needs-review">("all");

  const { data: countries = [] } = useQuery({
    queryKey: ["countries", id],
    queryFn: () => api.projects.countries.list(id),
  });

  const { data: legalItems = [] } = useQuery({
    queryKey: ["legal", id],
    queryFn: () => api.projects.legal.list(id),
  });

  const addCountry = useMutation({
    mutationFn: (data: { country_code: string; country_name: string }) =>
      api.projects.countries.add(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["countries", id] });
      queryClient.invalidateQueries({ queryKey: ["legal", id] });
      setSelectedCountry("");
    },
  });

  const removeCountry = useMutation({
    mutationFn: (cId: string) => api.projects.countries.remove(id, cId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["countries", id] });
      queryClient.invalidateQueries({ queryKey: ["legal", id] });
    },
  });

  const toggleLegal = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      api.projects.legal.update(id, itemId, { completed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["legal", id] }),
  });

  const addLegalItem = useMutation({
    mutationFn: (data: {
      country_code: string;
      item: string;
      priority?: LegalPriority;
      category?: LegalCategory;
      scope?: "country" | "region";
      scope_code?: string | null;
    }) => api.projects.legal.create(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal", id] });
    },
  });

  const deleteLegal = useMutation({
    mutationFn: (itemId: string) => api.projects.legal.delete(id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["legal", id] }),
  });

  const [showReview, setShowReview] = useState(false);
  const [reviewDiff, setReviewDiff] = useState<LegalReviewDiff | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const reviewMutation = useMutation({
    mutationFn: () => api.projects.legal.review(id),
    onSuccess: (diff) => {
      setReviewDiff(diff);
      setReviewError(null);
    },
    onError: (err: any) => {
      setReviewError(err?.message ?? "Review failed");
    },
  });

  const applyReviewMutation = useMutation({
    mutationFn: (accepted: {
      stale: { id: string; status_note: string }[];
      rename: { id: string; new_item: string }[];
      missing: LegalReviewMissingItem[];
      removed: string[];
    }) => api.projects.legal.applyReview(id, accepted),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["legal", id] });
      setShowReview(false);
      setReviewDiff(null);
    },
  });

  const handleOpenReview = () => {
    setShowReview(true);
    setReviewDiff(null);
    setReviewError(null);
    reviewMutation.mutate();
  };

  const activeCodes = countries.map((c: ProjectCountry) => c.country_code);
  const availableCountries = COUNTRIES.filter(c => !activeCodes.includes(c.code));

  const handleAddCountry = () => {
    const country = COUNTRIES.find(c => c.code === selectedCountry);
    if (country) addCountry.mutate({ country_code: country.code, country_name: country.name });
  };

  // Apply filters
  const passesFilter = (item: LegalItem): boolean => {
    if (filterPriority !== "all" && (item.priority ?? "recommended") !== filterPriority) return false;
    if (filterCategory !== "all" && (item.category ?? "terms") !== filterCategory) return false;
    if (filterStatus === "open" && item.completed === 1) return false;
    if (filterStatus === "done" && item.completed === 0) return false;
    if (filterStatus === "needs-review" && !item.status_note) return false;
    return true;
  };
  const filteredItems = legalItems.filter(passesFilter);

  // Group by scope: country items by country_code, region items under their scope_code
  const itemsByScope: Record<string, LegalItem[]> = {};
  for (const item of filteredItems) {
    const key = item.scope === "region" ? `region:${item.scope_code ?? "unknown"}` : item.country_code;
    if (!itemsByScope[key]) itemsByScope[key] = [];
    itemsByScope[key].push(item);
  }

  // Show EU section if any EU member country is active
  const hasEuMember = countries.some((c: ProjectCountry) => isEuMemberCountry(c.country_code));

  return (
    <div className="space-y-4">
      {/* Disclaimer banner */}
      <div className="text-[11px] text-muted-foreground bg-warning/5 border border-warning/20 rounded p-2.5 leading-relaxed">
        ⚠️ <span className="font-medium text-warning">Compliance suggestions, not legal advice.</span> This list is curated from public sources and personalized by an AI. Consult a lawyer before launching in regulated industries.
      </div>

      {/* Review compliance action bar */}
      <div className="flex items-center justify-between">
        <p className="text-[11px] text-muted-foreground">
          {legalItems.length > 0
            ? `${legalItems.length} compliance items tracked`
            : "Add a country below to seed compliance items."}
        </p>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={handleOpenReview}
          disabled={reviewMutation.isPending || legalItems.length === 0}
          title={legalItems.length === 0 ? "Add at least one country first" : "Run an LLM freshness review"}
        >
          <RefreshCw size={12} className={cn("mr-1.5", reviewMutation.isPending && "animate-spin")} />
          {reviewMutation.isPending ? "Reviewing..." : "Review compliance"}
        </Button>
      </div>

      {/* Add country card */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium">Add Country / Region</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Select value={selectedCountry} onValueChange={setSelectedCountry}>
              <SelectTrigger className="flex-1">
                <SelectValue placeholder="Select a country..." />
              </SelectTrigger>
              <SelectContent>
                {availableCountries.map(c => (
                  <SelectItem key={c.code} value={c.code}>
                    {countryFlag(c.code)} {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="secondary"
              disabled={!selectedCountry || addCountry.isPending}
              onClick={handleAddCountry}
            >
              <Plus size={13} className="mr-1.5" />
              Add
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Filter bar */}
      {legalItems.length > 0 && (
        <Card>
          <CardContent className="p-3">
            <div className="flex items-center gap-2 flex-wrap">
              <Select value={filterPriority} onValueChange={(v) => setFilterPriority(v as typeof filterPriority)}>
                <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Priority" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="blocker">Blocker</SelectItem>
                  <SelectItem value="important">Important</SelectItem>
                  <SelectItem value="recommended">Recommended</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterCategory} onValueChange={(v) => setFilterCategory(v as typeof filterCategory)}>
                <SelectTrigger className="h-8 text-xs w-[150px]"><SelectValue placeholder="Category" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All categories</SelectItem>
                  <SelectItem value="privacy">Privacy</SelectItem>
                  <SelectItem value="tax">Tax</SelectItem>
                  <SelectItem value="terms">Terms</SelectItem>
                  <SelectItem value="ip">IP</SelectItem>
                  <SelectItem value="accessibility">Accessibility</SelectItem>
                  <SelectItem value="data">Data</SelectItem>
                  <SelectItem value="corporate">Corporate</SelectItem>
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={(v) => setFilterStatus(v as typeof filterStatus)}>
                <SelectTrigger className="h-8 text-xs w-[140px]"><SelectValue placeholder="Status" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="done">Done</SelectItem>
                  <SelectItem value="needs-review">Needs review</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Active country chips + auto EU chip */}
      {(countries.length > 0 || hasEuMember) && (
        <div className="flex flex-wrap gap-2">
          {countries.map((c: ProjectCountry) => (
            <Badge key={c.id} variant="secondary" className="gap-1.5 pl-2 pr-1 py-1">
              {countryFlag(c.country_code)} {c.country_name}
              <button
                onClick={() => removeCountry.mutate(c.id)}
                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
              >
                <X size={12} />
              </button>
            </Badge>
          ))}
          {hasEuMember && (
            <Badge
              variant="outline"
              className="gap-1.5 px-2 py-1 border-dashed text-muted-foreground"
              title="Removed automatically when no EU member countries remain."
            >
              {countryFlag("EU")} European Union
            </Badge>
          )}
        </div>
      )}

      {/* Per-scope legal cards */}
      {countries.map((c: ProjectCountry) => {
        const items = itemsByScope[c.country_code] ?? [];
        const allItemsForCountry = legalItems.filter(li => li.scope === "country" && li.country_code === c.country_code);
        const done = allItemsForCountry.filter(i => i.completed === 1).length;
        const total = allItemsForCountry.length;
        const pct = total > 0 ? (done / total) * 100 : 0;

        return (
          <LegalScopeCard
            key={c.id}
            title={`${countryFlag(c.country_code)} ${c.country_name}`}
            items={items}
            done={done}
            total={total}
            pct={pct}
            onToggle={(itemId, completed) => toggleLegal.mutate({ itemId, completed })}
            onDelete={(itemId) => deleteLegal.mutate(itemId)}
            onAddCustom={(item, priority, category) => addLegalItem.mutate({ country_code: c.country_code, item, priority, category })}
          />
        );
      })}

      {/* EU region section (auto-attached when any EU member is present) */}
      {hasEuMember && (() => {
        const items = itemsByScope["region:eu"] ?? [];
        const allEuItems = legalItems.filter(li => li.scope === "region" && li.scope_code === "eu");
        const done = allEuItems.filter(i => i.completed === 1).length;
        const total = allEuItems.length;
        const pct = total > 0 ? (done / total) * 100 : 0;
        return (
          <LegalScopeCard
            key="eu-region"
            title={`${countryFlag("EU")} European Union`}
            items={items}
            done={done}
            total={total}
            pct={pct}
            onToggle={(itemId, completed) => toggleLegal.mutate({ itemId, completed })}
            onDelete={(itemId) => deleteLegal.mutate(itemId)}
            onAddCustom={(item, priority, category) => addLegalItem.mutate({ country_code: "", item, priority, category, scope: "region", scope_code: "eu" })}
          />
        );
      })()}

      {countries.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No countries added yet. Select a country above to get started with compliance tracking.
        </div>
      )}

      {showReview && (
        <LegalReviewModal
          diff={reviewDiff}
          isLoading={reviewMutation.isPending}
          error={reviewError}
          onClose={() => setShowReview(false)}
          onApply={(accepted) => applyReviewMutation.mutate(accepted)}
          onRetry={() => { setReviewError(null); reviewMutation.mutate(); }}
        />
      )}
    </div>
  );
}

function BuildLogTab({ id, queryClient }: { id: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [noteContent, setNoteContent] = useState("");
  const [isBuildLog, setIsBuildLog] = useState(true);

  const allNotes = useQuery({
    queryKey: ["notes", id],
    queryFn: () => api.projects.notes.list(id),
  });

  const addNote = useMutation({
    mutationFn: (data: { content: string; is_build_log: boolean }) =>
      api.projects.notes.create(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notes", id] });
      setNoteContent("");
    },
  });

  const deleteNote = useMutation({
    mutationFn: (noteId: string) => api.projects.notes.delete(id, noteId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["notes", id] }),
  });

  const [buildLogFilter, setBuildLogFilter] = useState<"all" | "user" | "ai">("all");
  const allBuildLog = (allNotes.data ?? []).filter((n: Note) => n.is_build_log === 1);
  const buildLogEntries = allBuildLog.filter((n: Note) =>
    buildLogFilter === "all" ? true : n.source === buildLogFilter,
  );

  return (
    <div className="space-y-4 w-full">
      {/* Composer card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="What did you build today?"
            className="min-h-[100px] resize-none"
          />
          <div className="flex flex-wrap items-center gap-3 justify-between">
            <div className="flex items-center gap-2 min-w-0">
              <Switch
                id="build-log-toggle"
                checked={isBuildLog}
                onCheckedChange={setIsBuildLog}
              />
              <Label htmlFor="build-log-toggle" className="text-sm text-muted-foreground cursor-pointer">
                Build log entry
              </Label>
            </div>
            <Button
              size="sm"
              className="shrink-0"
              disabled={!noteContent.trim() || addNote.isPending}
              onClick={() => addNote.mutate({ content: noteContent, is_build_log: isBuildLog })}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Build log filter */}
      {allBuildLog.length > 0 && (
        <div className="flex items-center gap-1 text-[11px]">
          {(["all", "user", "ai"] as const).map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => setBuildLogFilter(key)}
              className={cn(
                "px-2 py-1 rounded-md transition-colors",
                buildLogFilter === key
                  ? "bg-secondary text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {key === "all" ? "All" : key === "user" ? "Mine" : "AI"}
            </button>
          ))}
        </div>
      )}

      {/* Build log feed */}
      {buildLogEntries.length === 0 ? (
        <Empty
          icon={<BookOpen size={32} />}
          title={allBuildLog.length === 0 ? "No build log entries yet" : "No entries match this filter"}
          sub={allBuildLog.length === 0 ? "Toggle 'Build log entry' when saving a note to add it here." : undefined}
        />
      ) : (
        <div className="space-y-3">
          {buildLogEntries.map((entry: Note) => (
            <Card key={entry.id} className="group">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-sm whitespace-pre-wrap flex-1">{entry.content}</p>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 opacity-0 group-hover:opacity-100 hover:text-destructive shrink-0"
                    onClick={() => deleteNote.mutate(entry.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <p className="text-xs font-mono text-muted-foreground">
                    {new Date(entry.created_at).toLocaleString()}
                  </p>
                  {entry.source === "ai" && (
                    <span className="text-[9px] bg-secondary border border-border rounded px-1.5 py-0.5 text-muted-foreground font-mono">
                      AI
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ProjectInfoCard({ project, id, queryClient }: { project: Project; id: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [editing, setEditing] = useState(false);
  const [copied, setCopied] = useState(false);
  const handleCopyOverview = async () => {
    try {
      const md = await api.projects.getOverviewMarkdown(id);
      await navigator.clipboard.writeText(md);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Copy overview failed:", err);
    }
  };
  const [form, setForm] = useState({
    name: project.name,
    description: project.description ?? "",
    url: project.url ?? "",
    type: project.type as ProjectType,
    stage: project.stage as ProjectStage,
    tech_stack: JSON.parse(project.tech_stack || "[]") as string[],
  });

  const updateProject = useMutation({
    mutationFn: (data: typeof form) =>
      api.projects.update(id, {
        name: data.name,
        description: data.description || null,
        url: data.url || null,
        type: data.type,
        stage: data.stage,
        tech_stack: data.tech_stack,
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects", id] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setEditing(false);
    },
  });

  const handleCancel = () => {
    setForm({
      name: project.name,
      description: project.description ?? "",
      url: project.url ?? "",
      type: project.type,
      stage: project.stage,
      tech_stack: JSON.parse(project.tech_stack || "[]") as string[],
    });
    setEditing(false);
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Project Info</CardTitle>
          {!editing ? (
            <div className="flex gap-1">
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7"
                title={copied ? "Copied!" : "Copy project overview for AI"}
                onClick={handleCopyOverview}
              >
                {copied ? <Check size={13} className="text-success" /> : <Copy size={13} />}
              </Button>
              <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
                <Pencil size={13} />
              </Button>
            </div>
          ) : (
            <div className="flex gap-1">
              <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={handleCancel}>
                <X size={13} />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-success"
                disabled={updateProject.isPending}
                onClick={() => updateProject.mutate(form)}
              >
                <Check size={13} />
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {editing ? (
          <>
            <div>
              <Label className="text-xs text-muted-foreground">Name</Label>
              <Input value={form.name} onChange={(e) => setForm(f => ({ ...f, name: e.target.value }))} className="mt-1" />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Description</Label>
              <Textarea
                value={form.description}
                onChange={(e) => setForm(f => ({ ...f, description: e.target.value }))}
                className="mt-1 resize-none"
                rows={3}
              />
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">URL</Label>
              <Input value={form.url} onChange={(e) => setForm(f => ({ ...f, url: e.target.value }))} className="mt-1" placeholder="https://" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs text-muted-foreground">Stage</Label>
                <Select value={form.stage} onValueChange={(v) => setForm(f => ({ ...f, stage: v as ProjectStage }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {STAGES.map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Type</Label>
                <Select value={form.type} onValueChange={(v) => setForm(f => ({ ...f, type: v as ProjectType }))}>
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TYPES.map(t => <SelectItem key={t} value={t}>{t === "for-profit" ? "For-profit" : "Open-source"}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label className="text-xs text-muted-foreground">Tech Stack</Label>
              <div className="mt-1">
                <TagInput
                  value={form.tech_stack}
                  onChange={(tags) => setForm(f => ({ ...f, tech_stack: tags }))}
                  suggestions={[
                    "Anthropic", "Astro", "Bun", "Clerk", "Cloudflare", "Coolify",
                    "Deno", "Django", "Docker", "Drizzle", "Express", "FastAPI",
                    "Fastify", "Fly.io", "Go", "Hono", "LemonSqueezy", "MongoDB",
                    "Neon", "Netlify", "Next.js", "Node.js", "Ollama", "OpenAI",
                    "Paddle", "Plausible", "PostgreSQL", "PostHog", "Prisma", "Python",
                    "Railway", "React", "Redis", "Remix", "Resend", "Rust",
                    "SQLite", "Solid", "Stripe", "Supabase", "Svelte", "SvelteKit",
                    "Tailwind CSS", "Turso", "TypeScript", "Vercel", "Vite", "Vue",
                  ]}
                  placeholder="Add technology..."
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <p className="text-xs text-muted-foreground mb-0.5">Description</p>
              <p className="text-sm">{project.description || <span className="text-muted-foreground italic">No description</span>}</p>
            </div>
            {project.url && (
              <div>
                <p className="text-xs text-muted-foreground mb-0.5">URL</p>
                <a href={project.url} target="_blank" rel="noopener noreferrer"
                  className="text-sm font-mono text-info hover:underline">{project.url}</a>
              </div>
            )}
            <div className="flex gap-2">
              <StageBadge stage={project.stage} />
              <TypeBadge type={project.type} />
            </div>
            {JSON.parse(project.tech_stack || "[]").length > 0 && (
              <div className="flex flex-wrap gap-1.5">
                {(JSON.parse(project.tech_stack || "[]") as string[]).map((t: string) => (
                  <Badge key={t} variant="outline" className="text-xs">{t}</Badge>
                ))}
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

const CATEGORY_ORDER: ChecklistCategory[] = ["validation", "build", "infra", "legal", "marketing", "launch", "growth"];

const CATEGORY_LABELS: Record<ChecklistCategory, string> = {
  validation: "Validation & Research",
  build: "Build & MVP",
  infra: "Technical Infrastructure",
  legal: "Legal & Admin",
  marketing: "Marketing & Content",
  launch: "Launch Prep",
  growth: "Post-launch Growth",
};

const STAGE_ORDER: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];

function isStageRelevant(itemMinStage: ProjectStage | null, projectStage: ProjectStage): boolean {
  if (!itemMinStage) return true;
  const itemIdx = STAGE_ORDER.indexOf(itemMinStage);
  const projectIdx = STAGE_ORDER.indexOf(projectStage);
  return itemIdx <= projectIdx;
}

function LaunchChecklistCard({ id, projectStage, queryClient }: { id: string; projectStage: ProjectStage; queryClient: ReturnType<typeof useQueryClient> }) {
  const [newItemByCategory, setNewItemByCategory] = useState<Record<string, string>>({});

  const { data: items = [] } = useQuery({
    queryKey: ["checklist", id],
    queryFn: () => api.projects.checklist.list(id),
  });

  const completed = items.filter((i: LaunchChecklistItem) => i.completed === 1).length;
  const pct = items.length > 0 ? (completed / items.length) * 100 : 0;

  const toggleItem = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      api.projects.checklist.update(id, itemId, { completed }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", id] }),
  });

  const addItem = useMutation({
    mutationFn: (data: { item: string; category?: ChecklistCategory }) =>
      api.projects.checklist.create(id, data),
    onSuccess: (_, vars) => {
      queryClient.invalidateQueries({ queryKey: ["checklist", id] });
      setNewItemByCategory((prev) => ({ ...prev, [vars.category ?? "general"]: "" }));
    },
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api.projects.checklist.delete(id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", id] }),
  });

  const grouped: Record<string, LaunchChecklistItem[]> = {};
  for (const item of items) {
    const key = item.category ?? "general";
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(item);
  }

  const renderOrder: string[] = [];
  if (grouped["general"]?.length) renderOrder.push("general");
  for (const cat of CATEGORY_ORDER) {
    if (!renderOrder.includes(cat)) renderOrder.push(cat);
  }

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Launch Checklist</CardTitle>
          <span className="text-xs text-muted-foreground">{completed}/{items.length}</span>
        </div>
        <Progress value={pct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-4">
        {renderOrder.map((catKey) => {
          const categoryItems = grouped[catKey] ?? [];
          const catLabel = catKey === "general" ? "General" : CATEGORY_LABELS[catKey as ChecklistCategory];
          const catCompleted = categoryItems.filter((i) => i.completed === 1).length;
          const newValue = newItemByCategory[catKey] ?? "";

          return (
            <div key={catKey} className="space-y-1.5">
              <div className="flex items-center justify-between mb-1">
                <h4 className="text-[11px] uppercase tracking-wider text-muted-foreground font-medium">
                  {catLabel}
                </h4>
                {categoryItems.length > 0 && (
                  <span className="text-[10px] text-muted-foreground tabular-nums">
                    {catCompleted}/{categoryItems.length}
                  </span>
                )}
              </div>
              {categoryItems.map((item: LaunchChecklistItem) => {
                const relevant = isStageRelevant(item.min_stage, projectStage);
                return (
                  <div key={item.id} className={cn("flex items-center gap-2 group", !relevant && "opacity-50")}>
                    <Checkbox
                      id={`chk-${item.id}`}
                      checked={item.completed === 1}
                      onCheckedChange={(v) => toggleItem.mutate({ itemId: item.id, completed: !!v })}
                    />
                    <label
                      htmlFor={`chk-${item.id}`}
                      className={cn(
                        "text-sm flex-1 cursor-pointer",
                        item.completed === 1 && "line-through text-muted-foreground"
                      )}
                    >
                      {item.item}
                    </label>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                      onClick={() => deleteItem.mutate(item.id)}
                    >
                      <Trash2 size={11} />
                    </Button>
                  </div>
                );
              })}
              {catKey !== "general" && (
                <div className="flex gap-2 pt-1">
                  <Input
                    value={newValue}
                    onChange={(e) => setNewItemByCategory((prev) => ({ ...prev, [catKey]: e.target.value }))}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && newValue.trim()) {
                        addItem.mutate({ item: newValue.trim(), category: catKey as ChecklistCategory });
                      }
                    }}
                    placeholder={`Add to ${catLabel}...`}
                    className="text-xs h-8"
                  />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 text-xs"
                    disabled={!newValue.trim() || addItem.isPending}
                    onClick={() => addItem.mutate({ item: newValue.trim(), category: catKey as ChecklistCategory })}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}

function LinksHubCard({ project: _project, id, queryClient }: { project: Project; id: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [label, setLabel] = useState("");
  const [url, setUrl] = useState("");

  const { data: links = [] } = useQuery({
    queryKey: ["project-links", id],
    queryFn: () => api.projects.links.list(id),
  });

  const addLink = useMutation({
    mutationFn: () => api.projects.links.create(id, { label, url }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["project-links", id] });
      setLabel("");
      setUrl("");
    },
  });

  const deleteLink = useMutation({
    mutationFn: (linkId: string) => api.projects.links.delete(id, linkId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["project-links", id] }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">Links</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Preset chips */}
        <div className="flex flex-wrap gap-1.5">
          {LINK_PRESETS.map((preset) => (
            <Badge
              key={preset}
              variant="outline"
              className="cursor-pointer hover:bg-secondary text-xs"
              onClick={() => setLabel(preset)}
            >
              {preset}
            </Badge>
          ))}
        </div>

        {/* Add form */}
        <div className="space-y-1.5">
          <Input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Label (e.g. GitHub)"
            className="text-sm"
          />
          <div className="flex gap-2">
            <Input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://"
              className="text-sm flex-1"
              onKeyDown={(e) => { if (e.key === "Enter" && label && url) addLink.mutate(); }}
            />
            <Button
              variant="secondary"
              size="sm"
              disabled={!label || !url || addLink.isPending}
              onClick={() => addLink.mutate()}
            >
              Add
            </Button>
          </div>
        </div>

        {/* Existing links */}
        {links.length > 0 && (
          <>
            <Separator />
            <div className="space-y-1">
              {links.map((link: ProjectLink) => (
                <div key={link.id} className="flex items-center gap-2 group py-0.5">
                  <ExternalLink size={13} className="text-muted-foreground shrink-0" />
                  <a
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm flex-1 truncate hover:text-foreground text-muted-foreground"
                  >
                    {link.label}
                  </a>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 opacity-0 group-hover:opacity-100 hover:text-destructive"
                    onClick={() => deleteLink.mutate(link.id)}
                  >
                    <X size={11} />
                  </Button>
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function DangerZoneCard({ project, id, queryClient, navigate }: { project: Project; id: string; queryClient: ReturnType<typeof useQueryClient>; navigate: ReturnType<typeof useNavigate> }) {
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState("");

  const deleteProject = useMutation({
    mutationFn: () => api.projects.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate("/projects");
    },
  });

  return (
    <>
      <Card className="border-destructive/20">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium text-destructive">Danger Zone</CardTitle>
        </CardHeader>
        <CardContent>
          <Button variant="destructive" size="sm" className="w-full" onClick={() => setOpen(true)}>
            Delete Project
          </Button>
        </CardContent>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete "{project.name}"?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This will permanently delete the project and all associated data (checklist, links, compliance, notes, files metadata). This cannot be undone.
          </p>
          <div className="space-y-1.5">
            <Label className="text-xs">Type the project name to confirm</Label>
            <Input
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              placeholder={project.name}
            />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => { setOpen(false); setConfirm(""); }}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={confirm !== project.name || deleteProject.isPending}
              onClick={() => deleteProject.mutate()}
            >
              Delete permanently
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function GitHubTab({ projectId, githubData }: { projectId: string; githubData: GitHubRepoData | undefined }) {
  const queryClient = useQueryClient();
  const [repoInput, setRepoInput] = useState(githubData?.repo ?? "");

  const setRepo = useMutation({
    mutationFn: (repo: string) => api.github.setRepo(projectId, repo || null),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["github", projectId] });
      queryClient.invalidateQueries({ queryKey: ["projects", projectId] });
    },
  });

  if (!githubData?.connected) {
    return (
      <div className="space-y-4">
        <h3 className="text-sm font-medium mb-2">Connect GitHub Repository</h3>
        <div className="flex gap-2">
          <Input
            value={repoInput}
            onChange={(e) => setRepoInput(e.target.value)}
            placeholder="owner/repo"
            className="max-w-xs"
          />
          <Button
            size="sm"
            onClick={() => setRepo.mutate(repoInput)}
            disabled={!repoInput.trim() || setRepo.isPending}
          >
            Connect
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">Enter the GitHub repo slug, e.g. "myuser/myproject"</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Github size={14} />
          <a href={`https://github.com/${githubData.repo}`} target="_blank" rel="noopener noreferrer" className="hover:text-foreground transition-colors">
            {githubData.repo}
          </a>
        </div>
        <Button variant="ghost" size="sm" onClick={() => setRepo.mutate("")} className="text-xs text-muted-foreground">
          Disconnect
        </Button>
      </div>

      {githubData.error && (
        <p className="text-xs text-destructive">{githubData.error}</p>
      )}

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitCommit size={14} />
            Recent Commits
          </CardTitle>
        </CardHeader>
        <CardContent>
          {githubData.commits.length === 0 ? (
            <p className="text-xs text-muted-foreground">No recent commits.</p>
          ) : (
            <div className="space-y-2">
              {githubData.commits.map((c) => (
                <div key={c.sha} className="flex items-start gap-2">
                  <code className="text-[11px] text-muted-foreground font-mono shrink-0">{c.sha}</code>
                  <a href={c.url} target="_blank" rel="noopener noreferrer" className="text-[13px] hover:text-info transition-colors line-clamp-1 flex-1">
                    {c.message}
                  </a>
                  <span className="text-[11px] text-muted-foreground shrink-0">{c.author}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <GitPullRequest size={14} />
            Pull Requests
          </CardTitle>
        </CardHeader>
        <CardContent>
          {githubData.prs.length === 0 ? (
            <p className="text-xs text-muted-foreground">No pull requests.</p>
          ) : (
            <div className="space-y-2">
              {githubData.prs.map((pr) => (
                <div key={pr.number} className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", pr.state === "open" ? "border-success/30 text-success" : "border-purple/30 text-purple")}>
                    {pr.state}
                  </Badge>
                  <a href={pr.url} target="_blank" rel="noopener noreferrer" className="text-[13px] hover:text-info transition-colors line-clamp-1 flex-1">
                    #{pr.number} {pr.title}
                  </a>
                  <span className="text-[11px] text-muted-foreground shrink-0">{pr.author}</span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-medium flex items-center gap-2">
            <CircleDot size={14} />
            Issues
          </CardTitle>
        </CardHeader>
        <CardContent>
          {githubData.issues.length === 0 ? (
            <p className="text-xs text-muted-foreground">No issues.</p>
          ) : (
            <div className="space-y-2">
              {githubData.issues.map((issue) => (
                <div key={issue.number} className="flex items-center gap-2">
                  <Badge variant="outline" className={cn("text-[10px]", issue.state === "open" ? "border-success/30 text-success" : "border-muted-foreground/30")}>
                    {issue.state}
                  </Badge>
                  <a href={issue.url} target="_blank" rel="noopener noreferrer" className="text-[13px] hover:text-info transition-colors line-clamp-1 flex-1">
                    #{issue.number} {issue.title}
                  </a>
                  {issue.labels.slice(0, 2).map((l) => (
                    <Badge key={l} variant="outline" className="text-[9px] px-1">{l}</Badge>
                  ))}
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
