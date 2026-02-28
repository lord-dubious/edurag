"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Conversation {
  threadId: string;
  messages: { role: string; content: string; timestamp: string }[];
  updatedAt: string;
}

interface HistorySidebarProps {
  currentId: string;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onDelete: (threadId: string) => void;
  isOpen: boolean;
}

export function HistorySidebar({ currentId, onSelect, onNew, onDelete, isOpen }: HistorySidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch("/api/history");
        const data = res.ok ? await res.json() : [];
        if (!cancelled && Array.isArray(data)) {
          setConversations(data);
        }
      } catch {
        if (!cancelled) setConversations([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();

    return () => {
      cancelled = true;
    };
  }, [isOpen]);

  const handleDelete = useCallback(async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    setConversations((prev) => prev.filter((c) => c.threadId !== threadId));
    onDelete(threadId);
  }, [onDelete]);

  if (!isOpen) return null;

  return (
    <div className="w-full flex flex-col h-full bg-muted/20">
      <div className="flex items-center justify-between px-4 h-14 border-b shrink-0">
        <h2 className="text-sm font-semibold">History</h2>
        <Button onClick={onNew} size="sm" variant="ghost" className="h-8 w-8 p-0">
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conv) => (
            <div
              key={conv.threadId}
              className={cn(
                "group relative flex items-start rounded-md w-full overflow-hidden",
                currentId === conv.threadId && "bg-muted"
              )}
            >
              <button
                className={cn(
                  "flex items-start gap-2 text-left w-full px-3 py-3 rounded-md text-sm transition-colors",
                  "hover:bg-accent",
                  currentId === conv.threadId ? "bg-muted hover:bg-muted/80" : ""
                )}
                onClick={() => onSelect(conv.threadId)}
              >
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 opacity-70" />
                <div className="flex flex-col items-start overflow-hidden flex-1 min-w-0 pr-7">
                  <span className="line-clamp-2 w-full font-medium whitespace-normal break-words leading-snug">
                    {conv.messages[0]?.content?.substring(0, 100) || "New Chat"}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
              <button
                onClick={(e) => handleDelete(e, conv.threadId)}
                className="absolute right-2 top-3 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity p-1 rounded-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10"
                aria-label="Delete conversation"
                title="Delete conversation"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          {conversations.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground p-4 text-center">
              No history yet.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
