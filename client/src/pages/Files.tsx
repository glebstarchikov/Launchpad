import FilesView from "@/components/FilesView";

export default function Files() {
  return (
    <div className="px-8 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-lg font-semibold">Files</h1>
      </div>
      <FilesView />
    </div>
  );
}
