import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Lightbulb, Pencil, Trash2, Rocket, X } from "lucide-react";
import { api } from "@/lib/api";
import type { Idea } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Empty } from "@/components/app-ui";

export default function Ideas() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const [selected, setSelected] = useState<Idea | null>(null);
  const [composing, setComposing] = useState(false);

  const { data: ideas = [] } = useQuery({
    queryKey: ["ideas"],
    queryFn: api.ideas.list,
  });

  const createIdea = useMutation({
    mutationFn: api.ideas.create,
    onSuccess: (newIdea) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setComposing(false);
      setSelected(newIdea);
    },
  });

  const updateIdea = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { title: string; body: string } }) =>
      api.ideas.update(id, data),
    onSuccess: (updated) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      setSelected(updated);
    },
  });

  const deleteIdea = useMutation({
    mutationFn: api.ideas.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      setSelected(null);
    },
  });

  const promoteIdea = useMutation({
    mutationFn: api.ideas.promote,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["ideas"] });
      queryClient.invalidateQueries({ queryKey: ["projects"] });
      queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/projects/${result.project.id}`);
    },
  });

  const handleSave = (title: string, body: string) => {
    if (!title.trim()) return;
    createIdea.mutate({ title: title.trim(), body: body.trim() });
  };

  const handleUpdate = (id: string, title: string, body: string) => {
    if (!title.trim()) return;
    updateIdea.mutate({ id, data: { title: title.trim(), body: body.trim() } });
  };

  const handleDelete = (id: string) => {
    if (!window.confirm("Delete this idea? This cannot be undone.")) return;
    deleteIdea.mutate(id);
  };

  const handlePromote = (id: string) => {
    if (!window.confirm("Promote this idea to a project? A new project will be created.")) return;
    promoteIdea.mutate(id);
  };

  return (
    <div className="flex h-[calc(100vh-0px)]">
      {/* Left pane */}
      <div className="w-[280px] border-r border-border flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="font-semibold text-sm">Ideas</h1>
          <Button size="sm" onClick={() => { setSelected(null); setComposing(true); }}>
            New
          </Button>
        </div>
        <ScrollArea className="flex-1">
          {ideas.map((idea) => (
            <button
              key={idea.id}
              onClick={() => { setSelected(idea); setComposing(false); }}
              className={cn(
                "w-full text-left p-3 border-b border-border hover:bg-secondary/50 transition-colors",
                selected?.id === idea.id && "bg-secondary ring-1 ring-inset ring-border"
              )}
            >
              <p className="text-sm font-medium truncate">{idea.title}</p>
              <div className="flex items-center gap-2 mt-1">
                <Badge
                  variant="outline"
                  className={cn(
                    "text-xs",
                    idea.status === "promoted"
                      ? "border-success/30 text-success"
                      : "border-border text-muted-foreground"
                  )}
                >
                  {idea.status}
                </Badge>
                <span className="text-xs text-muted-foreground">
                  {new Date(idea.created_at).toLocaleDateString()}
                </span>
              </div>
            </button>
          ))}
          {ideas.length === 0 && (
            <Empty icon={<Lightbulb size={24} />} title="No ideas yet" sub="Capture your first idea." />
          )}
        </ScrollArea>
      </div>

      {/* Right pane */}
      <div className="flex-1 p-6 overflow-auto">
        {composing ? (
          <IdeaComposer
            onSave={handleSave}
            onCancel={() => setComposing(false)}
            isPending={createIdea.isPending}
          />
        ) : selected ? (
          <IdeaDetail
            idea={selected}
            onUpdate={handleUpdate}
            onDelete={handleDelete}
            onPromote={handlePromote}
            isUpdating={updateIdea.isPending}
            isPromoting={promoteIdea.isPending}
          />
        ) : (
          <div className="h-full flex items-center justify-center">
            <Empty icon={<Lightbulb size={32} />} title="Select an idea" sub="Or create a new one." />
          </div>
        )}
      </div>
    </div>
  );
}

function IdeaComposer({
  onSave,
  onCancel,
  isPending,
}: {
  onSave: (title: string, body: string) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");

  return (
    <div className="max-w-2xl">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-lg font-semibold text-foreground">New Idea</h2>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X size={16} />
        </Button>
      </div>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Idea title..."
        className="text-lg font-semibold border-0 px-0 shadow-none focus-visible:ring-0 mb-4"
        autoFocus
      />
      <Textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="Describe the idea..."
        className="min-h-[200px] border-0 px-0 shadow-none focus-visible:ring-0 resize-none"
      />
      <div className="flex items-center gap-2 mt-6">
        <Button onClick={() => onSave(title, body)} disabled={!title.trim() || isPending}>
          {isPending ? "Saving..." : "Save Idea"}
        </Button>
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
      </div>
    </div>
  );
}

function IdeaDetail({
  idea,
  onUpdate,
  onDelete,
  onPromote,
  isUpdating,
  isPromoting,
}: {
  idea: Idea;
  onUpdate: (id: string, title: string, body: string) => void;
  onDelete: (id: string) => void;
  onPromote: (id: string) => void;
  isUpdating: boolean;
  isPromoting: boolean;
}) {
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState(idea.title);
  const [body, setBody] = useState(idea.body);

  // Reset local state when idea changes
  const [prevId, setPrevId] = useState(idea.id);
  if (idea.id !== prevId) {
    setPrevId(idea.id);
    setTitle(idea.title);
    setBody(idea.body);
    setEditing(false);
  }

  const handleSave = () => {
    onUpdate(idea.id, title, body);
    setEditing(false);
  };

  return (
    <div className="max-w-2xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div className="flex-1 min-w-0">
          {editing ? (
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="text-lg font-semibold border-0 px-0 shadow-none focus-visible:ring-0"
              autoFocus
            />
          ) : (
            <h2 className="text-lg font-semibold text-foreground">{idea.title}</h2>
          )}
          <div className="flex items-center gap-2 mt-2">
            <Badge
              variant="outline"
              className={cn(
                "text-xs",
                idea.status === "promoted"
                  ? "border-success/30 text-success"
                  : "border-border text-muted-foreground"
              )}
            >
              {idea.status}
            </Badge>
            <span className="text-xs text-muted-foreground">
              Created {new Date(idea.created_at).toLocaleDateString()}
            </span>
            {idea.updated_at !== idea.created_at && (
              <span className="text-xs text-muted-foreground">
                &middot; Updated {new Date(idea.updated_at).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      {editing ? (
        <Textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          className="min-h-[200px] border-0 px-0 shadow-none focus-visible:ring-0 resize-none"
        />
      ) : (
        <div className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">
          {idea.body || (
            <span className="text-muted-foreground italic">No description.</span>
          )}
        </div>
      )}

      {/* Footer actions */}
      <div className="flex items-center gap-2 mt-8 pt-4 border-t border-border">
        {editing ? (
          <>
            <Button size="sm" onClick={handleSave} disabled={!title.trim() || isUpdating}>
              {isUpdating ? "Saving..." : "Save"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setTitle(idea.title);
                setBody(idea.body);
                setEditing(false);
              }}
            >
              Cancel
            </Button>
          </>
        ) : (
          <>
            <Button size="sm" variant="ghost" onClick={() => setEditing(true)}>
              <Pencil size={14} className="mr-1" />
              Edit
            </Button>
            <Button
              size="sm"
              variant="secondary"
              disabled={idea.status === "promoted" || isPromoting}
              onClick={() => onPromote(idea.id)}
            >
              <Rocket size={14} className="mr-1" />
              {isPromoting ? "Promoting..." : idea.status === "promoted" ? "Promoted" : "Promote to Project"}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="text-destructive hover:text-destructive ml-auto"
              onClick={() => onDelete(idea.id)}
            >
              <Trash2 size={14} className="mr-1" />
              Delete
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
