import { Radar, Sparkles, LineChart } from 'lucide-react';

import { Section } from './Section';
import { Reveal } from './Reveal';

const steps = [
  {
    icon: Radar,
    title: 'Track trends',
    description:
      'Growth Studio watches your space and surfaces the topics gaining momentum right now.',
  },
  {
    icon: Sparkles,
    title: 'Generate content',
    description:
      'Turn any trend into on-brand posts, threads, and articles in a single click.',
  },
  {
    icon: LineChart,
    title: 'Measure what works',
    description:
      'See what performed, get AI insights, and double down on what drives growth.',
  },
];

export function HowItWorks() {
  return (
    <Section
      centered
      className="bg-muted/40 border-border border-y"
      eyebrow="How it works"
      title="From trend to result in three steps"
      description="No complex setup. Point it at your space and start shipping."
    >
      <div className="relative grid gap-8 md:grid-cols-3">
        {/* Connecting line (desktop) */}
        <div
          aria-hidden
          className="via-border absolute top-8 right-[16%] left-[16%] hidden h-px bg-gradient-to-r from-transparent to-transparent md:block"
        />
        {steps.map((step, i) => (
          <Reveal key={step.title} delay={i * 0.1}>
            <div className="relative text-center">
              <div className="glass-card mx-auto flex size-16 items-center justify-center rounded-2xl">
                <step.icon className="size-7 text-violet-400" />
                <span className="absolute -top-2 -right-2 flex size-6 items-center justify-center rounded-full bg-violet-600 text-xs font-bold text-white">
                  {i + 1}
                </span>
              </div>
              <h3 className="mt-5 text-lg font-semibold">{step.title}</h3>
              <p className="text-muted-foreground mx-auto mt-2 max-w-xs text-sm">
                {step.description}
              </p>
            </div>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}
