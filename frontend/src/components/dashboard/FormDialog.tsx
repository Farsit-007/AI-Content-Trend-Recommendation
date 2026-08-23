import type { ReactNode } from 'react';
import type { FieldValues, SubmitHandler, UseFormReturn } from 'react-hook-form';
import { Loader2 } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Form } from '@/components/ui/form';

interface FormDialogProps<TValues extends FieldValues> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  icon?: LucideIcon;
  form: UseFormReturn<TValues>;
  onSubmit: SubmitHandler<TValues>;
  submitLabel?: string;
  cancelLabel?: string;
  /** Disables the submit button and shows a spinner — pass the mutation's `isPending`. */
  isPending?: boolean;
  /** Extra footer content (e.g. a destructive action) rendered left of Cancel/Submit. */
  footerLeft?: ReactNode;
  submitVariant?: 'default' | 'destructive';
  className?: string;
  children: ReactNode;
}

/**
 * Every create/edit modal in the dashboard: Dialog chrome + react-hook-form context +
 * a consistent Cancel/Submit footer with pending state. Callers own the schema and the
 * fields; this owns the shape, so no two modals disagree about where the buttons live.
 */
export function FormDialog<TValues extends FieldValues>({
  open,
  onOpenChange,
  title,
  description,
  icon: Icon,
  form,
  onSubmit,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  isPending = false,
  footerLeft,
  submitVariant = 'default',
  className,
  children,
}: FormDialogProps<TValues>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn('sm:max-w-lg', className)}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {Icon && <Icon className="size-4 text-brand" />}
            {title}
          </DialogTitle>
          {description && <DialogDescription>{description}</DialogDescription>}
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="flex flex-col gap-4">
            <div className="flex flex-col gap-4">{children}</div>
            <DialogFooter className="gap-2 sm:justify-between">
              <div className="flex items-center gap-2">{footerLeft}</div>
              <div className="flex items-center gap-2">
                <DialogClose asChild>
                  <Button type="button" variant="ghost" disabled={isPending}>
                    {cancelLabel}
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  variant={submitVariant}
                  disabled={isPending}
                  className={cn('gap-2', submitVariant === 'default' && 'btn-glow')}
                >
                  {isPending && <Loader2 className="size-4 animate-spin" />}
                  {submitLabel}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
