'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { ChevronDown, Globe } from 'lucide-react';
import { DEFAULT_CRAWL_INSTRUCTIONS } from '@/lib/constants';

interface CrawlFormData {
  url: string;
  maxDepth: number;
  maxBreadth: number;
  limit: number;
  extractDepth: 'basic' | 'advanced';
  format: 'markdown' | 'text';
  selectPaths: string;
  excludePaths: string;
  instructions: string;
}

interface CrawlFormProps {
  onSubmit: (data: CrawlFormData) => void;
  isLoading?: boolean;
}

export function CrawlForm({ onSubmit, isLoading }: CrawlFormProps) {
  const [formData, setFormData] = useState<CrawlFormData>({
    url: '',
    maxDepth: 2,
    maxBreadth: 20,
    limit: 300,
    extractDepth: 'advanced',
    format: 'markdown',
    selectPaths: '',
    excludePaths: '/admin/*,/login/*,/news/*,/events/*',
    instructions: DEFAULT_CRAWL_INSTRUCTIONS,
  });
  const [optionsOpen, setOptionsOpen] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSubmit(formData);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 animate-in fade-in slide-in-from-bottom-4 duration-500 delay-200 fill-mode-both">
      <div className="flex gap-4">
        <div className="flex-1">
          <div className="relative">
            <Globe className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="url"
              value={formData.url}
              onChange={(e) => setFormData({ ...formData, url: e.target.value })}
              className="pl-10"
              placeholder="https://university.edu"
              required
            />
          </div>
        </div>
        <Button type="submit" disabled={isLoading || !formData.url}>
          {isLoading ? 'Adding...' : 'Add Domain'}
        </Button>
      </div>

      <Collapsible open={optionsOpen} onOpenChange={setOptionsOpen}>
        <CollapsibleTrigger asChild>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
          >
            <ChevronDown className={`h-4 w-4 mr-1 transition-transform ${optionsOpen ? 'rotate-180' : ''}`} />
            Crawl Options
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-4 bg-muted/50 rounded-lg">
            <div className="space-y-2">
              <label className="text-sm font-medium">Max Depth</label>
              <Input
                type="number"
                min={1}
                max={5}
                value={formData.maxDepth}
                onChange={(e) => setFormData({ ...formData, maxDepth: parseInt(e.target.value) || 2 })}
              />
              <p className="text-xs text-muted-foreground">1-5 levels deep</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Max Breadth</label>
              <Input
                type="number"
                min={1}
                value={formData.maxBreadth}
                onChange={(e) => setFormData({ ...formData, maxBreadth: parseInt(e.target.value, 10) || 20 })}
              />
              <p className="text-xs text-muted-foreground">Links per page (unlimited)</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Page Limit</label>
              <Input
                type="number"
                min={1}
                value={formData.limit}
                onChange={(e) => setFormData({ ...formData, limit: parseInt(e.target.value, 10) || 300 })}
              />
              <p className="text-xs text-muted-foreground">Max pages to crawl (unlimited)</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Extract Depth</label>
              <Select
                value={formData.extractDepth}
                onValueChange={(v) => setFormData({ ...formData, extractDepth: v as 'basic' | 'advanced' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="basic">Basic</SelectItem>
                  <SelectItem value="advanced">Advanced</SelectItem>
                </SelectContent>
              </Select>
              <p className="text-xs text-muted-foreground">Content extraction</p>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium">Format</label>
              <Select
                value={formData.format}
                onValueChange={(v) => setFormData({ ...formData, format: v as 'markdown' | 'text' })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="markdown">Markdown</SelectItem>
                  <SelectItem value="text">Plain Text</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">Include Paths</label>
              <Input
                value={formData.selectPaths}
                onChange={(e) => setFormData({ ...formData, selectPaths: e.target.value })}
                placeholder="/academics/*,/admissions/*"
              />
              <p className="text-xs text-muted-foreground">Comma-separated paths to include</p>
            </div>

            <div className="col-span-2 space-y-2">
              <label className="text-sm font-medium">Exclude Paths</label>
              <Input
                value={formData.excludePaths}
                onChange={(e) => setFormData({ ...formData, excludePaths: e.target.value })}
                placeholder="/admin/*,/login/*"
              />
              <p className="text-xs text-muted-foreground">Comma-separated paths to skip</p>
            </div>

            <div className="col-span-full space-y-2">
              <label className="text-sm font-medium">Crawl Instructions</label>
              <Textarea
                value={formData.instructions}
                onChange={(e) => setFormData({ ...formData, instructions: e.target.value })}
                placeholder={DEFAULT_CRAWL_INSTRUCTIONS}
                rows={2}
              />
              <p className="text-xs text-muted-foreground">
                Natural language guidance for what content to prioritize or skip. Leave as-is for university content.
              </p>
            </div>
          </div>
        </CollapsibleContent>
      </Collapsible>
    </form>
  );
}
