import { Hero } from '@/components/landing/Hero';
import { FaqSection } from '@/components/landing/FaqSection';

export const revalidate = 3600;

export default async function HomePage() {
  return (
    <div className="min-h-screen">
      <Hero />
      <div className="container mx-auto px-4 py-16">
        <FaqSection />
      </div>
    </div>
  );
}
