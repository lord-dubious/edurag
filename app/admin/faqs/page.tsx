'use client';

import { useState, useEffect } from 'react';

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

  const handleApprove = async (id: string) => {
    try {
      const res = await fetch(`/api/faqs/${id}/approve`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        setFaqs(faqs.map(f => f._id === id ? { ...f, public: true, pendingApproval: false } : f));
      }
    } catch (err) {
      console.error('Failed to approve FAQ:', err);
    }
  };

  if (loading) return <div>Loading...</div>;

  const pendingFaqs = faqs.filter(f => f.pendingApproval);
  const approvedFaqs = faqs.filter(f => !f.pendingApproval && f.public);

  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">FAQ Management</h1>

      {pendingFaqs.length > 0 && (
        <div className="mb-8">
          <h2 className="text-lg font-semibold mb-4">Pending Approval ({pendingFaqs.length})</h2>
          <div className="space-y-4">
            {pendingFaqs.map((faq) => (
              <div key={faq._id} className="p-4 bg-card border rounded-lg border-yellow-500/50">
                <div className="font-medium mb-2">{faq.question}</div>
                <div className="text-sm text-muted-foreground mb-4">{faq.answer}</div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Asked {faq.count} times</span>
                  <button
                    onClick={() => handleApprove(faq._id)}
                    className="px-4 py-1 bg-primary text-primary-foreground rounded-md text-sm hover:opacity-90"
                  >
                    Approve
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-4">Approved FAQs ({approvedFaqs.length})</h2>
        <div className="space-y-4">
          {approvedFaqs.map((faq) => (
            <div key={faq._id} className="p-4 bg-card border rounded-lg">
              <div className="font-medium mb-2">{faq.question}</div>
              <div className="text-sm text-muted-foreground">{faq.answer}</div>
              <div className="text-sm text-muted-foreground mt-2">Asked {faq.count} times</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
