'use client';

import { useState } from 'react';
import { ExternalLinkIcon, FileTextIcon, XIcon } from 'lucide-react';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cleanSourcePreview, getSafeHref, getSourceHostname } from '@/lib/chat/sources';

export interface Source {
  url: string;
  title?: string;
  content: string;
  score?: number;
  sourceType?: 'vector' | 'web';
}

interface SourcesPanelProps {
  sources: Source[];
  title?: string;
  isOpen?: boolean;
  onClose?: () => void;
}

interface SourceCardProps {
  source: Source;
}

function SourceCard({ source }: SourceCardProps) {
  const safeHref = getSafeHref(source.url);
  const hostname = getSourceHostname(source.url);

  const content = (
    <>
      <div className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded bg-muted text-[10px] font-semibold uppercase text-muted-foreground">
        {hostname.slice(0, 1)}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xs font-medium text-muted-foreground truncate">
            {source.title ?? hostname}
          </span>
          {source.sourceType && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {source.sourceType === 'web' ? 'Web' : 'KB'}
            </Badge>
          )}
          {source.score !== undefined && (
            <Badge variant="outline" className="text-[10px] px-1.5 py-0">
              {(source.score * 100).toFixed(0)}%
            </Badge>
          )}
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">
          {cleanSourcePreview(source.content, 150)}
        </p>
        <div className="inline-flex items-center gap-1 text-xs text-primary">
          {safeHref && <ExternalLinkIcon className="size-3" />}
          <span className="truncate max-w-[200px]">{hostname}</span>
        </div>
      </div>
    </>
  );

  if (!safeHref) {
    return (
      <Card className="overflow-hidden">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">{content}</div>
        </CardContent>
      </Card>
    );
  }

  return (
    <a href={safeHref} target="_blank" rel="noopener noreferrer" className="block no-underline">
      <Card className="overflow-hidden hover:shadow-md transition-shadow">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">{content}</div>
        </CardContent>
      </Card>
    </a>
  );
}

export function SourcesPanel({ sources, title = 'Sources', isOpen: externalIsOpen, onClose }: SourcesPanelProps) {
  const [internalIsOpen, setInternalIsOpen] = useState(false);
  const isControlled = externalIsOpen !== undefined;
  const open = isControlled ? externalIsOpen : internalIsOpen;
  const hasWebFallback = sources.some(source => source.sourceType === 'web');

  if (sources.length === 0) return null;

  return (
    <>
      <div className="hidden lg:block">
        <div
          className={`fixed right-0 top-0 h-full w-80 border-l bg-background shadow-lg z-40 transform transition-transform duration-300 ${open ? 'translate-x-0' : 'translate-x-full'
            }`}
        >
          <div className="flex flex-col h-full">
            <div className="flex items-center justify-between p-4 border-b">
              <div className="flex items-center gap-2">
                <FileTextIcon className="size-4 text-primary" />
                <h3 className="font-semibold">{title}</h3>
                <Badge variant="secondary" className="text-xs">
                  {sources.length}
                </Badge>
                {hasWebFallback && (
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                    Web fallback
                  </Badge>
                )}
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
                <SourceCard key={`${source.url}-${i}`} source={source} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className="lg:hidden">
          <Sheet
            open={open}
            onOpenChange={(v) => {
            if (isControlled) {
              if (!v) onClose?.();
              return;
            }

            setInternalIsOpen(v);
          }}
          >
            <SheetContent side="bottom" className="h-[60vh]">
              <SheetHeader className="mb-4 gap-2">
                <div className="flex items-center gap-2">
                  <FileTextIcon className="size-4 text-primary" />
                  <SheetTitle className="text-base">{title}</SheetTitle>
                  <Badge variant="secondary" className="text-xs">
                    {sources.length}
                  </Badge>
                  {hasWebFallback && (
                    <Badge variant="outline" className="text-[10px] px-1.5 py-0">
                      Web fallback
                    </Badge>
                  )}
                </div>
                <SheetDescription className="sr-only">
                  Review the sources for the selected answer and open the original links when available.
                </SheetDescription>
              </SheetHeader>
              <div className="overflow-y-auto space-y-3 pb-8">
                {sources.map((source, i) => (
                  <SourceCard key={`${source.url}-${i}`} source={source} />
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
