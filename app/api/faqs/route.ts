import { getPublicFaqs } from '@/lib/faq-manager';

export const dynamic = 'force-dynamic';

export async function GET() {
  const faqs = await getPublicFaqs(20);

  return Response.json({
    success: true,
    data: faqs.map(f => ({
      id: f._id.toString(),
      question: f.question,
      answer: f.answer,
      count: f.count,
    })),
  });
}
