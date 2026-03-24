import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Upload, Download, Trash2, File, FileText, Image, Grid, List,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { api } from "@/lib/api";
import { Empty } from "@/components/app-ui";
import type { FileRecord } from "@/lib/types";

function formatBytes(n: number): string {
  if (n < 1024) return n + " B";
  if (n < 1024 ** 2) return (n / 1024).toFixed(1) + " KB";
  return (n / 1024 ** 2).toFixed(1) + " MB";
}

function FileIcon({ mimetype, size = 20 }: { mimetype: string; size?: number }) {
  if (mimetype.startsWith("image/")) return <Image size={size} className="text-muted-foreground" />;
  if (mimetype === "application/pdf" || mimetype.includes("pdf"))
    return <FileText size={size} className="text-muted-foreground" />;
  if (
    mimetype.includes("text") ||
    mimetype.includes("json") ||
    mimetype.includes("xml") ||
    mimetype.includes("javascript") ||
    mimetype.includes("typescript")
  )
    return <FileText size={size} className="text-muted-foreground" />;
  return <File size={size} className="text-muted-foreground" />;
}

interface FilesViewProps {
  projectId?: string;
}

export default function FilesView({ projectId }: FilesViewProps) {
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"grid" | "list">("grid");
  const [isDragging, setIsDragging] = useState(false);

  const queryKey = projectId ? ["files", projectId] : ["files"];

  const { data: files = [] } = useQuery({
    queryKey,
    queryFn: () => api.files.list(projectId),
  });

  const uploadFile = useMutation({
    mutationFn: (file: File) => api.files.upload(file, projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const deleteFile = useMutation({
    mutationFn: api.files.delete,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey });
    },
  });

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFiles = Array.from(e.dataTransfer.files);
    droppedFiles.forEach((f) => uploadFile.mutate(f));
  };

  return (
    <div className="space-y-4">
      {/* Header row */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground">
          {files.length} file{files.length !== 1 ? "s" : ""}
        </h3>
        <div className="flex items-center gap-1">
          <Button
            variant={view === "grid" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setView("grid")}
          >
            <Grid size={14} />
          </Button>
          <Button
            variant={view === "list" ? "secondary" : "ghost"}
            size="icon"
            className="h-7 w-7"
            onClick={() => setView("list")}
          >
            <List size={14} />
          </Button>
        </div>
      </div>

      {/* Drop zone */}
      <Card
        className={cn(
          "border-2 border-dashed border-border transition-colors cursor-pointer",
          isDragging && "border-primary bg-primary/5"
        )}
        onDragOver={(e) => {
          e.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={handleDrop}
        onClick={() => fileInputRef.current?.click()}
      >
        <CardContent className="py-10 text-center">
          <Upload size={24} className="mx-auto text-muted-foreground mb-2" />
          <p className="text-sm text-muted-foreground">
            {uploadFile.isPending ? "Uploading..." : "Drop files here or click to upload"}
          </p>
        </CardContent>
      </Card>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        onChange={(e) => {
          Array.from(e.target.files ?? []).forEach((f) => uploadFile.mutate(f));
          e.target.value = "";
        }}
      />

      {/* Files display */}
      {files.length === 0 ? (
        <Empty
          icon={<File size={32} />}
          title="No files yet"
          sub="Upload files by dragging them into the zone above or clicking it."
        />
      ) : view === "grid" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">
          {files.map((file: FileRecord) => (
            <Card key={file.id} className="group cursor-pointer hover:shadow-md transition-shadow">
              <CardContent className="p-3 text-center">
                <FileIcon mimetype={file.mimetype} />
                <p className="text-xs truncate mt-1.5 font-medium">{file.original_name}</p>
                <p className="text-xs text-muted-foreground">{formatBytes(file.size)}</p>
                <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity justify-center">
                  <Button variant="ghost" size="icon" className="h-6 w-6" asChild>
                    <a href={api.files.downloadUrl(file.id)} download={file.original_name}>
                      <Download size={11} />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 hover:text-destructive"
                    onClick={() => deleteFile.mutate(file.id)}
                  >
                    <Trash2 size={11} />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <div className="divide-y divide-border">
            {files.map((file: FileRecord) => (
              <div key={file.id} className="flex items-center gap-3 px-4 py-2.5 group">
                <FileIcon mimetype={file.mimetype} size={16} />
                <span className="text-sm flex-1 truncate">{file.original_name}</span>
                <span className="text-xs text-muted-foreground">{formatBytes(file.size)}</span>
                <span className="text-xs font-mono text-muted-foreground">
                  {new Date(file.uploaded_at).toLocaleDateString()}
                </span>
                <div className="flex gap-1 opacity-0 group-hover:opacity-100">
                  <Button variant="ghost" size="icon" className="h-7 w-7" asChild>
                    <a href={api.files.downloadUrl(file.id)} download={file.original_name}>
                      <Download size={12} />
                    </a>
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-7 w-7 hover:text-destructive"
                    onClick={() => deleteFile.mutate(file.id)}
                  >
                    <Trash2 size={12} />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        </Card>
      )}
    </div>
  );
}
