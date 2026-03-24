import FilesView from "@/components/FilesView";

export default function Files() {
  return (
    <div className="p-8 max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-xl font-semibold tracking-tight">Files</h1>
        <p className="text-sm text-muted-foreground mt-1">
          All your uploaded files across projects.
        </p>
      </div>
      <FilesView />
    </div>
  );
}
