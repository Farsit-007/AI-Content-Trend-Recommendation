import type * as React from 'react';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

type ButtonProps = React.ComponentProps<typeof Button>;

interface ConfirmButtonProps extends Omit<ButtonProps, 'onClick'> {
  /** Short question, e.g. `Delete team "Growth"?`. Becomes the dialog's accessible name. */
  title: string;
  /** The consequence, spelled out. This is where the old confirm() copy belongs. */
  description?: React.ReactNode;
  /** Label on the confirming button. Name the action — never "OK". */
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm action as destructive. On by default: every current caller deletes. */
  destructive?: boolean;
  onConfirm: () => void;
}

/**
 * A trigger button wired to an `AlertDialog`, replacing the `window.confirm()` calls that used to
 * guard every destructive action. Those were unstyled OS dialogs — they ignored the theme, could
 * not be restyled, and on mobile rendered as a system alert detached from the app.
 *
 * Deliberately self-contained rather than a `useConfirm()` provider: each call site owns its own
 * dialog state, so no provider has to be threaded through the tree.
 */
export function ConfirmButton({
  title,
  description,
  confirmLabel = 'Delete',
  cancelLabel = 'Cancel',
  destructive = true,
  onConfirm,
  children,
  ...buttonProps
}: ConfirmButtonProps) {
  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button {...buttonProps}>{children}</Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {description && <AlertDialogDescription>{description}</AlertDialogDescription>}
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={onConfirm}
            className={cn(destructive && buttonVariants({ variant: 'destructive' }))}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
