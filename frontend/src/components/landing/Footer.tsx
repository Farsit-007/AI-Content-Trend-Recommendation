import { Link } from 'react-router-dom';
import { AtSign, MessageCircle, Globe } from 'lucide-react';

const productLinks = [
  { label: 'Trend Feed', to: '/dashboard/feed' },
  { label: 'Generate', to: '/dashboard/generate' },
  { label: 'Reports', to: '/dashboard/report' },
  { label: 'Ask', to: '/dashboard/chat' },
];

const companyLinks = [
  { label: 'About', to: '/about' },
  { label: 'Log in', to: '/login' },
];

const socials = [
  { label: 'X', href: 'https://x.com', icon: AtSign },
  { label: 'Community', href: 'https://discord.com', icon: MessageCircle },
  { label: 'Website', href: 'https://growthstudio.app', icon: Globe },
];

export function Footer() {
  return (
    <footer className="border-border border-t py-12">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="lg:col-span-2">
            <Link to="/" className="text-lg font-semibold tracking-tight">
              <span className="gradient-text">Growth Studio</span>
            </Link>
            <p className="text-muted-foreground mt-3 max-w-xs text-sm">
              AI content &amp; trend intelligence — spot trends, create content,
              and measure what works.
            </p>
            <div className="mt-5 flex gap-3">
              {socials.map((s) => (
                <a
                  key={s.label}
                  href={s.href}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={s.label}
                  className="glass-card text-muted-foreground hover:text-foreground flex size-9 items-center justify-center rounded-lg transition-colors"
                >
                  <s.icon className="size-4" />
                </a>
              ))}
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Product</h3>
            <ul className="mt-4 space-y-2.5">
              {productLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold">Company</h3>
            <ul className="mt-4 space-y-2.5">
              {companyLinks.map((l) => (
                <li key={l.label}>
                  <Link
                    to={l.to}
                    className="text-muted-foreground hover:text-foreground text-sm transition-colors"
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <div className="text-muted-foreground border-border mt-10 border-t pt-6 text-center text-sm">
          © {new Date().getFullYear()} Growth Studio. All rights reserved.
        </div>
      </div>
    </footer>
  );
}
