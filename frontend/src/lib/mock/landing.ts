/**
 * Single source of truth for the landing page's demo content. Keeping every
 * figure here means numbers stay consistent across sections (e.g. the "AI Agents
 * +184%" trend shown in the hero matches the feature-showcase feed mockup).
 * Fictional but realistic — no real customer data.
 */

export interface Trend {
  tag: string;
  /** Weekly momentum, e.g. "+184%". */
  delta: string;
  hot: boolean;
}

/** Trending topics — mirrors the values shown in the (locked) Hero mockup. */
export const trends: Trend[] = [
  { tag: 'AI Agents', delta: '+184%', hot: true },
  { tag: 'RAG pipelines', delta: '+96%', hot: true },
  { tag: 'Edge inference', delta: '+42%', hot: false },
];

export interface HeadlineStat {
  value: string;
  label: string;
}

export const headlineStats: HeadlineStat[] = [
  { value: '10k+', label: 'trends tracked daily' },
  { value: '10x', label: 'faster from trend to published post' },
  { value: '38%', label: 'average lift in engagement' },
  { value: '6', label: 'channels supported' },
];

/** Fictional company wordmarks for the social-proof strip. */
export const logos = [
  'Northwind',
  'Lumen',
  'Vertex',
  'Contoso',
  'Hooli',
  'Initech',
];

/** Channels/sources Growth Studio pulls trends from and publishes to. */
export const integrations = [
  'LinkedIn',
  'X',
  'Instagram',
  'YouTube',
  'TikTok',
  'Reddit',
];

export interface Testimonial {
  name: string;
  role: string;
  company: string;
  initials: string;
  quote: string;
}

export const testimonials: Testimonial[] = [
  {
    name: 'Maya Chen',
    role: 'Head of Growth',
    company: 'Vertex',
    initials: 'MC',
    quote:
      'Growth Studio catches trends days before they hit our radar. Our content finally feels timely instead of reactive.',
  },
  {
    name: 'Daniel Okafor',
    role: 'Content Lead',
    company: 'Lumen',
    initials: 'DO',
    quote:
      'Drafts come out on-brand on the first try. It cut our production time roughly in half.',
  },
  {
    name: 'Priya Nair',
    role: 'Founder',
    company: 'Northwind',
    initials: 'PN',
    quote:
      'The analytics tell me exactly what to make more of. There is no guesswork anymore.',
  },
  {
    name: 'Tom Reyes',
    role: 'Social Manager',
    company: 'Contoso',
    initials: 'TR',
    quote:
      'Asking Growth Studio what to post is now the first thing I do every morning.',
  },
];

/** Headline proof metric for the "Why Growth Studio" bento. */
export const bentoOutcome = {
  value: '10x',
  headline: 'faster from trend to published content',
  detail: 'No more staring at a blank page — go from signal to post in minutes.',
};

export interface BentoCapability {
  title: string;
  body: string;
}

export const bentoCapabilities: BentoCapability[] = [
  {
    title: 'Real-time trend radar',
    body: 'Momentum scores update continuously so you are always early.',
  },
  {
    title: 'On-brand by default',
    body: 'Trained on your voice so every draft sounds like your team.',
  },
  {
    title: 'Multi-channel drafts',
    body: 'Write once, adapt for every channel automatically.',
  },
];
