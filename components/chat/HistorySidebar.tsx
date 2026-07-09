"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertCircle, Loader2, MessageSquare, Plus, RefreshCw, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Source } from '@edurag/agent/text';

interface Conversation {
  threadId: string;
  title?: string;
  messages: { role: string; content: string; timestamp: string; id?: string; sources?: Source[] }[];
  updatedAt: string;
}

interface HistorySidebarProps {
  currentId: string;
  onSelect: (threadId: string) => void;
  onNew: () => void;
  onDelete: (threadId: string) => void;
  isOpen: boolean;
  refreshKey?: number;
}

export function HistorySidebar({ currentId, onSelect, onNew, onDelete, isOpen, refreshKey }: HistorySidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deletingThreadId, setDeletingThreadId] = useState<string | null>(null);

  const loadConversations = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setLoadError(null);

    try {
      const res = await fetch("/api/history", { signal });
      if (!res.ok) {
        throw new Error(`History request failed (${res.status})`);
      }

      const data = await res.json();
      if (Array.isArray(data)) {
        setConversations(data);
      } else {
        setConversations([]);
      }
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        return;
      }

      setConversations([]);
      setLoadError('Could not load saved chats.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;

    const controller = new AbortController();
    void loadConversations(controller.signal);

    return () => {
      controller.abort();
    };
  }, [isOpen, refreshKey, loadConversations]);

  useEffect(() => {
    if (!confirmDeleteId) return;

    const timeout = window.setTimeout(() => {
      setConfirmDeleteId(null);
    }, 3000);

    return () => {
      window.clearTimeout(timeout);
    };
  }, [confirmDeleteId]);

  const handleDelete = useCallback(async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();

    if (confirmDeleteId !== threadId) {
      setConfirmDeleteId(threadId);
      return;
    }

    const prevConversations = [...conversations];
    setDeletingThreadId(threadId);
    try {
      await onDelete(threadId);
      setConversations((prev) => prev.filter((c) => c.threadId !== threadId));
      setConfirmDeleteId(null);
    } catch {
      setConversations(prevConversations);
      setLoadError('Could not delete that chat.');
    } finally {
      setDeletingThreadId(null);
    }
  }, [confirmDeleteId, onDelete, conversations]);

  if (!isOpen) return null;

  return (
    <div className="w-full flex flex-col h-full bg-muted/20">
      <div className="flex items-center justify-between px-4 h-14 border-b shrink-0">
        <h2 className="text-sm font-semibold">History</h2>
        <div className="flex items-center gap-1">
          <Button onClick={() => void loadConversations()} size="sm" variant="ghost" className="h-8 w-8 p-0" disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
          <Button onClick={onNew} size="sm" variant="ghost" className="h-8 w-8 p-0">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {loadError && (
            <div className="mx-2 mb-2 rounded-md border border-destructive/20 bg-destructive/5 p-3 text-xs text-destructive">
              <div className="flex items-start gap-2">
                <AlertCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <div className="space-y-2">
                  <p>{loadError}</p>
                  <Button size="sm" variant="outline" className="h-7" onClick={() => void loadConversations()}>
                    Try again
                  </Button>
                </div>
              </div>
            </div>
          )}
          {loading && conversations.length === 0 && (
            <div className="space-y-2 p-2">
              {Array.from({ length: 4 }).map((_, index) => (
                <div key={index} className="rounded-md border bg-background/60 px-3 py-3">
                  <Skeleton className="h-4 w-4 mb-3" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="mt-2 h-3 w-20" />
                </div>
              ))}
            </div>
          )}
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
                  deletingThreadId === conv.threadId && "opacity-60",
                  currentId === conv.threadId ? "bg-muted hover:bg-muted/80" : ""
                )}
                onClick={() => onSelect(conv.threadId)}
                disabled={deletingThreadId === conv.threadId}
              >
                <MessageSquare className="h-4 w-4 mt-0.5 shrink-0 opacity-70" />
                <div className="flex flex-col items-start overflow-hidden flex-1 min-w-0 pr-7">
                  <span className="line-clamp-2 w-full font-medium whitespace-normal break-words leading-snug">
                    {conv.title || conv.messages[0]?.content?.substring(0, 100) || "New Chat"}
                  </span>
                  <span className="text-xs text-muted-foreground mt-1">
                    {new Date(conv.updatedAt).toLocaleDateString()}
                  </span>
                </div>
              </button>
              <button
                onClick={(e) => handleDelete(e, conv.threadId)}
                disabled={deletingThreadId === conv.threadId}
                className={cn(
                  "absolute right-2 top-3 transition-opacity p-1 rounded-sm",
                  confirmDeleteId === conv.threadId
                    ? "opacity-100 text-destructive bg-destructive/10"
                    : "opacity-0 group-hover:opacity-100 focus:opacity-100 text-muted-foreground hover:text-destructive hover:bg-destructive/10",
                )}
                aria-label={confirmDeleteId === conv.threadId ? "Confirm delete conversation" : "Delete conversation"}
                title={confirmDeleteId === conv.threadId ? "Click again to delete" : "Delete conversation"}
              >
                {deletingThreadId === conv.threadId ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Trash2 className="h-3.5 w-3.5" />}
              </button>
            </div>
          ))}
          {conversations.length === 0 && !loading && (
            <div className="text-sm text-muted-foreground p-6 text-center space-y-3">
              <p>No history yet.</p>
              <Button variant="outline" size="sm" onClick={onNew}>
                Start a new chat
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
