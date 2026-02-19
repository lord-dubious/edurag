import { getPublicFaqs } from '@/lib/faq-manager';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Badge } from '@/components/ui/badge';
import { ExternalLinkIcon } from 'lucide-react';

export async function FaqSection() {
  const faqs = await getPublicFaqs(10);

  if (faqs.length === 0) return null;

  return (
    <section className="w-full max-w-3xl mx-auto px-4 py-12">
      <div className="flex items-center justify-center gap-3 mb-8">
        <h2 className="text-2xl font-bold">Frequently Asked Questions</h2>
        <Badge variant="secondary" className="text-xs">
          {faqs.length}
        </Badge>
      </div>

      <Accordion type="single" collapsible className="space-y-2">
        {faqs.map((faq, index) => (
          <AccordionItem
            key={faq._id.toString()}
            value={`faq-${index}`}
            className="border rounded-lg px-4 data-[state=open]:bg-accent/50"
          >
            <AccordionTrigger className="text-left font-medium hover:no-underline py-4">
              {faq.question}
            </AccordionTrigger>
            <AccordionContent className="text-muted-foreground pb-4 leading-relaxed">
              {faq.answer}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </section>
  );
}
