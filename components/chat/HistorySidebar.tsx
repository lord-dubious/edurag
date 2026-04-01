"use client";

import { useEffect, useState, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus, Trash2 } from "lucide-react";
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

function formatUpdatedAt(value: string): string {
  const date = new Date(value);
  const now = new Date();
  const isSameDay = date.toDateString() === now.toDateString();
  if (isSameDay) {
    return date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  }
  return date.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function HistorySidebar({ currentId, onSelect, onNew, onDelete, isOpen, refreshKey }: HistorySidebarProps) {
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
  }, [isOpen, refreshKey]);

  const handleDelete = useCallback(async (e: React.MouseEvent, threadId: string) => {
    e.stopPropagation();
    const prevConversations = [...conversations];
    try {
      await onDelete(threadId);
      setConversations((prev) => prev.filter((c) => c.threadId !== threadId));
    } catch {
      setConversations(prevConversations);
    }
  }, [onDelete, conversations]);

  if (!isOpen) return null;

  return (
    <div className="flex h-full w-full flex-col bg-gradient-to-b from-primary/10 via-background to-background">
      <div className="shrink-0 border-b border-white/40 px-4 py-3 dark:border-white/10">
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-semibold tracking-tight">Conversation History</h2>
          <Button onClick={onNew} size="sm" variant="ghost" className="h-8 w-8 rounded-lg p-0 hover:bg-primary/10">
            <Plus className="h-4 w-4" />
          </Button>
        </div>
        <p className="text-xs text-muted-foreground">
          Your saved sessions appear here.
        </p>
      </div>
      <ScrollArea className="flex-1">
        <div className="space-y-2 p-3">
          {conversations.map((conv) => (
            <div
              key={conv.threadId}
              className={cn(
                'group relative overflow-hidden rounded-xl border',
                currentId === conv.threadId
                  ? 'border-primary/30 bg-primary/10'
                  : 'border-transparent hover:border-white/60 hover:bg-accent/55',
              )}
            >
              <button
                className='flex w-full items-start gap-2.5 px-3 py-3 text-left text-sm transition-colors'
                onClick={() => onSelect(conv.threadId)}
              >
                <div className={cn(
                  'mt-0.5 rounded-md p-1.5',
                  currentId === conv.threadId ? 'bg-primary/15 text-primary' : 'bg-muted text-muted-foreground',
                )}>
                  <MessageSquare className='h-3.5 w-3.5' />
                </div>
                <div className='min-w-0 flex-1 pr-7'>
                  <span className='line-clamp-2 block w-full whitespace-normal break-words text-sm font-medium leading-snug'>
                    {conv.title || conv.messages[0]?.content?.substring(0, 100) || 'New Chat'}
                  </span>
                  <div className='mt-1 flex items-center gap-2'>
                    <span className='text-[11px] text-muted-foreground'>
                      {formatUpdatedAt(conv.updatedAt)}
                    </span>
                    <span className='text-[11px] text-muted-foreground/70'>
                      {conv.messages.length} msgs
                    </span>
                  </div>
                </div>
              </button>
              <button
                onClick={(e) => handleDelete(e, conv.threadId)}
                className='absolute right-2 top-2.5 rounded-md p-1 text-muted-foreground opacity-0 transition-opacity hover:bg-destructive/10 hover:text-destructive focus:opacity-100 group-hover:opacity-100'
                aria-label='Delete conversation'
                title='Delete conversation'
              >
                <Trash2 className='h-3.5 w-3.5' />
              </button>
            </div>
          ))}
          {conversations.length === 0 && !loading && (
            <div className='rounded-xl border border-dashed border-border px-4 py-6 text-center text-sm text-muted-foreground'>
              No history yet. Start a chat to save your first thread.
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
