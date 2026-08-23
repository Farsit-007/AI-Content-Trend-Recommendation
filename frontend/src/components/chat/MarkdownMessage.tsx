import { Children, cloneElement, isValidElement, useState, type ReactNode } from 'react';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Check, Copy, FileText, Inbox, Newspaper, Palette } from 'lucide-react';

import type { ChatSourceRef } from '@/lib/api/chat';

/**
 * An assistant reply, rendered.
 *
 * Answers are content — lists, code, and tables were previously flattened into one
 * `whitespace-pre-wrap` blob, which made a well-structured answer read worse than a plain one.
 *
 * `react-markdown` does not render raw HTML unless `rehype-raw` is added, which it deliberately is
 * not: the text comes from a language model quoting retrieved web content, so treating any of it as
 * markup would be an injection path straight through to the DOM.
 */

const SOURCE_ICON: Record<ChatSourceRef['source'], typeof Newspaper> = {
  news_item: Newspaper,
  draft: Inbox,
  brand_voice: Palette,
  team_profile: FileText,
};

/** Matches `[1]` and `[2, 3]` — the citation form the system prompt asks the model to produce. */
const CITATION = /\[(\d+(?:\s*,\s*\d+)*)\]/g;

function CitationChip({ n, source }: { n: number; source?: ChatSourceRef }) {
  const Icon = source ? SOURCE_ICON[source.source] : Newspaper;
  const label = source?.label ?? `Source ${n}`;
  // A `title` alone is invisible to a screen reader and unreachable by keyboard, which would make
  // the citation — the thing that makes the answer verifiable — available only to mouse users.
  const described = source ? `${label} (${source.source.replace('_', ' ')})` : `Source ${n}`;

  return (
    <span
      tabIndex={0}
      title={described}
      aria-label={described}
      className="mx-0.5 inline-flex items-center gap-1 rounded-full border border-violet-400/40 bg-violet-400/10 px-1.5 align-middle text-[11px] leading-4 text-violet-300"
    >
      <Icon className="size-2.5 shrink-0" aria-hidden />
      {n}
    </span>
  );
}

/**
 * Replaces citation markers inside text with chips.
 *
 * Done on the rendered React tree rather than on the markdown source, because rewriting the source
 * would mean injecting markup — the very thing this component refuses to render.
 *
 * Elements are recursed into as well as strings, guarded on `children` actually being present: a
 * model routinely writes **bold claims [2]** or a list item with emphasis, and stopping at the first
 * element boundary left those citations rendered as literal `[2]` text while their neighbours became
 * chips — inconsistent in exactly the places an answer puts its most important claims.
 */
const withCitations = (node: ReactNode, sources: ChatSourceRef[]): ReactNode => {
  if (typeof node === 'string') {
    CITATION.lastIndex = 0;
    if (!CITATION.test(node)) return node;
    CITATION.lastIndex = 0;

    const out: ReactNode[] = [];
    let cursor = 0;
    let match: RegExpExecArray | null = CITATION.exec(node);

    while (match !== null) {
      if (match.index > cursor) out.push(node.slice(cursor, match.index));
      for (const raw of match[1].split(',')) {
        const n = Number(raw.trim());
        out.push(
          <CitationChip key={`${match.index}-${n}`} n={n} source={sources.find((s) => s.n === n)} />,
        );
      }
      cursor = match.index + match[0].length;
      match = CITATION.exec(node);
    }
    if (cursor < node.length) out.push(node.slice(cursor));
    return out;
  }

  if (Array.isArray(node)) {
    return node.map((child, i) => <span key={i}>{withCitations(child, sources)}</span>);
  }

  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children != null) {
    return cloneElement(node, undefined, withCitations(node.props.children, sources));
  }

  return node;
};

function CodeBlock({ children }: { children: ReactNode }) {
  const [copied, setCopied] = useState(false);

  const text = Children.toArray(children)
    .map((child) =>
      typeof child === 'string'
        ? child
        : isValidElement<{ children?: ReactNode }>(child)
          ? String(child.props.children ?? '')
          : '',
    )
    .join('');

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // A blocked clipboard is not worth a toast here — the text is selectable either way.
    }
  };

  return (
    <div className="group/code relative my-2">
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy code'}
        className="absolute top-1.5 right-1.5 rounded-md border border-border bg-background/80 p-1.5 opacity-0 transition group-hover/code:opacity-100 focus-visible:opacity-100"
      >
        {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
      </button>
      {/* Wide code scrolls inside its own box rather than widening the whole message column. */}
      <pre className="overflow-x-auto rounded-lg border border-border bg-background/60 p-3 text-xs">
        {children}
      </pre>
    </div>
  );
}

export function MarkdownMessage({
  content,
  sources = [],
}: {
  content: string;
  sources?: ChatSourceRef[];
}) {
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed [&_a]:underline [&_a]:underline-offset-2">
      <Markdown
        remarkPlugins={[remarkGfm]}
        components={{
          p: ({ children }) => <p>{withCitations(children, sources)}</p>,
          li: ({ children }) => <li>{withCitations(children, sources)}</li>,
          ul: ({ children }) => <ul className="ml-4 list-disc space-y-1">{children}</ul>,
          ol: ({ children }) => <ol className="ml-4 list-decimal space-y-1">{children}</ol>,
          strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
          h1: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
          h2: ({ children }) => <h3 className="text-base font-semibold">{children}</h3>,
          h3: ({ children }) => <h4 className="font-semibold">{children}</h4>,
          pre: ({ children }) => <CodeBlock>{children}</CodeBlock>,
          code: ({ className, children }) =>
            // Inline code only — a fenced block arrives wrapped in <pre>, handled above.
            className?.includes('language-') ? (
              <code className={className}>{children}</code>
            ) : (
              <code className="rounded bg-background/60 px-1 py-0.5 text-[0.85em]">{children}</code>
            ),
          a: ({ href, children }) => (
            <a href={href} target="_blank" rel="noreferrer noopener">
              {children}
            </a>
          ),
          table: ({ children }) => (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-xs">{children}</table>
            </div>
          ),
          th: ({ children }) => (
            <th className="border border-border px-2 py-1 text-left">{children}</th>
          ),
          td: ({ children }) => <td className="border border-border px-2 py-1">{children}</td>,
          blockquote: ({ children }) => (
            <blockquote className="border-l-2 border-violet-400/40 pl-3 text-muted-foreground">
              {withCitations(children, sources)}
            </blockquote>
          ),
        }}
      >
        {content}
      </Markdown>
    </div>
  );
}
