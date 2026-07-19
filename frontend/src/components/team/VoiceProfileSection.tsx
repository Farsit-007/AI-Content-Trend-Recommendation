import { useForm } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { ExpandableTextarea } from '@/components/ui/expandable-textarea';
import { Form, FormControl, FormField, FormItem, FormLabel } from '@/components/ui/form';
import { cn } from '@/lib/utils';
import type { TeamVoiceProfile } from '@/lib/api/teams';

const LANGUAGE_OPTIONS: { value: TeamVoiceProfile['default_language']; label: string }[] = [
  { value: 'bangla', label: 'বাংলা' },
  { value: 'english', label: 'English' },
];

interface VoiceProfileFormValues {
  default_language: TeamVoiceProfile['default_language'];
  custom_instructions: string;
}

interface VoiceProfileSectionProps {
  voiceProfile: TeamVoiceProfile | undefined;
  canManageTeam: boolean;
  isSaving: boolean;
  onSave: (profile: TeamVoiceProfile) => void;
}

export function VoiceProfileSection({ voiceProfile, canManageTeam, isSaving, onSave }: VoiceProfileSectionProps) {
  const form = useForm<VoiceProfileFormValues>({
    defaultValues: {
      default_language: voiceProfile?.default_language ?? 'bangla',
      custom_instructions: voiceProfile?.custom_instructions ?? '',
    },
  });

  const instructions = form.watch('custom_instructions');

  const submit = form.handleSubmit((values) => {
    onSave({
      default_language: values.default_language,
      custom_instructions: values.custom_instructions.trim() || undefined,
    });
  });

  return (
    <section className="glass-card flex flex-col gap-4 rounded-xl p-6">
      <div>
        <h2 className="text-lg font-semibold">Voice profile</h2>
        <p className="text-sm text-muted-foreground">
          Sets the default language and standing writing rules every generation follows.
        </p>
      </div>

      <Form {...form}>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <FormField
            control={form.control}
            name="default_language"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Default language</FormLabel>
                <FormControl>
                  <div className="inline-flex w-fit rounded-md border border-border p-0.5">
                    {LANGUAGE_OPTIONS.map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        disabled={!canManageTeam}
                        onClick={() => field.onChange(option.value)}
                        className={cn(
                          'rounded px-3 py-1 text-sm transition disabled:cursor-not-allowed disabled:opacity-60',
                          field.value === option.value
                            ? 'bg-violet-600 text-white'
                            : 'text-muted-foreground hover:text-foreground',
                        )}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </FormControl>
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="custom_instructions"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Custom instructions</FormLabel>
                <FormControl>
                  <ExpandableTextarea
                    {...field}
                    disabled={!canManageTeam}
                    maxLength={500}
                    rows={4}
                    placeholder="e.g. always end with a question, never use more than 2 emojis, audience is beginner developers"
                    expandTitle="Custom instructions"
                  />
                </FormControl>
                <p className="text-right text-xs text-muted-foreground">{instructions.length}/500</p>
              </FormItem>
            )}
          />

          {canManageTeam ? (
            <Button
              type="submit"
              disabled={isSaving}
              className="btn-glow w-fit"
            >
              {isSaving ? 'Saving…' : 'Save voice profile'}
            </Button>
          ) : (
            <p className="text-xs text-muted-foreground">Ask a team admin to change this.</p>
          )}
        </form>
      </Form>
    </section>
  );
}
