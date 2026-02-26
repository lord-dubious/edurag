"use client";

import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { MessageSquare, Plus } from "lucide-react";
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
  isOpen: boolean;
}

export function HistorySidebar({ currentId, onSelect, onNew, isOpen }: HistorySidebarProps) {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isOpen) {
        const fetchConversations = () => {
            setLoading(true);
            fetch("/api/history")
            .then((res) => {
                if (res.ok) return res.json();
                return [];
            })
            .then((data) => {
                if (Array.isArray(data)) {
                setConversations(data);
                }
            })
            .finally(() => setLoading(false));
        };
        fetchConversations();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <div className="w-64 border-r bg-muted/20 flex flex-col h-full bg-background border-r">
      <div className="p-4 border-b flex justify-between items-center">
        <h2 className="text-sm font-semibold">History</h2>
        <Button onClick={onNew} size="sm" variant="ghost">
            <Plus className="h-4 w-4" />
        </Button>
      </div>
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
            {conversations.map((conv) => (
                <Button
                    key={conv.threadId}
                    variant={currentId === conv.threadId ? "secondary" : "ghost"}
                    className={cn(
                        "w-full justify-start text-sm font-normal truncate h-auto py-2 px-3",
                        currentId === conv.threadId && "bg-muted"
                    )}
                    onClick={() => onSelect(conv.threadId)}
                >
                    <MessageSquare className="h-4 w-4 mr-2 shrink-0 opacity-70" />
                    <div className="flex flex-col items-start overflow-hidden">
                        <span className="truncate w-full font-medium">
                            {conv.messages[0]?.content?.substring(0, 30) || "New Chat"}
                        </span>
                        <span className="text-xs text-muted-foreground truncate w-full">
                            {new Date(conv.updatedAt).toLocaleDateString()}
                        </span>
                    </div>
                </Button>
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
