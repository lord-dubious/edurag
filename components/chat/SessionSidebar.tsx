'use client';

import { useState, useEffect, useMemo } from 'react';
import { PlusIcon, Trash2Icon, MessageSquareIcon } from 'lucide-react';
import { SESSIONS_STORAGE_KEY } from '@/lib/constants';

interface Session {
  id: string;
  title: string;
  createdAt: number;
}

interface Props {
  currentThreadId: string;
  onNewChat: () => void;
  onSelectSession: (id: string) => void;
  onDeleteSession: (id: string) => void;
  collapsed?: boolean;
  sessionsVersion?: number;
}

function getDateGroup(timestamp: number): string {
  const sessionDate = new Date(timestamp);
  const now = new Date();
  
  const sessionMidnight = new Date(
    sessionDate.getFullYear(),
    sessionDate.getMonth(),
    sessionDate.getDate()
  );
  const nowMidnight = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate()
  );
  
  const dayMs = 24 * 60 * 60 * 1000;
  const diff = Math.floor((nowMidnight.getTime() - sessionMidnight.getTime()) / dayMs);

  if (diff <= 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff <= 7) return 'This Week';
  return 'Older';
}

function formatTime(timestamp: number): string {
  return new Date(timestamp).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
}

export function SessionSidebar({ currentThreadId, onNewChat, onSelectSession, onDeleteSession, collapsed, sessionsVersion }: Props) {
  const [sessions, setSessions] = useState<Session[]>([]);

  useEffect(() => {
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
      if (stored) {
        const parsed: Session[] = JSON.parse(stored);
        setSessions(parsed);
      } else {
        setSessions([]);
      }
    } catch (e) {
      console.error('Failed to load sessions:', e);
      setSessions([]);
    }
  }, [sessionsVersion]);

  const handleDelete = (e: React.MouseEvent, sessionId: string) => {
    e.stopPropagation();
    try {
      const stored = localStorage.getItem(SESSIONS_STORAGE_KEY);
      const latestSessions: Session[] = stored ? JSON.parse(stored) : [];
      const updated = latestSessions.filter(s => s.id !== sessionId);
      setSessions(updated);
      localStorage.setItem(SESSIONS_STORAGE_KEY, JSON.stringify(updated));
      onDeleteSession(sessionId);
    } catch (e) {
      console.error('Failed to delete session:', e);
    }
  };

  const groupedSessions = useMemo(() => {
    const groups: Record<string, Session[]> = {};
    sessions.forEach((session) => {
      const group = getDateGroup(session.createdAt);
      if (!groups[group]) groups[group] = [];
      groups[group].push(session);
    });
    return groups;
  }, [sessions]);

  const groupOrder = ['Today', 'Yesterday', 'This Week', 'Older'];

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
        {groupOrder.map((group) => {
          const groupSessions = groupedSessions[group];
          if (!groupSessions || groupSessions.length === 0) return null;

          return (
            <div key={group} className="mb-3">
              <div className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground px-2 py-1.5">
                {group}
              </div>
              <div className="space-y-0.5">
                {groupSessions.map((session) => (
                  <div
                    key={session.id}
                    onClick={() => onSelectSession(session.id)}
                    className={`group flex items-center gap-2 px-2 py-2 rounded-md cursor-pointer transition-colors ${
                      session.id === currentThreadId
                        ? 'bg-primary/10'
                        : 'hover:bg-muted'
                    }`}
                  >
                    <div className={`w-6 h-6 rounded flex items-center justify-center shrink-0 ${
                      session.id === currentThreadId ? 'bg-primary/20 text-primary' : 'bg-muted text-muted-foreground'
                    }`}>
                      <MessageSquareIcon className="w-3.5 h-3.5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className={`text-sm truncate ${
                        session.id === currentThreadId ? 'text-primary font-medium' : ''
                      }`}>
                        {session.title}
                      </div>
                      <div className="text-[11px] text-muted-foreground">
                        {formatTime(session.createdAt)}
                      </div>
                    </div>
                    <button
                      onClick={(e) => handleDelete(e, session.id)}
                      className="w-5 h-5 flex items-center justify-center rounded opacity-0 group-hover:opacity-100 hover:bg-destructive/10 hover:text-destructive transition-all"
                      title="Delete"
                    >
                      <Trash2Icon className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
        
        {sessions.length === 0 && (
          <div className="text-center text-muted-foreground text-sm py-8">
            No conversations yet
          </div>
        )}
      </div>
    </aside>
  );
}
