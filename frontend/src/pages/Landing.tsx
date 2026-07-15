import { Link } from 'react-router-dom';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';

export default function Landing() {
  const { isAuthenticated } = useAuth();

  return (
    <section className="mx-auto flex max-w-6xl flex-col items-center px-4 py-24 text-center">
      <div className="glass-card mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm">
        <Sparkles className="size-4 text-violet-400" />
        AI Content &amp; Trend Intelligence
      </div>

      <h1 className="max-w-3xl text-4xl font-bold tracking-tight sm:text-6xl">
        Turn trends into content with{' '}
        <span className="gradient-text">Growth Studio</span>
      </h1>

      <p className="text-muted-foreground mt-6 max-w-xl text-lg">
        Track what&apos;s trending, generate on-brand content, and measure what
        works — all in one intelligent workspace.
      </p>

      <div className="mt-10 flex flex-col gap-3 sm:flex-row">
        <Button asChild size="lg">
          <Link to={isAuthenticated ? '/dashboard' : '/login'}>
            {isAuthenticated ? 'Go to dashboard' : 'Get started'}
            <ArrowRight className="size-4" />
          </Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link to="/about">Learn more</Link>
        </Button>
      </div>
    </section>
  );
}
