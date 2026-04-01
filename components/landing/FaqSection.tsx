'use client';

import { useEffect, useState } from 'react';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';

type Faq = {
  _id: string;
  question: string;
  answer: string;
};

export function FaqSection() {
  const [faqs, setFaqs] = useState<Faq[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchFaqs() {
      try {
        const res = await fetch('/api/faqs');
        if (res.ok) {
          const data = await res.json();
          setFaqs(data.faqs || []);
        }
      } catch (error) {
        console.error('Failed to fetch FAQs:', error);
      } finally {
        setLoading(false);
      }
    }
    fetchFaqs();
  }, []);

  if (loading) {
    return (
      <section className="w-full max-w-3xl mx-auto px-4 py-12">
        <div className="flex items-center justify-center gap-3 mb-8">
          <Skeleton className="h-8 w-64" />
        </div>
        <div className="space-y-2">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-16 w-full rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (faqs.length === 0) return null;

  return (
    <section className="w-full max-w-3xl mx-auto px-4 py-16 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-500 fill-mode-both">
      <div className="flex flex-col items-center justify-center gap-2 mb-10 text-center">
        <h2 className="text-3xl font-bold tracking-tight">Frequently Asked Questions</h2>
        <div className="flex items-center gap-2 text-muted-foreground">
          <p>Common questions about</p>
          <Badge variant="secondary" className="font-normal">
            {faqs.length} answered
          </Badge>
        </div>
      </div>

      <Accordion type="single" collapsible className="space-y-3">
        {faqs.map((faq, index) => (
          <AccordionItem
            key={faq._id}
            value={`faq-${index}`}
            className="border rounded-xl px-5 transition-colors data-[state=open]:bg-accent/30 bg-card hover:border-primary/30 shadow-sm"
          >
            <AccordionTrigger className="text-left font-medium hover:no-underline py-5 text-base">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-5 leading-relaxed text-sm md:text-base">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
