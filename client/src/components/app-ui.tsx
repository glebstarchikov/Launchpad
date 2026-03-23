import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Command, CommandItem, CommandList } from "@/components/ui/command";
import { X } from "lucide-react";
import { useState } from "react";
import { cn } from "@/lib/utils";
import type { ProjectStage, ProjectType } from "@/lib/types";

export type { ProjectStage, ProjectType };

export const STAGE_META: Record<ProjectStage, { label: string; className: string }> = {
  idea:     { label: "Idea",     className: "bg-muted text-muted-foreground border-border" },
  building: { label: "Building", className: "bg-info/10 text-info border-info/20" },
  beta:     { label: "Beta",     className: "bg-purple/10 text-purple border-purple/20" },
  live:     { label: "Live",     className: "bg-success/10 text-success border-success/20" },
  growing:  { label: "Growing",  className: "bg-warning/10 text-warning border-warning/20" },
  sunset:   { label: "Sunset",   className: "bg-muted text-muted-foreground border-border opacity-60" },
};

export function StageBadge({ stage }: { stage: ProjectStage }) {
  const meta = STAGE_META[stage];
  return (
    <Badge variant="outline" className={cn("text-xs font-medium", meta.className)}>
      {meta.label}
    </Badge>
  );
}

export function TypeBadge({ type }: { type: ProjectType }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "text-xs font-medium",
        type === "for-profit"
          ? "bg-warning/10 text-warning border-warning/20"
          : "bg-purple/10 text-purple border-purple/20"
      )}
    >
      {type === "for-profit" ? "For-profit" : "Open-source"}
    </Badge>
  );
}

export function PingDot({ status }: { status: "up" | "down" | null }) {
  return (
    <span
      className={cn(
        "inline-block w-2 h-2 rounded-full shrink-0",
        status === "up" && "bg-success animate-pulse",
        status === "down" && "bg-destructive",
        status === null && "bg-muted-foreground"
      )}
    />
  );
}

interface EmptyProps {
  icon: React.ReactNode;
  title: string;
  sub?: string;
  action?: React.ReactNode;
}

export function Empty({ icon, title, sub, action }: EmptyProps) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center gap-3">
      <div className="text-muted-foreground">{icon}</div>
      <p className="text-sm font-medium text-foreground">{title}</p>
      {sub && <p className="text-xs text-muted-foreground max-w-[240px]">{sub}</p>}
      {action}
    </div>
  );
}

export function fmt(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}k`;
  return `$${n}`;
}

interface TagInputProps {
  value: string[];
  onChange: (tags: string[]) => void;
  suggestions?: string[];
  placeholder?: string;
}

export function TagInput({ value, onChange, suggestions = [], placeholder = "Add tag..." }: TagInputProps) {
  const [input, setInput] = useState("");
  const [open, setOpen] = useState(false);

  const addTag = (tag: string) => {
    const trimmed = tag.trim();
    if (trimmed && !value.includes(trimmed)) {
      onChange([...value, trimmed]);
    }
    setInput("");
    setOpen(false);
  };

  const removeTag = (tag: string) => onChange(value.filter((t) => t !== tag));

  const filtered = suggestions.filter(
    (s) => s.toLowerCase().includes(input.toLowerCase()) && !value.includes(s)
  );

  return (
    <div className="flex flex-wrap gap-1.5 p-2 border border-input rounded-md bg-background min-h-[40px]">
      {value.map((tag) => (
        <Badge key={tag} variant="secondary" className="gap-1 pr-1">
          {tag}
          {/* remove button — intentionally raw button for inline badge action */}
          <button type="button" onClick={() => removeTag(tag)} className="hover:text-destructive ml-0.5">
            <X size={10} />
          </button>
        </Badge>
      ))}
      <Popover open={open && filtered.length > 0} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          {/* anchor div — keeps Input as a real text input, not a button */}
          <div className="flex-1 min-w-[80px] relative">
            <Input
              value={input}
              onChange={(e) => { setInput(e.target.value); setOpen(true); }}
              onKeyDown={(e) => {
                if (e.key === "Enter") { e.preventDefault(); addTag(input); }
                if (e.key === "Backspace" && !input && value.length) removeTag(value[value.length - 1]);
              }}
              placeholder={value.length === 0 ? placeholder : ""}
              className="border-0 p-0 h-auto shadow-none focus-visible:ring-0 text-sm w-full"
            />
          </div>
        </PopoverTrigger>
        <PopoverContent className="p-0 w-48" align="start">
          <Command>
            <CommandList>
              {filtered.map((s) => (
                <CommandItem key={s} onSelect={() => addTag(s)}>{s}</CommandItem>
              ))}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
