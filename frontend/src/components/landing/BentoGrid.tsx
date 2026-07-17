import { Zap, ShieldCheck, Share2, Sparkles, Quote } from 'lucide-react';

import {
  bentoOutcome,
  bentoCapabilities,
  testimonials,
} from '@/lib/mock/landing';
import { Section } from './Section';
import { Reveal } from './Reveal';

const capabilityIcons = [Zap, ShieldCheck, Share2];
const featured = testimonials[0];

export function BentoGrid() {
  return (
    <Section
      centered
      eyebrow="Why Growth Studio"
      title="Built for teams that move fast"
      description="Real outcomes, real workflows — not another dashboard you forget to open."
    >
      <Reveal>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Outcome metric */}
          <div className="glass-card flex flex-col justify-between rounded-2xl p-6 sm:col-span-2 lg:row-span-2">
            <Sparkles className="size-6 text-violet-500" />
            <div className="mt-8">
              <p className="text-5xl font-bold tracking-tight sm:text-6xl">
                <span className="gradient-text">{bentoOutcome.value}</span>{' '}
                <span className="text-2xl font-semibold sm:text-3xl">
                  {bentoOutcome.headline}
                </span>
              </p>
              <p className="text-muted-foreground mt-3 max-w-md">
                {bentoOutcome.detail}
              </p>
            </div>
          </div>

          {/* Capability tiles */}
          {bentoCapabilities.map((cap, i) => {
            const Icon = capabilityIcons[i] ?? Zap;
            return (
              <div key={cap.title} className="glass-card rounded-2xl p-6">
                <Icon className="size-6 text-violet-500" />
                <h3 className="mt-4 font-semibold">{cap.title}</h3>
                <p className="text-muted-foreground mt-1.5 text-sm">
                  {cap.body}
                </p>
              </div>
            );
          })}

          {/* Attributed testimonial */}
          <div className="glass-card flex flex-col justify-between rounded-2xl p-6">
            <Quote className="size-6 text-violet-500" />
            <div className="mt-4">
              <p className="text-sm font-medium">“{featured.quote}”</p>
              <p className="text-muted-foreground mt-3 text-xs">
                {featured.name} · {featured.role}, {featured.company}
              </p>
            </div>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}
