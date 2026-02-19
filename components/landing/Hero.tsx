import { env } from '@/lib/env';

export function Hero() {
  return (
    <div className="bg-gradient-to-b from-primary/10 to-background py-20">
      <div className="container mx-auto px-4 text-center">
        <h1 className="text-4xl md:text-5xl font-bold mb-4">
          {env.NEXT_PUBLIC_APP_NAME}
        </h1>
        <p className="text-xl text-muted-foreground mb-8 max-w-2xl mx-auto">
          Get instant answers about admissions, programs, tuition, campus life, and more.
        </p>
        <a
          href="/chat"
          className="inline-flex items-center px-6 py-3 bg-primary text-primary-foreground rounded-lg text-lg font-medium hover:opacity-90 transition-opacity"
        >
          Start Chatting
          <svg
            className="ml-2 w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M13 7l5 5m0 0l-5 5m5-5H6"
            />
          </svg>
        </a>
      </div>
    </div>
  );
}
