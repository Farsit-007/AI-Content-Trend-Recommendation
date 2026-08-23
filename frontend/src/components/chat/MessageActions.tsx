import { useState } from 'react';
import { Check, Copy, RotateCcw } from 'lucide-react';

/**
 * Per-message controls, revealed on hover.
 *
 * Kept out of the message bubble's flow so they never reflow the text as it streams, and always
 * mounted rather than conditionally rendered — appearing only on hover is a CSS concern, and
 * mounting on hover would make them unreachable by keyboard.
 */
export function MessageActions({
  content,
  onRegenerate,
  regenerateDisabled = false,
}: {
  content: string;
  onRegenerate?: () => void;
  regenerateDisabled?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Selectable text is the fallback; a failed clipboard write is not worth interrupting for.
    }
  };

  return (
    <div className="flex items-center gap-0.5 opacity-0 transition group-hover/msg:opacity-100 focus-within:opacity-100">
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? 'Copied' : 'Copy message'}
        className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground focus-visible:opacity-100"
      >
        {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
      </button>
      {onRegenerate && (
        <button
          type="button"
          onClick={onRegenerate}
          disabled={regenerateDisabled}
          aria-label="Regenerate this answer"
          className="rounded-md p-1 text-muted-foreground transition hover:bg-accent hover:text-foreground disabled:opacity-40"
        >
          <RotateCcw className="size-3" />
        </button>
      )}
    </div>
  );
}
