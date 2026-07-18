import * as React from 'react';
import { Maximize2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';

const DEFAULT_MAX_AUTO_GROW_PX = 320;

export interface ExpandableTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Height (px) the box auto-grows to before switching to an internal scrollbar. Default 320. */
  maxAutoGrowPx?: number;
  /** Set false to hide the expand-to-full-view affordance (e.g. for an already-small, rarely-long field). */
  expandable?: boolean;
  /** Dialog heading shown in the full-view modal. */
  expandTitle?: string;
}

const textareaBaseClass =
  'w-full resize-y rounded-md border border-input bg-transparent px-3 py-2 text-sm text-foreground outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-60 dark:bg-input/30';

/**
 * Drop-in `<textarea>` replacement: auto-grows with content up to `maxAutoGrowPx` (generalizes the
 * technique already proven in FormatCard.tsx), supports native manual resize below that, and offers a
 * ChatGPT/Claude-style "expand to full view" modal whose textarea is bound to the exact same
 * value/onChange — so typing in either place is immediately reflected in the other, and closing the
 * modal never discards anything (there is no separate modal-only state to lose).
 *
 * Accepts the same value/onChange/onBlur/name/ref contract as a native textarea, so it works inside a
 * react-hook-form `{...field}` spread with no adapter code.
 */
export const ExpandableTextarea = React.forwardRef<HTMLTextAreaElement, ExpandableTextareaProps>(
  (
    {
      className,
      maxAutoGrowPx = DEFAULT_MAX_AUTO_GROW_PX,
      expandable = true,
      expandTitle = 'Edit',
      value,
      onChange,
      ...props
    },
    forwardedRef,
  ) => {
    const [open, setOpen] = React.useState(false);
    const innerRef = React.useRef<HTMLTextAreaElement>(null);

    // Exposes the inline textarea's DOM node to the forwarded ref while still letting this component
    // read from it internally (auto-grow needs direct DOM access to scrollHeight).
    React.useImperativeHandle(forwardedRef, () => innerRef.current as HTMLTextAreaElement);

    const resize = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      el.style.height = 'auto';
      el.style.height = `${Math.min(el.scrollHeight, maxAutoGrowPx)}px`;
    }, [maxAutoGrowPx]);

    // Re-run auto-grow whenever the value changes for any reason, not just direct user typing —
    // covers programmatic updates (e.g. a "Regenerate" call replacing the whole draft).
    React.useEffect(() => {
      resize();
    }, [value, resize]);

    // Not forwarding to a consumer-supplied `onInput` — none of this component's call sites use it,
    // and `onChange` (already wired above) is the contract every caller actually relies on.
    const handleInput = () => resize();

    return (
      <div className="relative w-full">
        <textarea
          ref={innerRef}
          value={value}
          onChange={onChange}
          onInput={handleInput}
          className={cn(textareaBaseClass, expandable && 'pr-8', className)}
          {...props}
        />
        {expandable && (
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            className="absolute top-1.5 right-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => setOpen(true)}
            aria-label="Expand to full view"
          >
            <Maximize2 className="size-3.5" />
          </Button>
        )}

        {expandable && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>{expandTitle}</DialogTitle>
              </DialogHeader>
              <textarea
                value={value}
                onChange={onChange}
                disabled={props.disabled}
                maxLength={props.maxLength}
                placeholder={props.placeholder}
                autoFocus
                className={cn(textareaBaseClass, 'min-h-[60vh] resize-none')}
              />
            </DialogContent>
          </Dialog>
        )}
      </div>
    );
  },
);
ExpandableTextarea.displayName = 'ExpandableTextarea';
