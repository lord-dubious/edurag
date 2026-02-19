'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { FaqApprovalCard } from '@/components/admin/FaqApprovalCard';
import { SearchIcon, AlertCircleIcon } from 'lucide-react';

interface FAQ {
  _id: string;
  question: string;
  answer: string;
  count: number;
  public: boolean;
  pendingApproval: boolean;
}

export default function FAQsPage() {
  const [faqs, setFaqs] = useState<FAQ[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');

  const token = typeof document !== 'undefined'
    ? document.cookie.split('; ').find(c => c.startsWith('admin_token='))?.split('=')[1]
    : '';

  useEffect(() => {
    const fetchFaqs = async () => {
      try {
        const res = await fetch('/api/faqs?all=true', {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json();
        if (data.success) setFaqs(data.data);
      } catch (err) {
        console.error('Failed to fetch FAQs:', err);
      } finally {
        setLoading(false);
      }
    };
    fetchFaqs();
  }, [token]);

  const handleApprove = async (id: string, editedAnswer?: string) => {
    try {
      const body: { answer?: string } = {};
      if (editedAnswer) body.answer = editedAnswer;
      
      const res = await fetch(`/api/faqs/${id}/approve`, {
        method: 'POST',
        headers: { 
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        setFaqs(faqs.map(f => f._id === id ? { ...f, public: true, pendingApproval: false, answer: editedAnswer || f.answer } : f));
      }
    } catch (err) {
      console.error('Failed to approve FAQ:', err);
    }
  };

  const handleReject = async (id: string) => {
    try {
      const res = await fetch(`/api/faqs/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFaqs(faqs.filter(f => f._id !== id));
      }
    } catch (err) {
      console.error('Failed to reject FAQ:', err);
    }
  };

  const pendingFaqs = faqs.filter(f => f.pendingApproval);
  const approvedFaqs = faqs.filter(f => !f.pendingApproval && f.public);

  const filteredPending = pendingFaqs.filter(f => 
    f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const filteredApproved = approvedFaqs.filter(f => 
    f.question.toLowerCase().includes(searchQuery.toLowerCase()) ||
    f.answer.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">FAQ Management</h1>
          <p className="text-muted-foreground">Review and approve auto-generated FAQs</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <SearchIcon className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
        <Input
          placeholder="Search FAQs..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      <Tabs defaultValue="pending" className="space-y-6">
        <TabsList>
          <TabsTrigger value="pending" className="gap-2">
            Pending
            {pendingFaqs.length > 0 && (
              <Badge variant="destructive" className="ml-1 px-1.5 py-0 text-xs">
                {pendingFaqs.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved" className="gap-2">
            Approved
            <Badge variant="secondary" className="ml-1 px-1.5 py-0 text-xs">
              {approvedFaqs.length}
            </Badge>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="pending" className="space-y-4">
          {filteredPending.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircleIcon className="size-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'No matching FAQs found' : 'No pending FAQs to review'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredPending.map((faq) => (
                <FaqApprovalCard
                  key={faq._id}
                  faq={faq}
                  onApprove={handleApprove}
                  onReject={handleReject}
                  isPending
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="approved" className="space-y-4">
          {filteredApproved.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-12">
                <AlertCircleIcon className="size-12 text-muted-foreground/50 mb-4" />
                <p className="text-muted-foreground">
                  {searchQuery ? 'No matching FAQs found' : 'No approved FAQs yet'}
                </p>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4">
              {filteredApproved.map((faq) => (
                <FaqApprovalCard
                  key={faq._id}
                  faq={faq}
                  onApprove={handleApprove}
                />
              ))}
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}
