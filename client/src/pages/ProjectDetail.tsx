import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ChevronRight, ExternalLink, Pencil, Plus, RefreshCw, Trash2, X, Check,
} from "lucide-react";
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
import { StageBadge, TypeBadge, TagInput, PingDot } from "@/components/app-ui";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import type { Project, ProjectLink, LaunchChecklistItem, TechDebtItem, ProjectStage, ProjectType } from "@/lib/types";

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
    <div className="flex flex-col min-h-screen">
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
          <h1 className="text-xl font-semibold tracking-tight">{project.name}</h1>
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
              <div className="text-muted-foreground p-4">Revenue tab — coming in Task 7</div>
            </TabsContent>
          )}
          <TabsContent value="compliance" className="mt-0">
            <div className="text-muted-foreground p-4">Compliance tab — coming in Task 8</div>
          </TabsContent>
          <TabsContent value="buildlog" className="mt-0">
            <div className="text-muted-foreground p-4">Build Log tab — coming in Task 9</div>
          </TabsContent>
          <TabsContent value="files" className="mt-0">
            <div className="text-muted-foreground p-4">Files tab — coming in Task 11</div>
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
            <Button type="submit" variant="secondary" size="sm">Add</Button>
          </form>
        </CardContent>
      </Card>
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
