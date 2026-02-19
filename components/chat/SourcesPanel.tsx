'use client';

import { Sheet, SheetContent, SheetTrigger } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLinkIcon, FileTextIcon, XIcon } from 'lucide-react';
import { useState } from 'react';

export interface Source {
  url: string;
  title?: string;
  content: string;
  score?: number;
}

interface SourcesPanelProps {
  sources: Source[];
  isOpen?: boolean;
  onClose?: () => void;
}

function SourceCard({ source, index }: { source: Source; index: number }) {
  const hostname = new URL(source.url).hostname;
  const favicon = `https://www.google.com/s2/favicons?domain=${hostname}&sz=32`;

  return (
    <Card className="overflow-hidden hover:shadow-md transition-shadow">
      <CardContent className="p-3">
        <div className="flex items-start gap-3">
          <img
            src={favicon}
            alt=""
            className="w-5 h-5 rounded mt-0.5 shrink-0"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = 'none';
            }}
          />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xs font-medium text-muted-foreground truncate">
                {source.title ?? hostname}
              </span>
              {source.score !== undefined && (
                <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                  {(source.score * 100).toFixed(0)}%
                </Badge>
              )}
            </div>
            <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
              {source.content.slice(0, 150)}
              {source.content.length > 150 ? '...' : ''}
            </p>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
            >
              <ExternalLinkIcon className="size-3" />
              <span className="truncate max-w-[200px]">{hostname}</span>
            </a>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export function SourcesPanel({ sources, isOpen: externalIsOpen, onClose }: SourcesPanelProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = externalIsOpen !== undefined;
  const open = isControlled ? externalIsOpen : internalIsOpen;

  if (sources.length === 0) return null;

  return (
    <>
      {/* Desktop Slide-in Panel */}
      <div className="hidden lg:block">
        <div
          className={`fixed right-0 top-0 h-full w-80 border-l bg-background shadow-lg z-40 transform transition-transform duration-300 ${
            open ? 'translate-x-0' : 'translate-x-full'
          }`}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-4 text-primary" />
                <h3 className="font-semibold">Sources</h3>
                <Badge variant="secondary" className="text-xs">
                  {sources.length}
                </Badge>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-8"
                onClick={() => (isControlled ? onClose?.() : setInternalIsOpen(false))}
              >
                <XIcon className="size-4" />
              </Button>
            </div>
            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {sources.map((source, i) => (
                <SourceCard key={`${source.url}-${i}`} source={source} index={i} />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Mobile Sheet */}
      <div className="lg:hidden">
        <Sheet open={open} onOpenChange={(v) => (isControlled ? onClose?.() : setInternalIsOpen(v))}>
          <SheetContent side="bottom" className="h-[60vh]">
            <div className="flex items-center gap-2 mb-4">
              <FileTextIcon className="size-4 text-primary" />
              <h3 className="font-semibold">Sources</h3>
              <Badge variant="secondary" className="text-xs">
                {sources.length}
              </Badge>
            </div>
            <div className="overflow-y-auto space-y-3 pb-8">
              {sources.map((source, i) => (
                <SourceCard key={`${source.url}-${i}`} source={source} index={i} />
              ))}
            </div>
          </SheetContent>
        </Sheet>
      </div>
    </>
  );
}

interface SourcesTriggerProps {
  count: number;
  onClick: () => void;
}

export function SourcesTrigger({ count, onClick }: SourcesTriggerProps) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground"
      onClick={onClick}
    >
      <FileTextIcon className="size-3.5" />
      {count} {count === 1 ? 'source' : 'sources'}
    </Button>
  );
}
