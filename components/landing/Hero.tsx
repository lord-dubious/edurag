'use client';

import { useRouter } from 'next/navigation';
import { PromptInput, PromptInputBody, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from '@/components/ai-elements/prompt-input';
import type { PromptInputMessage } from '@/components/ai-elements/prompt-input';
import type { ChatStatus } from 'ai';
import { useBrand } from '@/components/providers/BrandProvider';
import { Image as ImageIcon } from 'lucide-react';

export function Hero() {
  const router = useRouter();
  const { brand, loading } = useBrand();

  const name = brand?.appName || 'University Knowledge Base';

  const handleSubmit = (message: PromptInputMessage) => {
    const encodedQuery = encodeURIComponent(message.text);
    router.push(`/chat?q=${encodedQuery}`);
  };

  const renderLogo = () => {
    if (loading) {
      return (
        <div className="w-16 h-16 rounded-xl bg-muted animate-pulse" />
      );
    }

    if ((brand?.iconType === 'logo' || brand?.iconType === 'upload') && brand.logoUrl) {
      return (
        <div className="relative h-16 w-auto max-w-[200px] flex items-center justify-center">
          <img 
            src={brand.logoUrl} 
            alt={name}
            className="h-full w-auto max-h-16 max-w-[200px] object-contain"
          />
        </div>
      );
    }

    if (brand?.emoji) {
      return (
        <div 
          className="w-16 h-16 rounded-xl flex items-center justify-center text-3xl"
          style={{ backgroundColor: brand.primaryColor ? `${brand.primaryColor}20` : undefined }}
        >
          {brand.emoji}
        </div>
      );
    }

    return (
      <div 
        className="w-16 h-16 rounded-xl flex items-center justify-center"
        style={{ backgroundColor: brand?.primaryColor || '#2563eb' }}
      >
        <ImageIcon className="w-8 h-8 text-white" />
      </div>
    );
  };

  return (
    <div className="relative flex flex-col items-center justify-center min-h-[50vh] py-12 px-4 overflow-hidden">
      <div className="absolute inset-0 z-0 bg-grid-slate-900/[0.04] bg-[bottom_1px_center] dark:bg-grid-slate-400/[0.05] dark:bg-bottom">
        <div className="absolute inset-0 bg-background/50 [mask-image:linear-gradient(to_bottom,transparent,black)]"></div>
        <div className="absolute inset-x-0 -top-40 -z-10 transform-gpu overflow-hidden blur-3xl sm:-top-80" aria-hidden="true">
          <div 
            className="relative left-[calc(50%-11rem)] aspect-[1155/678] w-[36.125rem] -translate-x-1/2 rotate-[30deg] opacity-20 sm:left-[calc(50%-30rem)] sm:w-[72.1875rem]" 
            style={{ 
              clipPath: "polygon(74.1% 44.1%, 100% 61.6%, 97.5% 26.9%, 85.5% 0.1%, 80.7% 2%, 72.5% 32.5%, 60.2% 62.4%, 52.4% 68.1%, 47.5% 58.3%, 45.2% 34.5%, 27.5% 76.7%, 0.1% 64.9%, 17.9% 100%, 27.6% 76.8%, 76.1% 97.7%, 74.1% 44.1%)",
              background: brand?.primaryColor 
                ? `linear-gradient(to top right, ${brand.primaryColor}40, ${brand.secondaryColor || brand.primaryColor}60)`
                : 'linear-gradient(to top right, #ff80b5, #9089fc)'
            }}
          />
        </div>
      </div>

      <div className="text-center mb-8 max-w-2xl relative z-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
        <div className="flex justify-center mb-4">
          {renderLogo()}
        </div>
        <p className="text-sm font-medium text-muted-foreground mb-4 tracking-wide">
          {name}
        </p>
        <h1 className="text-3xl md:text-5xl font-bold tracking-tight mb-4 leading-tight">
          Ask questions about{' '}
          <em className="text-primary not-italic font-semibold">{name}</em>
        </h1>
        <p className="text-lg text-muted-foreground max-w-xl mx-auto">
          Get instant answers about admissions, programs, tuition, campus life, and more.
        </p>
      </div>

      <div className="w-full max-w-xl relative z-10 animate-in fade-in slide-in-from-bottom-6 duration-700 delay-150 fill-mode-both">
        <PromptInput onSubmit={handleSubmit} className="shadow-lg hover:shadow-xl transition-shadow duration-300">
          <PromptInputBody>
            <PromptInputTextarea
              placeholder="Ask anything about the university..."
              className="min-h-[48px] text-base border-muted focus-visible:ring-primary/20 bg-background/80 backdrop-blur-sm"
            />
          </PromptInputBody>
          <PromptInputFooter className="bg-background/80 backdrop-blur-sm rounded-b-lg border-t-0 p-2">
            <div className="flex-1" />
            <PromptInputSubmit status={'ready' as ChatStatus} />
          </PromptInputFooter>
        </PromptInput>
      </div>
    </div>
  );
}
