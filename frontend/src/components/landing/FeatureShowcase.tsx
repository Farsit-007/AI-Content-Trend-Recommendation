import type { ReactNode } from 'react';
import {
  Flame,
  Sparkles,
  BarChart3,
  MessageSquare,
  TrendingUp,
  Check,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import {
  trends,
  engagementSeries,
  engagementDelta,
} from '@/lib/mock/landing';
import { Section } from './Section';
import { Reveal } from './Reveal';

interface Feature {
  key: string;
  eyebrow: string;
  title: string;
  description: string;
  bullets: string[];
  accent: string; // text color class
  accentBg: string; // subtle bg tint
  mockup: ReactNode;
}

/* ---------- faked product mockups (data from src/lib/mock/landing.ts) ---------- */

function FeedMockup() {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="border-border flex items-center gap-2 border-b pb-3 text-sm font-medium">
        <TrendingUp className="size-4 text-amber-500" />
        Trending now
      </div>
      <div className="mt-3 space-y-2">
        {trends.map((r) => (
          <div
            key={r.tag}
            className="bg-muted flex items-center justify-between rounded-lg px-3 py-2.5"
          >
            <span className="flex items-center gap-2 text-sm">
              <Flame className="size-3.5 text-amber-500" />
              {r.tag}
            </span>
            <span className="text-xs font-semibold text-amber-500">
              {r.delta}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function GenerateMockup() {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="border-border flex items-center gap-2 border-b pb-3 text-sm font-medium">
        <Sparkles className="size-4 text-violet-500" />
        Draft — LinkedIn post
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <p className="text-foreground/90">
          AI agents aren&apos;t coming for growth teams — they&apos;re joining
          them.
        </p>
        <p className="text-muted-foreground">
          Here are 5 workflows we automated this quarter
          <span className="ml-0.5 inline-block h-4 w-1.5 translate-y-0.5 animate-pulse bg-violet-500" />
        </p>
        <div className="mt-3 flex gap-2">
          <span className="rounded-full bg-violet-500/15 px-2.5 py-1 text-xs text-violet-600 dark:text-violet-300">
            On-brand voice
          </span>
          <span className="bg-secondary rounded-full px-2.5 py-1 text-xs">
            #growth
          </span>
        </div>
      </div>
    </div>
  );
}

function ReportMockup() {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="border-border flex items-center gap-2 border-b pb-3 text-sm font-medium">
        <BarChart3 className="size-4 text-emerald-500" />
        Engagement — last 6 weeks
      </div>
      <div className="mt-4 flex h-28 items-end gap-2">
        {engagementSeries.map((h, i) => (
          <div
            key={i}
            className="flex-1 rounded-t bg-gradient-to-t from-emerald-500/40 to-emerald-500"
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <p className="mt-3 flex items-center gap-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
        <TrendingUp className="size-3.5" />
        {engagementDelta} vs. previous period
      </p>
    </div>
  );
}

function ChatMockup() {
  return (
    <div className="glass-card rounded-2xl p-4">
      <div className="border-border flex items-center gap-2 border-b pb-3 text-sm font-medium">
        <MessageSquare className="size-4 text-cyan-500" />
        Ask Growth Studio
      </div>
      <div className="mt-3 space-y-2 text-sm">
        <div className="bg-secondary ml-auto w-fit max-w-[80%] rounded-2xl rounded-br-sm px-3 py-2">
          What should we post about this week?
        </div>
        <div className="w-fit max-w-[85%] rounded-2xl rounded-bl-sm bg-cyan-500/15 px-3 py-2 text-cyan-700 dark:text-cyan-100">
          “AI Agents” is spiking {trends[0].delta}. Draft a thread now?
        </div>
      </div>
    </div>
  );
}

const features: Feature[] = [
  {
    key: 'feed',
    eyebrow: 'Trend Feed',
    title: 'See what’s trending before everyone else',
    description:
      'A live pulse of the topics moving in your space, ranked by momentum so you never miss the wave.',
    bullets: ['Real-time momentum scores', 'Filtered to your niche', 'Hot-topic alerts'],
    accent: 'text-amber-500',
    accentBg: 'bg-amber-500/10',
    mockup: <FeedMockup />,
  },
  {
    key: 'generate',
    eyebrow: 'Content Generation',
    title: 'On-brand content in seconds, not hours',
    description:
      'Turn any trend into a ready-to-post draft that sounds like your team — not a robot.',
    bullets: ['Learns your voice', 'Multi-platform formats', 'One-click variations'],
    accent: 'text-violet-500',
    accentBg: 'bg-violet-500/10',
    mockup: <GenerateMockup />,
  },
  {
    key: 'report',
    eyebrow: 'Analytics',
    title: 'Measure what actually drives growth',
    description:
      'Clear reports and AI insights on what performed — so you double down on what works.',
    bullets: ['Engagement over time', 'AI-written takeaways', 'Exportable reports'],
    accent: 'text-emerald-500',
    accentBg: 'bg-emerald-500/10',
    mockup: <ReportMockup />,
  },
  {
    key: 'chat',
    eyebrow: 'Ask Growth Studio',
    title: 'Your always-on growth strategist',
    description:
      'Ask questions in plain language and get answers grounded in your trends and content.',
    bullets: ['Grounded in your data', 'Instant recommendations', 'Draft from chat'],
    accent: 'text-cyan-500',
    accentBg: 'bg-cyan-500/10',
    mockup: <ChatMockup />,
  },
];

export function FeatureShowcase() {
  return (
    <Section
      id="features"
      centered
      eyebrow="Everything in one workspace"
      title={
        <>
          One platform, from{' '}
          <span className="gradient-text">trend to result</span>
        </>
      }
      description="Growth Studio connects the whole loop — spot the trend, create the content, prove the impact."
    >
      <div className="space-y-16 sm:space-y-24">
        {features.map((feature, i) => {
          const reversed = i % 2 === 1;
          return (
            <Reveal key={feature.key}>
              <div className="grid items-center gap-8 lg:grid-cols-2 lg:gap-16">
                {/* Copy */}
                <div className={cn(reversed && 'lg:order-2')}>
                  <div
                    className={cn(
                      'mb-4 inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-medium',
                      feature.accentBg,
                      feature.accent,
                    )}
                  >
                    {feature.eyebrow}
                  </div>
                  <h3 className="text-2xl font-bold tracking-tight sm:text-3xl">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground mt-3 text-base">
                    {feature.description}
                  </p>
                  <ul className="mt-6 space-y-2.5">
                    {feature.bullets.map((b) => (
                      <li key={b} className="flex items-center gap-2.5 text-sm">
                        <span
                          className={cn(
                            'flex size-5 shrink-0 items-center justify-center rounded-full',
                            feature.accentBg,
                          )}
                        >
                          <Check className={cn('size-3', feature.accent)} />
                        </span>
                        {b}
                      </li>
                    ))}
                  </ul>
                </div>

                {/* Mockup */}
                <div className={cn(reversed && 'lg:order-1')}>
                  {feature.mockup}
                </div>
              </div>
            </Reveal>
          );
        })}
      </div>
    </Section>
  );
}
