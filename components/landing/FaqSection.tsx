import { getPublicFaqs } from '@/lib/faq-manager';

export async function FaqSection() {
  const faqs = await getPublicFaqs(10);

  if (faqs.length === 0) return null;

  return (
    <section>
      <h2 className="text-2xl font-bold mb-6 text-center">Frequently Asked Questions</h2>
      <div className="max-w-3xl mx-auto space-y-4">
        {faqs.map((faq) => (
          <details
            key={faq._id.toString()}
            className="group bg-card border rounded-lg"
          >
            <summary className="flex items-center justify-between p-4 cursor-pointer font-medium">
              {faq.question}
              <svg
                className="w-5 h-5 transition-transform group-open:rotate-180"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M19 9l-7 7-7-7"
                />
              </svg>
            </summary>
            <div className="px-4 pb-4 text-muted-foreground">
              {faq.answer}
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}
