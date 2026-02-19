'use client';

import { useState, useEffect } from 'react';
import { PlusIcon, Trash2Icon } from 'lucide-react';

interface Session {
  id: string;
  createdAt: Date;
  preview?: string;
}

interface StoredSession {
  id: string;
  createdAt: string;
  preview?: string;
}

interface Props {
  currentThreadId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  collapsed?: boolean;
}

export function SessionSidebar({ currentThreadId, onNewChat, onSelectSession, collapsed }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    const stored = localStorage.getItem('edurag-sessions');
    if (stored) {
      try {
        const parsed: StoredSession[] = JSON.parse(stored);
        setSessions(parsed.map((s) => ({
          ...s,
          createdAt: new Date(s.createdAt),
        })));
      } catch (e) {
        console.error('Failed to parse sessions:', e);
      }
    }
  }, []);

  useEffect(() => {
    const existing = sessions.find(s => s.id === currentThreadId);
    if (!existing) {
      const newSession: Session = {
        id: currentThreadId,
        createdAt: new Date(),
      };
      const updated = [newSession, ...sessions].slice(0, 20);
      setSessions(updated);
      localStorage.setItem('edurag-sessions', JSON.stringify(updated));
    }
  }, [currentThreadId, sessions]);

  const handleDeleteSession = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    const updated = sessions.filter(s => s.id !== sessionId);
    setSessions(updated);
    localStorage.setItem('edurag-sessions', JSON.stringify(updated));
  };

  return (
    <aside 
      className={`border-r bg-background flex flex-col transition-all duration-200 overflow-hidden ${
        collapsed ? 'w-0 opacity-0 pointer-events-none' : 'w-64'
      }`}
    >
      <div className="p-3 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.2">
              <path d="M22 10v6M2 10l10-5 10 5-10 5z"/>
              <path d="M6 12v5c3 3 9 3 12 0v-5"/>
            </svg>
          </div>
          <span className="font-medium text-sm">EduRAG</span>
        </div>
        <button
          onClick={onNewChat}
          className="w-8 h-8 flex items-center justify-center rounded-md border border-border hover:bg-muted transition-colors"
          title="New chat"
        >
          <PlusIcon className="w-4 h-4" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
          Recent
        </div>
        <div className="space-y-0.5">
          {sessions.map((session) => (
            <div
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
                session.id === currentThreadId
                  ? 'bg-primary/10'
                  : 'hover:bg-muted'
              }`}
            >
              <div className={`w-6 h-6 rounded flex items-center justify-center text-xs shrink-0 ${
                session.id === currentThreadId ? 'bg-primary/20' : 'bg-muted'
              }`}>
                💬
              </div>
              <div className="flex-1 min-w-0">
                <div className={`text-sm truncate ${
                  session.id === currentThreadId ? 'text-primary font-medium' : ''
                }`}>
                  {session.preview ?? `Chat ${session.id.slice(0, 8)}`}
                </div>
                <div className="text-[11px] text-muted-foreground">
                  {session.createdAt.toLocaleDateString()}
                </div>
              </div>
              <button
                onClick={(e) => handleDeleteSession(e, session.id)}
                className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                title="Delete"
              >
                <Trash2Icon className="w-3 h-3" />
              </button>
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
