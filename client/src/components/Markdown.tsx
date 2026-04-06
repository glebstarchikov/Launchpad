import { cn } from "@/lib/utils";

function renderMarkdown(text: string): string {
  return text
    // Headers
    .replace(/^#### (.+)$/gm, '<h4 class="text-xs font-medium text-muted-foreground uppercase tracking-wider mt-4 mb-1">$1</h4>')
    .replace(/^### (.+)$/gm, '<h3 class="text-sm font-medium text-muted-foreground mt-4 mb-1">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="text-sm font-semibold mt-0 mb-2">$1</h2>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    // Italic
    .replace(/\*(.+?)\*/g, '<em>$1</em>')
    // Unordered lists
    .replace(/^- (.+)$/gm, '<li class="ml-4">$1</li>')
    // Wrap consecutive <li> in <ul>
    .replace(/((?:<li[^>]*>.*<\/li>\n?)+)/g, '<ul class="list-disc space-y-0.5 my-1">$1</ul>')
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer" class="text-info hover:underline">$1</a>')
    // Line breaks (double newline = paragraph break)
    .replace(/\n\n/g, '<br/><br/>')
    // Single newlines within text (not after HTML tags)
    .replace(/(?<!>)\n(?!<)/g, '<br/>');
}

export default function Markdown({ content, className }: { content: string; className?: string }) {
  const html = renderMarkdown(content);
  return (
    <div
      className={cn("text-[13px] leading-relaxed", className)}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
