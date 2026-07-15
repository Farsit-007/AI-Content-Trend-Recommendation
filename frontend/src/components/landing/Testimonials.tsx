import { testimonials, type Testimonial } from '@/lib/mock/landing';
import { Section } from './Section';

function Card({ t }: { t: Testimonial }) {
  return (
    <figure className="glass-card w-80 shrink-0 rounded-2xl p-6">
      <blockquote className="text-sm">“{t.quote}”</blockquote>
      <figcaption className="mt-5 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-full bg-violet-500/20 text-xs font-semibold text-violet-600 dark:text-violet-300">
          {t.initials}
        </span>
        <span>
          <span className="block text-sm font-medium">{t.name}</span>
          <span className="text-muted-foreground block text-xs">
            {t.role}, {t.company}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

export function Testimonials() {
  // Duplicated once for a seamless marquee loop (translateX -50%).
  const loop = [...testimonials, ...testimonials];

  return (
    <Section
      centered
      className="bg-muted/30 border-border border-y"
      eyebrow="Loved by teams"
      title="Don’t just take our word"
    >
      <div className="group relative -mx-4 overflow-hidden">
        {/* Edge fades */}
        <div className="from-background pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r to-transparent" />
        <div className="from-background pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l to-transparent" />

        <div className="animate-marquee flex w-max gap-4 group-hover:[animation-play-state:paused]">
          {loop.map((t, i) => (
            <Card key={`${t.name}-${i}`} t={t} />
          ))}
        </div>
      </div>
    </Section>
  );
}
