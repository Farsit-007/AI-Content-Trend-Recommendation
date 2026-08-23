import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Check, Sparkles } from 'lucide-react';
import {
  DEFAULT_FORMATS,
  generateContent,
  generateContentStream,
  refineContent,
  saveDraft,
  type FormatId,
  type GeneratedFormats,
  type LanguageStyle,
  type YoutubeIdea,
} from '@/lib/api/content';
import { listStylePacks } from '@/lib/api/stylePacks';
import { listActiveLlmModels } from '@/lib/api/llmProviders';
import { getTeam } from '@/lib/api/teams';
import { useTeamId } from '@/lib/useTeamId';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GenerateControls } from '@/components/generate/GenerateControls';
import { FormatCard } from '@/components/generate/FormatCard';
import { YoutubeIdeaCard } from '@/components/generate/YoutubeIdeaCard';
import { EmptyState } from '@/components/ui/empty-state';
import { PageHeader } from '@/components/dashboard/PageHeader';

interface LocationState {
  newsItemId?: string;
  topic?: string;
}

interface EditorEntry {
  text: string | YoutubeIdea;
  previousText?: string | YoutubeIdea;
}

/**
 * `embedded` is set when Studio renders this as a tab — it already shows the page header, so a
 * second one would stack two titles. Standalone rendering (a direct route, a test) keeps its own.
 */
export default function Generate({ embedded = false }: { embedded?: boolean } = {}) {
  const location = useLocation();
  const navigate = useNavigate();
  const teamId = useTeamId();
  const state = (location.state ?? {}) as LocationState;
  const newsItemId = state.newsItemId;

  const [manualTopic, setManualTopic] = useState('');
  const [languageOverride, setLanguageOverride] = useState<LanguageStyle | undefined>(undefined);
  const [stylePackId, setStylePackId] = useState<string | undefined>(undefined);
  const [llmModelId, setLlmModelId] = useState<string | undefined>(undefined);
  const [selectedFormats, setSelectedFormats] = useState<FormatId[]>(DEFAULT_FORMATS);
  const [editor, setEditor] = useState<Partial<Record<FormatId, EditorEntry>>>({});
  /** Set once a generation has been persisted, so Save does not create a second copy of it. */
  const [savedDraftId, setSavedDraftId] = useState<string | undefined>(undefined);
  const queryClient = useQueryClient();

  const teamQuery = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId as string),
    enabled: Boolean(teamId),
  });

  const stylePacksQuery = useQuery({
    queryKey: ['style-packs'],
    queryFn: () => listStylePacks(),
    retry: false,
  });

  const activeModelsQuery = useQuery({
    queryKey: ['llm-active-models'],
    queryFn: () => listActiveLlmModels(),
    retry: false,
  });

  // Derived, not synced via effect: no local state needs to "catch up" once the team loads.
  const language = languageOverride ?? teamQuery.data?.team.voice_profile?.default_language ?? 'bangla';
  const topic = newsItemId ? (state.topic ?? '') : manualTopic;
  const stylePacks = stylePacksQuery.data ?? [];
  const activeModels = activeModelsQuery.data ?? [];

  /**
   * Streams generation, adding each format's card the moment that format finishes.
   *
   * The buffered endpoint held one request open across a fact-extraction call plus one call per
   * format plus an optional critique pass each — long enough to hit a proxy timeout and lose work
   * that had already been paid for and produced. Now the first card lands in seconds, and a format
   * that fails takes only its own card down with it.
   */
  const generateMutation = useMutation({
    mutationKey: ['content-generation'],
    mutationFn: async (payload: Parameters<typeof generateContent>[0]) => {
      // Cleared up front so a re-run doesn't leave the previous run's cards on screen while the new
      // ones trickle in — the two sets would be indistinguishable.
      setEditor({});
      setSavedDraftId(undefined);

      const produced: GeneratedFormats = {};

      await generateContentStream(payload, {
        onFormat: (format, value) => {
          setEditor((prev) => ({ ...prev, [format]: { text: value } }));
          produced[format] = value;
        },
        onFormatError: (format, message) => toast.error(`${format}: ${message}`),
      });

      // Autosave. Until now generated text lived only in React state until the user clicked Save,
      // so a closed tab, a navigation, or a refresh threw away output that had already been paid
      // for. Persisting as soon as the stream finishes makes that impossible to lose.
      //
      // Recording the id is what keeps this from doubling the Library: with a draft already saved,
      // the explicit Save button steps aside rather than creating a second copy of the same
      // generation. Failure is a warning, not an error — the text is still on screen and Save still
      // works, so the user loses nothing.
      if (Object.keys(produced).length === 0) return;

      try {
        const saved = await saveDraft({
          team_id: payload.team_id,
          news_item_id: payload.news_item_id,
          topic: payload.topic,
          formats: produced,
        });
        setSavedDraftId(saved._id);
        queryClient.invalidateQueries({ queryKey: ['drafts'] });
      } catch {
        toast.warning('Generated, but could not autosave — use Save draft to keep it.');
      }
    },
    onError: (err: Error) => toast.error(err.message || 'Generation failed'),
  });

  const regenerateMutation = useMutation({
    mutationKey: ['content-generation'],
    mutationFn: (format: FormatId) =>
      generateContent({
        team_id: teamId as string,
        topic,
        news_item_id: newsItemId,
        language,
        style_pack_id: stylePackId,
        llm_model_id: llmModelId,
        formats: [format],
      }),
    onError: (err: Error) => toast.error(err.message || 'Regenerate failed'),
  });

  const refineMutation = useMutation({
    mutationFn: (payload: { format: FormatId; instruction: string; currentText: string }) =>
      refineContent({
        team_id: teamId as string,
        format: payload.format,
        current_text: payload.currentText,
        instruction: payload.instruction,
        language,
        style_pack_id: stylePackId,
        llm_model_id: llmModelId,
      }),
    onError: (err: Error) => toast.error(err.message || 'Refine failed'),
  });

  const saveMutation = useMutation({
    mutationFn: saveDraft,
    onSuccess: () => {
      toast.success('Draft saved', {
        action: { label: 'View drafts', onClick: () => navigate('/dashboard/studio?tab=library') },
      });
    },
    onError: (err: Error) => toast.error(err.message || 'Save failed'),
  });

  const toggleFormat = (format: FormatId) => {
    setSelectedFormats((prev) => (prev.includes(format) ? prev.filter((f) => f !== format) : [...prev, format]));
  };

  const handleGenerate = () => {
    if (!teamId) return;
    generateMutation.mutate({
      team_id: teamId,
      topic,
      news_item_id: newsItemId,
      language,
      style_pack_id: stylePackId,
      llm_model_id: llmModelId,
      formats: selectedFormats,
    });
  };

  const handleRegenerate = (format: FormatId) => {
    regenerateMutation.mutate(format, {
      onSuccess: (response) => {
        const value = response[format];
        if (value === undefined) return;
        setEditor((prev) => ({
          ...prev,
          [format]: { text: value, previousText: prev[format]?.text },
        }));
      },
    });
  };

  const handleRefine = (format: FormatId, instruction: string) => {
    const currentText = editor[format]?.text;
    if (typeof currentText !== 'string') return;
    refineMutation.mutate(
      { format, instruction, currentText },
      {
        onSuccess: (response) => {
          setEditor((prev) => ({
            ...prev,
            [format]: { text: response.revised_text, previousText: currentText },
          }));
        },
      },
    );
  };

  const handleUndo = (format: FormatId) => {
    setEditor((prev) => {
      const entry = prev[format];
      if (!entry || entry.previousText === undefined) return prev;
      return { ...prev, [format]: { text: entry.previousText, previousText: undefined } };
    });
  };

  const handleSaveDraft = () => {
    if (!teamId) return;
    const formats: GeneratedFormats = {};
    for (const [format, entry] of Object.entries(editor)) {
      if (entry) formats[format as FormatId] = entry.text;
    }
    if (Object.keys(formats).length === 0) {
      toast.error('Generate something before saving');
      return;
    }
    saveMutation.mutate({ team_id: teamId, news_item_id: newsItemId, topic, formats });
  };

  if (!teamId) {
    return (
      <div className="flex flex-col gap-4">
        {!embedded && <PageHeader title="Generate" icon={Sparkles} guideKey="generate" />}
        <div className="glass-card rounded-xl">
          <EmptyState
            icon={Sparkles}
            title="No team yet"
            description="Generation is team-scoped — it needs a team's voice and brand-voice examples."
          />
        </div>
      </div>
    );
  }

  const editorEntries = Object.entries(editor) as [FormatId, EditorEntry][];

  return (
    <div className="flex flex-col gap-4">
      {!embedded && (
        <PageHeader
          title="Generate"
          icon={Sparkles}
          guideKey="generate"
          description="Turn a story or a topic into ready-to-post drafts, in your team's voice."
        />
      )}

      <div data-tour="generate-controls">
      <GenerateControls
        newsItemContext={newsItemId ? { title: state.topic ?? 'Selected item' } : undefined}
        topic={manualTopic}
        onTopicChange={setManualTopic}
        language={language}
        onLanguageChange={setLanguageOverride}
        stylePacks={stylePacks}
        stylePackId={stylePackId}
        onStylePackChange={setStylePackId}
        activeModels={activeModels}
        llmModelId={llmModelId}
        onLlmModelChange={setLlmModelId}
        selectedFormats={selectedFormats}
        onToggleFormat={toggleFormat}
        onGenerate={handleGenerate}
        isGenerating={generateMutation.isPending}
      />
      </div>

      {generateMutation.isPending && (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          {selectedFormats.map((format) => (
            <div key={format} className="glass-card flex flex-col gap-3 rounded-xl p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-3 w-24" />
            </div>
          ))}
        </div>
      )}

      {!generateMutation.isPending && editorEntries.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            {editorEntries.map(([format, entry]) =>
              format === 'youtube_idea' ? (
                <YoutubeIdeaCard key={format} idea={entry.text as YoutubeIdea} />
              ) : (
                <FormatCard
                  key={format}
                  format={format}
                  text={entry.text as string}
                  previousText={entry.previousText as string | undefined}
                  onChange={(text) => setEditor((prev) => ({ ...prev, [format]: { ...prev[format]!, text } }))}
                  onRegenerate={() => handleRegenerate(format)}
                  onRefine={(instruction) => handleRefine(format, instruction)}
                  onUndo={() => handleUndo(format)}
                  isRegenerating={regenerateMutation.isPending && regenerateMutation.variables === format}
                  isRefining={refineMutation.isPending && refineMutation.variables?.format === format}
                />
              ),
            )}
          </div>

          {savedDraftId ? (
            // Already persisted by the autosave above. Offering Save here again would file a second
            // copy of the same generation, so the affordance becomes a way to go look at it.
            <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Check className="size-3.5 text-emerald-400" />
              Saved to your Library.
              <button
                type="button"
                onClick={() => navigate('/dashboard/studio?tab=library')}
                className="underline underline-offset-2 hover:text-foreground"
              >
                View it
              </button>
            </p>
          ) : (
            <Button
              onClick={handleSaveDraft}
              disabled={saveMutation.isPending}
              variant="outline"
              className="w-fit"
            >
              {saveMutation.isPending ? 'Saving…' : 'Save draft'}
            </Button>
          )}
        </>
      )}
    </div>
  );
}
