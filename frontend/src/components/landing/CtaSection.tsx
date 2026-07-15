import { Link } from 'react-router-dom';
import { ArrowRight } from 'lucide-react';

import { useAuth } from '@/context/auth-context';
import { Button } from '@/components/ui/button';
import { AuroraBackground } from './AuroraBackground';
import { GridPattern } from './GridPattern';
import { Reveal } from './Reveal';

export function CtaSection() {
  const { isAuthenticated } = useAuth();
  const to = isAuthenticated ? '/dashboard' : '/login';

  return (
    <section className="py-20 sm:py-24">
      <Reveal className="mx-auto max-w-5xl px-4 sm:px-6 lg:px-8">
        <div className="glass-card relative overflow-hidden rounded-3xl px-6 py-16 text-center sm:px-12">
          <AuroraBackground />
          <GridPattern />

          <h2 className="mx-auto max-w-2xl text-3xl font-bold tracking-tight sm:text-4xl">
            Start turning trends into growth{' '}
            <span className="gradient-text">today</span>
          </h2>
          <p className="text-muted-foreground mx-auto mt-4 max-w-xl text-lg">
            Join teams using Growth Studio to spot trends, create content, and
            measure what works — all in one place.
          </p>
          <div className="mt-8 flex justify-center">
            <Button asChild size="lg" className="btn-glow">
              <Link to={to}>
                {isAuthenticated ? 'Go to dashboard' : 'Get started free'}
                <ArrowRight className="size-4" />
              </Link>
            </Button>
          </div>
        </div>
      </Reveal>
    </section>
  );
}
