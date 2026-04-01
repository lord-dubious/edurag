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
      <section id='faqs' className='mx-auto w-full max-w-6xl px-4 py-14'>
        <div className='surface-glass rounded-3xl p-6 sm:p-8'>
          <div className='mb-6 flex items-center justify-between gap-3'>
            <Skeleton className='h-8 w-56' />
            <Skeleton className='h-6 w-24 rounded-full' />
          </div>
          <div className='space-y-3'>
            {[1, 2, 3, 4].map((i) => (
              <Skeleton key={i} className='h-16 w-full rounded-xl' />
            ))}
          </div>
        </div>
      </section>
    );
  }

  if (faqs.length === 0) return null;

  return (
    <section id='faqs' className='mx-auto w-full max-w-6xl px-4 py-14'>
      <div className='surface-glass rounded-3xl p-6 sm:p-8'>
        <div className='mb-7 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between'>
          <div className='space-y-1.5'>
            <p className='text-xs font-semibold uppercase tracking-[0.17em] text-muted-foreground'>
              FAQ Library
            </p>
            <h2 className='text-2xl font-semibold tracking-tight sm:text-3xl'>
              The questions students ask most often
            </h2>
            <p className='max-w-2xl text-sm text-muted-foreground sm:text-base'>
              These answers are curated from your knowledge base and updated as your content evolves.
            </p>
          </div>
          <Badge variant='secondary' className='w-fit px-3 py-1 text-xs'>
            {faqs.length} answers ready
          </Badge>
        </div>

        <Accordion type='single' collapsible className='divide-y divide-white/45 rounded-2xl border border-white/60 bg-background/80 px-4 sm:px-6'>
          {faqs.map((faq, index) => (
            <AccordionItem
              key={faq._id}
              value={`faq-${index}`}
              className='border-b-0'
            >
              <AccordionTrigger className='py-5 text-left text-base font-medium hover:no-underline'>
                {faq.question}
              </AccordionTrigger>
              <AccordionContent className='pb-5 text-sm leading-relaxed text-muted-foreground sm:text-base'>
                {faq.answer}
              </AccordionContent>
            </AccordionItem>
          ))}
        </Accordion>
      </div>
    </section>
  );
}
