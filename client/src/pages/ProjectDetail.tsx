import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen, ChevronRight, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X, Check, Star,
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
import type { Project, ProjectLink, LaunchChecklistItem, TechDebtItem, MrrEntry, Goal, ProjectStage, ProjectType, ProjectCountry, LegalItem, Note } from "@/lib/types";

const STAGES: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];
const TYPES: ProjectType[] = ["for-profit", "open-source"];

// Preset link labels for the Links Hub
const LINK_PRESETS = ["GitHub", "Vercel", "Stripe", "Supabase", "Railway", "Linear", "Figma", "Notion", "Analytics", "Production"];

export default function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState("overview");

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

  if (isLoading) return <div className="p-8 text-muted-foreground">Loading...</div>;
  if (!project) return <div className="p-8 text-destructive">Project not found.</div>;

  const TABS = [
    { value: "overview", label: "Overview" },
    { value: "health", label: "Health" },
    ...(project.type === "for-profit" ? [{ value: "revenue", label: "Revenue" }] : []),
    { value: "compliance", label: "Compliance" },
    { value: "buildlog", label: "Build Log" },
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
        <LaunchChecklistCard id={id} queryClient={queryClient} />
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

  const { data: techDebt = [] } = useQuery({
    queryKey: ["tech-debt", id],
    queryFn: () => api.projects.techDebt.list(id),
  });

  const addDebt = useMutation({
    mutationFn: (note: string) => api.projects.techDebt.create(id, note),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["tech-debt", id] });
      setDebtNote("");
    },
  });

  const updateDebt = useMutation({
    mutationFn: ({ debtId, resolved }: { debtId: string; resolved: boolean }) =>
      api.projects.techDebt.update(id, debtId, resolved),
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
    if (debtNote.trim()) addDebt.mutate(debtNote.trim());
  };

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
            <span className="font-mono text-sm">{project.url ?? "No URL set"}</span>
            {pingLatency !== null && (
              <span className={cn("text-xs", pingStatus === "up" ? "text-success" : "text-destructive")}>
                {pingStatus === "up" ? `${pingLatency}ms` : "unreachable"}
              </span>
            )}
            <Button
              variant="secondary"
              size="sm"
              className="ml-auto gap-1.5"
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
        <CardHeader>
          <CardTitle className="text-sm font-medium">Tech Debt</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {techDebt.map((item: TechDebtItem) => (
            <div key={item.id} className={cn(
              "flex items-start gap-2 p-2 rounded border",
              item.resolved ? "border-success/20" : "border-warning/20"
            )}>
              <Checkbox
                checked={item.resolved === 1}
                onCheckedChange={(v) => updateDebt.mutate({ debtId: item.id, resolved: !!v })}
              />
              <span className={cn("text-sm flex-1", item.resolved && "line-through text-muted-foreground")}>
                {item.note}
              </span>
              <Button variant="ghost" size="icon" className="h-6 w-6 text-muted-foreground hover:text-destructive"
                onClick={() => deleteDebt.mutate(item.id)}>
                <Trash2 size={12} />
              </Button>
            </div>
          ))}
          <form onSubmit={handleAddDebt} className="flex gap-2 mt-3">
            <Input value={debtNote} onChange={e => setDebtNote(e.target.value)} placeholder="Add tech debt item..." />
            <Button type="submit" variant="secondary" size="sm" disabled={!debtNote.trim() || addDebt.isPending}>Add</Button>
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
  { code: "EU", name: "European Union" },
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

function ComplianceTab({ id, queryClient }: { id: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [selectedCountry, setSelectedCountry] = useState("");
  const [customItemInputs, setCustomItemInputs] = useState<Record<string, string>>({});
  const [showCustomForm, setShowCustomForm] = useState<Record<string, boolean>>({});

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
      api.projects.legal.update(id, itemId, completed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["legal", id] }),
  });

  const addLegalItem = useMutation({
    mutationFn: (data: { country_code: string; item: string }) =>
      api.projects.legal.create(id, data),
    onSuccess: (_data, variables) => {
      queryClient.invalidateQueries({ queryKey: ["legal", id] });
      setCustomItemInputs(prev => ({ ...prev, [variables.country_code]: "" }));
      setShowCustomForm(prev => ({ ...prev, [variables.country_code]: false }));
    },
  });

  const deleteLegal = useMutation({
    mutationFn: (itemId: string) => api.projects.legal.delete(id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["legal", id] }),
  });

  const activeCodes = countries.map((c: ProjectCountry) => c.country_code);
  const availableCountries = COUNTRIES.filter(c => !activeCodes.includes(c.code));

  const handleAddCountry = () => {
    const country = COUNTRIES.find(c => c.code === selectedCountry);
    if (country) addCountry.mutate({ country_code: country.code, country_name: country.name });
  };

  // Group legal items by country_code
  const itemsByCountry: Record<string, LegalItem[]> = {};
  for (const item of legalItems) {
    if (!itemsByCountry[item.country_code]) itemsByCountry[item.country_code] = [];
    itemsByCountry[item.country_code].push(item);
  }

  return (
    <div className="space-y-4">
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

      {/* Active country chips */}
      {countries.length > 0 && (
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
        </div>
      )}

      {/* Per-country legal cards */}
      {countries.map((c: ProjectCountry) => {
        const items = itemsByCountry[c.country_code] ?? [];
        const done = items.filter(i => i.completed === 1).length;
        const total = items.length;
        const pct = total > 0 ? (done / total) * 100 : 0;

        return (
          <Card key={c.id}>
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm font-medium">
                  {countryFlag(c.country_code)} {c.country_name}
                </CardTitle>
                <span className="text-xs text-muted-foreground">{done}/{total}</span>
              </div>
              <Progress value={pct} className="h-2 mt-2" />
            </CardHeader>
            <CardContent className="space-y-1.5">
              {items.map((item: LegalItem) => (
                <div key={item.id} className="flex items-center gap-2 group">
                  <Checkbox
                    id={`legal-${item.id}`}
                    checked={item.completed === 1}
                    onCheckedChange={(v) => toggleLegal.mutate({ itemId: item.id, completed: !!v })}
                  />
                  <label
                    htmlFor={`legal-${item.id}`}
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
                    onClick={() => deleteLegal.mutate(item.id)}
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
              ))}

              {/* Add custom item */}
              {showCustomForm[c.country_code] ? (
                <div className="flex gap-2 pt-2">
                  <Input
                    value={customItemInputs[c.country_code] ?? ""}
                    onChange={e => setCustomItemInputs(prev => ({ ...prev, [c.country_code]: e.target.value }))}
                    onKeyDown={e => {
                      if (e.key === "Enter" && (customItemInputs[c.country_code] ?? "").trim()) {
                        addLegalItem.mutate({ country_code: c.country_code, item: customItemInputs[c.country_code].trim() });
                      }
                      if (e.key === "Escape") {
                        setShowCustomForm(prev => ({ ...prev, [c.country_code]: false }));
                        setCustomItemInputs(prev => ({ ...prev, [c.country_code]: "" }));
                      }
                    }}
                    placeholder="Custom legal item..."
                    className="text-sm"
                    autoFocus
                  />
                  <Button
                    variant="secondary"
                    size="sm"
                    disabled={!(customItemInputs[c.country_code] ?? "").trim() || addLegalItem.isPending}
                    onClick={() => addLegalItem.mutate({ country_code: c.country_code, item: customItemInputs[c.country_code].trim() })}
                  >
                    Add
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setShowCustomForm(prev => ({ ...prev, [c.country_code]: false }));
                      setCustomItemInputs(prev => ({ ...prev, [c.country_code]: "" }));
                    }}
                  >
                    <X size={13} />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs text-muted-foreground mt-1 gap-1"
                  onClick={() => setShowCustomForm(prev => ({ ...prev, [c.country_code]: true }))}
                >
                  <Plus size={12} />
                  Add custom item
                </Button>
              )}
            </CardContent>
          </Card>
        );
      })}

      {countries.length === 0 && (
        <div className="text-sm text-muted-foreground text-center py-8">
          No countries added yet. Select a country above to get started with compliance tracking.
        </div>
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

  const buildLogEntries = (allNotes.data ?? []).filter((n: Note) => n.is_build_log === 1);

  return (
    <div className="space-y-4 max-w-2xl">
      {/* Composer card */}
      <Card>
        <CardContent className="p-4 space-y-3">
          <Textarea
            value={noteContent}
            onChange={(e) => setNoteContent(e.target.value)}
            placeholder="What did you build today?"
            className="min-h-[100px] resize-none"
          />
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
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
              disabled={!noteContent.trim() || addNote.isPending}
              onClick={() => addNote.mutate({ content: noteContent, is_build_log: isBuildLog })}
            >
              Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Build log feed */}
      {buildLogEntries.length === 0 ? (
        <Empty
          icon={<BookOpen size={32} />}
          title="No build log entries yet"
          sub="Toggle 'Build log entry' when saving a note to add it here."
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
                <p className="text-xs font-mono text-muted-foreground mt-2">
                  {new Date(entry.created_at).toLocaleString()}
                </p>
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
            <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setEditing(true)}>
              <Pencil size={13} />
            </Button>
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
                  suggestions={["React", "Bun", "TypeScript", "PostgreSQL", "Tailwind CSS", "Next.js", "Hono", "SQLite", "Docker", "Stripe"]}
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

function LaunchChecklistCard({ id, queryClient }: { id: string; queryClient: ReturnType<typeof useQueryClient> }) {
  const [newItem, setNewItem] = useState("");

  const { data: items = [] } = useQuery({
    queryKey: ["checklist", id],
    queryFn: () => api.projects.checklist.list(id),
  });

  const completed = items.filter((i: LaunchChecklistItem) => i.completed === 1).length;
  const pct = items.length > 0 ? (completed / items.length) * 100 : 0;

  const toggleItem = useMutation({
    mutationFn: ({ itemId, completed }: { itemId: string; completed: boolean }) =>
      api.projects.checklist.update(id, itemId, completed),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", id] }),
  });

  const addItem = useMutation({
    mutationFn: (item: string) => api.projects.checklist.create(id, item),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["checklist", id] });
      setNewItem("");
    },
  });

  const deleteItem = useMutation({
    mutationFn: (itemId: string) => api.projects.checklist.delete(id, itemId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["checklist", id] }),
  });

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-medium">Launch Checklist</CardTitle>
          <span className="text-xs text-muted-foreground">{completed}/{items.length}</span>
        </div>
        <Progress value={pct} className="h-2 mt-2" />
      </CardHeader>
      <CardContent className="space-y-1.5">
        {items.map((item: LaunchChecklistItem) => (
          <div key={item.id} className="flex items-center gap-2 group">
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
        ))}
        {/* Add item */}
        <div className="flex gap-2 pt-2">
          <Input
            value={newItem}
            onChange={(e) => setNewItem(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter" && newItem.trim()) { addItem.mutate(newItem.trim()); } }}
            placeholder="Add checklist item..."
            className="text-sm"
          />
          <Button
            variant="secondary"
            size="sm"
            disabled={!newItem.trim() || addItem.isPending}
            onClick={() => addItem.mutate(newItem.trim())}
          >
            <Plus size={13} />
          </Button>
        </div>
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
