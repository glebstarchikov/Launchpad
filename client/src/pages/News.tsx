import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Newspaper, RefreshCw, ExternalLink, Check, Plus, Rss, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";
import { Empty } from "@/components/app-ui";
import { api } from "@/lib/api";
import Markdown from "@/components/Markdown";
import type { NewsItem } from "@/lib/types";

export default function News() {
  const queryClient = useQueryClient();
  const [selected, setSelected] = useState<NewsItem | null>(null);
  const [showAddFeed, setShowAddFeed] = useState(false);
  const [feedUrl, setFeedUrl] = useState("");
  const [feedName, setFeedName] = useState("");

  const { data: items = [], isLoading } = useQuery({
    queryKey: ["news"],
    queryFn: () => api.news.list(),
  });

  const fetchNews = useMutation({
    mutationFn: api.news.fetch,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news"] });
    },
  });

  const markRead = useMutation({
    mutationFn: (id: string) => api.news.markRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news"] });
    },
  });

  const { data: sources = [] } = useQuery({
    queryKey: ["news-sources"],
    queryFn: api.news.sources.list,
  });

  const addSource = useMutation({
    mutationFn: (data: { type: string; name: string; url: string }) => api.news.sources.add(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news-sources"] });
      setFeedUrl("");
      setFeedName("");
      setShowAddFeed(false);
    },
  });

  const deleteSource = useMutation({
    mutationFn: (id: string) => api.news.sources.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["news-sources"] });
    },
  });

  const handleSelect = (item: NewsItem) => {
    setSelected(item);
    if (!item.read) {
      markRead.mutate(item.id);
    }
  };

  const unreadCount = items.filter((i) => !i.read).length;

  return (
    <div className="flex h-[calc(100vh-48px)]">
      {/* Left pane — news list */}
      <div className="w-1/3 min-w-[300px] max-w-[420px] border-r border-border flex flex-col shrink-0">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <h1 className="text-lg font-semibold">News</h1>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fetchNews.mutate()}
            disabled={fetchNews.isPending}
            className="h-7 text-xs"
          >
            <RefreshCw size={12} className={cn("mr-1", fetchNews.isPending && "animate-spin")} />
            {fetchNews.isPending ? "Fetching..." : "Refresh"}
          </Button>
        </div>

        <ScrollArea className="flex-1">
          {isLoading ? (
            <div className="p-4 space-y-3">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="h-16 bg-card rounded border border-border animate-pulse" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <div className="p-8">
              <Empty
                icon={<Newspaper size={20} />}
                title="No news yet"
                sub="Click Refresh to fetch stories from Hacker News."
              />
            </div>
          ) : (
            items.map((item) => (
              <button
                key={item.id}
                onClick={() => handleSelect(item)}
                className={cn(
                  "w-full text-left p-3 border-b border-border hover:bg-secondary/50 transition-colors",
                  selected?.id === item.id && "bg-secondary ring-1 ring-inset ring-border",
                  !item.read && "border-l-2 border-l-info"
                )}
              >
                <p className={cn("text-[13px] leading-snug line-clamp-2", !item.read ? "font-medium text-foreground" : "text-muted-foreground")}>
                  {item.title}
                </p>
                <div className="flex items-center gap-2 mt-1.5">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    {item.source === "hackernews" ? "HN" : item.source}
                  </Badge>
                  {item.relevance_score > 0 && (
                    <span className="text-[10px] text-success">
                      {Math.round(item.relevance_score * 100)}% relevant
                    </span>
                  )}
                  {item.read ? (
                    <Check size={10} className="text-muted-foreground ml-auto" />
                  ) : null}
                </div>
              </button>
            ))
          )}
        </ScrollArea>

        {items.length > 0 && (
          <div className="p-3 border-t border-border text-[11px] text-muted-foreground">
            {unreadCount} unread · {items.length} total
          </div>
        )}

        {/* RSS feed management */}
        <div className="p-3 border-t border-border">
          {showAddFeed ? (
            <div className="space-y-2">
              <Input
                placeholder="Feed name"
                value={feedName}
                onChange={(e) => setFeedName(e.target.value)}
                className="h-7 text-xs"
              />
              <Input
                placeholder="https://example.com/feed.xml"
                value={feedUrl}
                onChange={(e) => setFeedUrl(e.target.value)}
                className="h-7 text-xs"
              />
              <div className="flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs flex-1"
                  disabled={!feedUrl.trim() || !feedName.trim() || addSource.isPending}
                  onClick={() => addSource.mutate({ type: "rss", name: feedName, url: feedUrl })}
                >
                  Add Feed
                </Button>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setShowAddFeed(false)}>
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-1.5">
              {sources.map((s) => (
                <div key={s.id} className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  {s.type === "rss" ? <Rss size={10} className="shrink-0" /> : <Newspaper size={10} className="shrink-0" />}
                  <span className="truncate flex-1">{s.name}</span>
                  <button onClick={() => deleteSource.mutate(s.id)} className="hover:text-destructive transition-colors">
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
              <button
                onClick={() => setShowAddFeed(true)}
                className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors w-full"
              >
                <Plus size={10} />
                Add RSS Feed
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Right pane — article preview */}
      <div className="flex-1 p-6 overflow-auto">
        {selected ? (
          <div className="max-w-3xl">
            <h2 className="text-lg font-semibold mb-2">{selected.title}</h2>
            <div className="flex items-center gap-3 mb-4">
              <Badge variant="outline" className="text-[11px]">
                {selected.source === "hackernews" ? "Hacker News" : selected.source}
              </Badge>
              {selected.relevance_reason && (
                <span className="text-[11px] text-muted-foreground">{selected.relevance_reason}</span>
              )}
            </div>

            {selected.summary && (
              <div className="bg-card border border-border rounded-lg p-4 mb-4">
                <p className="text-[11px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">AI Summary</p>
                <Markdown content={selected.summary} className="text-foreground" />
              </div>
            )}

            {selected.url && (
              <Button variant="outline" size="sm" asChild>
                <a href={selected.url} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={12} className="mr-1.5" />
                  Read full article
                </a>
              </Button>
            )}
          </div>
        ) : (
          <Empty
            icon={<Newspaper size={20} />}
            title="Select an article"
            sub="Choose a story from the list to see details."
          />
        )}
      </div>
    </div>
  );
}
