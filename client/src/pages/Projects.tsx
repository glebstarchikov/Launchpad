import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { FolderKanban, Plus, Search } from "lucide-react";
import { api } from "@/lib/api";
import type { Project } from "@/lib/types";
import type { ProjectStage, ProjectType } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { StageBadge, TypeBadge, Empty, STAGE_META, TagInput } from "@/components/app-ui";

const TECH_SUGGESTIONS = [
  "React", "Vue", "Svelte", "Next.js", "Nuxt", "SvelteKit",
  "Node.js", "Bun", "Deno", "Express", "Hono", "Fastify",
  "TypeScript", "JavaScript", "Python", "Go", "Rust",
  "PostgreSQL", "MySQL", "SQLite", "MongoDB", "Redis",
  "Tailwind CSS", "shadcn/ui", "Chakra UI", "MUI",
  "Stripe", "Supabase", "Firebase", "Vercel", "Railway",
  "Docker", "AWS", "Cloudflare", "Fly.io",
];

const ALL_STAGES: ProjectStage[] = ["idea", "building", "beta", "live", "growing", "sunset"];
const ALL_TYPES: { value: ProjectType; label: string }[] = [
  { value: "for-profit", label: "For-profit" },
  { value: "open-source", label: "Open-source" },
];

interface NewProjectForm {
  name: string;
  description: string;
  url: string;
  type: ProjectType;
  stage: ProjectStage;
  tech_stack: string[];
}

const DEFAULT_FORM: NewProjectForm = {
  name: "",
  description: "",
  url: "",
  type: "for-profit",
  stage: "idea",
  tech_stack: [],
};

export default function Projects() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [stageFilter, setStageFilter] = useState<ProjectStage | null>(null);
  const [typeFilter, setTypeFilter] = useState<ProjectType | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState<NewProjectForm>(DEFAULT_FORM);

  const { data: projects = [], isLoading } = useQuery({
    queryKey: ["projects"],
    queryFn: api.projects.list,
  });

  const createProject = useMutation({
    mutationFn: api.projects.create,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setDialogOpen(false);
      setForm(DEFAULT_FORM);
    },
  });

  const filtered = projects.filter((p) => {
    const matchesSearch =
      !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.description ?? "").toLowerCase().includes(search.toLowerCase());
    const matchesStage = !stageFilter || p.stage === stageFilter;
    const matchesType = !typeFilter || p.type === typeFilter;
    return matchesSearch && matchesStage && matchesType;
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name.trim()) return;
    createProject.mutate({
      name: form.name.trim(),
      description: form.description || undefined,
      url: form.url || undefined,
      type: form.type,
      stage: form.stage,
      tech_stack: form.tech_stack,
    });
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-foreground">Projects</h1>
        <Button onClick={() => setDialogOpen(true)}>
          <Plus size={16} className="mr-2" />
          New Project
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search projects..."
            className="pl-9 w-[220px]"
          />
        </div>

        {/* Stage pills */}
        <div className="flex items-center gap-1.5">
          {ALL_STAGES.map((stage) => (
            <button
              key={stage}
              type="button"
              onClick={() => setStageFilter(stageFilter === stage ? null : stage)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                stageFilter === stage
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40"
              }`}
            >
              {STAGE_META[stage].label}
            </button>
          ))}
        </div>

        {/* Type pills */}
        <div className="flex items-center gap-1.5">
          {ALL_TYPES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setTypeFilter(typeFilter === value ? null : value)}
              className={`px-2.5 py-1 rounded-full text-xs font-medium border transition-colors ${
                typeFilter === value
                  ? "bg-foreground text-background border-foreground"
                  : "bg-background text-muted-foreground border-border hover:border-foreground/40"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid */}
      {isLoading ? (
        <div className="text-muted-foreground text-sm">Loading...</div>
      ) : projects.length === 0 ? (
        <Empty
          icon={<FolderKanban size={40} />}
          title="No projects yet"
          sub="Create your first project to get started."
          action={
            <Button size="sm" onClick={() => setDialogOpen(true)}>
              <Plus size={14} className="mr-1" />
              New Project
            </Button>
          }
        />
      ) : filtered.length === 0 ? (
        <Empty
          icon={<FolderKanban size={40} />}
          title="No matching projects"
          sub="Try adjusting your search or filters."
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onClick={() => navigate(`/projects/${project.id}`)}
            />
          ))}
        </div>
      )}

      {/* New Project Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>New Project</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="name">Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="My Awesome SaaS"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="description">Description</Label>
              <Input
                id="description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                placeholder="What does it do?"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="url">URL</Label>
              <Input
                id="url"
                value={form.url}
                onChange={(e) => setForm((f) => ({ ...f, url: e.target.value }))}
                placeholder="https://myapp.com"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <Label>Stage</Label>
                <Select
                  value={form.stage}
                  onValueChange={(v) => setForm((f) => ({ ...f, stage: v as ProjectStage }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_STAGES.map((stage) => (
                      <SelectItem key={stage} value={stage}>
                        {STAGE_META[stage].label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label>Type</Label>
                <Select
                  value={form.type}
                  onValueChange={(v) => setForm((f) => ({ ...f, type: v as ProjectType }))}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_TYPES.map(({ value, label }) => (
                      <SelectItem key={value} value={value}>
                        {label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-1.5">
              <Label>Tech Stack</Label>
              <TagInput
                value={form.tech_stack}
                onChange={(tags) => setForm((f) => ({ ...f, tech_stack: tags }))}
                suggestions={TECH_SUGGESTIONS}
                placeholder="Add technologies..."
              />
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => { setDialogOpen(false); setForm(DEFAULT_FORM); }}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={createProject.isPending || !form.name.trim()}>
                {createProject.isPending ? "Creating..." : "Create Project"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function ProjectCard({ project, onClick }: { project: Project; onClick: () => void }) {
  // tech_stack is stored as JSON string in DB
  const techStack: string[] = (() => {
    try {
      return JSON.parse(project.tech_stack) as string[];
    } catch {
      return [];
    }
  })();

  return (
    <Card
      className="hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <CardContent className="p-4 flex flex-col gap-3">
        {/* Name + description */}
        <div>
          <h3 className="font-semibold text-foreground">{project.name}</h3>
          {project.description && (
            <p className="text-sm text-muted-foreground truncate mt-0.5">{project.description}</p>
          )}
        </div>

        {/* Tech stack chips */}
        {techStack.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {techStack.map((tech) => (
              <Badge key={tech} variant="outline" className="text-xs">
                {tech}
              </Badge>
            ))}
          </div>
        )}

        {/* URL */}
        {project.url && (
          <p className="font-mono text-xs text-muted-foreground truncate">{project.url}</p>
        )}

        {/* Badges */}
        <div className="flex items-center gap-2 mt-auto">
          <StageBadge stage={project.stage} />
          <TypeBadge type={project.type} />
        </div>
      </CardContent>
    </Card>
  );
}
