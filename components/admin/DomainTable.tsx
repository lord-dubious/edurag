'use client';

import { useState } from 'react';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Confirmation,
  ConfirmationActions,
  ConfirmationAction,
  ConfirmationRequest
} from '@/components/ai-elements/confirmation';
import { RefreshCcw, Trash2, ExternalLink, MoreHorizontal } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

type ConfirmationStatus = 'input-streaming' | 'input-available' | 'approval-requested' | 'approval-responded' | 'output-available' | 'output-error' | 'output-denied';

export interface Domain {
  _id: string;
  url: string;
  threadId: string;
  documentCount: number;
  lastCrawled: Date | null;
  status: 'indexed' | 'crawling' | 'error';
}

interface DomainTableProps {
  domains: Domain[];
  onReindex: (domain: Domain) => void;
  onDelete: (domain: Domain) => void;
  isLoading?: boolean;
}

export function DomainTable({ domains, onReindex, onDelete, isLoading }: DomainTableProps) {
  const [deleteDomain, setDeleteDomain] = useState<Domain | null>(null);

  const formatDate = (date: Date | null) => {
    if (!date) return 'Never';
    return new Date(date).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const getStatusBadge = (status: Domain['status']) => {
    const variants: Record<Domain['status'], { variant: 'default' | 'secondary' | 'destructive'; label: string }> = {
      indexed: { variant: 'default', label: 'Indexed' },
      crawling: { variant: 'secondary', label: 'Crawling' },
      error: { variant: 'destructive', label: 'Error' },
    };
    const { variant, label } = variants[status];
    return <Badge variant={variant}>{label}</Badge>;
  };

  return (
    <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 delay-100 fill-mode-both overflow-hidden rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Domain</TableHead>
            <TableHead>Documents</TableHead>
            <TableHead>Last Crawled</TableHead>
            <TableHead>Status</TableHead>
            <TableHead className="w-[100px]">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {domains.length === 0 ? (
            <TableRow>
              <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                No domains indexed yet. Add a domain above to start crawling.
              </TableCell>
            </TableRow>
          ) : (
            domains.map((domain) => (
              <TableRow key={domain._id}>
                <TableCell>
                  <a
                    href={domain.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 hover:underline"
                  >
                    {new URL(domain.url).hostname}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                </TableCell>
                <TableCell>
                  <span className="font-mono">{domain.documentCount.toLocaleString()}</span>
                </TableCell>
                <TableCell>{formatDate(domain.lastCrawled)}</TableCell>
                <TableCell>{getStatusBadge(domain.status)}</TableCell>
                <TableCell>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" disabled={isLoading}>
                        <MoreHorizontal className="h-4 w-4" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => onReindex(domain)}>
                        <RefreshCcw className="h-4 w-4 mr-2" />
                        Re-index
                      </DropdownMenuItem>
                      <DropdownMenuItem
                        onClick={() => setDeleteDomain(domain)}
                        className="text-destructive focus:text-destructive"
                      >
                        <Trash2 className="h-4 w-4 mr-2" />
                        Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </TableCell>
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>

      <Confirmation
        approval={{ id: deleteDomain?._id.toString() || '', approved: false }}
        state={deleteDomain ? 'approval-requested' : 'input-available'}
      >
        {deleteDomain && (
          <>
            <ConfirmationRequest>
              Delete all indexed content for <strong>{new URL(deleteDomain.url).hostname}</strong>?
              This will remove {deleteDomain.documentCount} documents and cannot be undone.
            </ConfirmationRequest>
            <ConfirmationActions>
              <ConfirmationAction variant="outline" onClick={() => setDeleteDomain(null)}>
                Cancel
              </ConfirmationAction>
              <ConfirmationAction
                variant="destructive"
                onClick={() => {
                  onDelete(deleteDomain);
                  setDeleteDomain(null);
                }}
              >
                Delete
              </ConfirmationAction>
            </ConfirmationActions>
          </>
        )}
      </Confirmation>
    </div>
  );
}
