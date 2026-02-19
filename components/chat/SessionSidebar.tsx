'use client';

import { useState, useEffect } from 'react';

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
}

export function SessionSidebar({ currentThreadId, onNewChat, onSelectSession }: Props) {
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

  return (
    <aside className="w-64 border-r bg-muted/30 flex flex-col">
      <div className="p-4 border-b">
        <button
          onClick={onNewChat}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity text-sm font-medium"
        >
          New Chat
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        <div className="space-y-1">
          {sessions.map((session) => (
            <button
              key={session.id}
              onClick={() => onSelectSession(session.id)}
              className={`w-full text-left px-3 py-2 rounded-md text-sm transition-colors ${
                session.id === currentThreadId
                  ? 'bg-primary/10 text-primary'
                  : 'hover:bg-muted'
              }`}
            >
              <div className="truncate">
                {session.preview ?? `Chat ${session.id.slice(0, 8)}`}
              </div>
              <div className="text-xs text-muted-foreground mt-0.5">
                {session.createdAt.toLocaleDateString()}
              </div>
            </button>
          ))}
        </div>
      </div>
    </aside>
  );
}
