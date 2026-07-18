import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import {
  DEFAULT_FORMATS,
  generateContent,
  refineContent,
  saveDraft,
  type FormatId,
  type GeneratedFormats,
  type LanguageStyle,
  type YoutubeIdea,
} from '@/lib/api/content';
import { listStylePacks } from '@/lib/api/stylePacks';
import { getTeam } from '@/lib/api/teams';
import { useTeamId } from '@/lib/useTeamId';
import { useTour } from '@/context/tour-context';
import { PAGE_TOURS } from '@/lib/tours';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { GenerateControls } from '@/components/generate/GenerateControls';
import { FormatCard } from '@/components/generate/FormatCard';
import { YoutubeIdeaCard } from '@/components/generate/YoutubeIdeaCard';
import { PageHelp } from '@/components/dashboard/PageHelp';

interface LocationState {
  newsItemId?: string;
  topic?: string;
}

interface EditorEntry {
  text: string | YoutubeIdea;
  previousText?: string | YoutubeIdea;
}

export default function Generate() {
  const location = useLocation();
  const navigate = useNavigate();
  const teamId = useTeamId();
  const { startTour } = useTour();
  const state = (location.state ?? {}) as LocationState;
  const newsItemId = state.newsItemId;

  const [manualTopic, setManualTopic] = useState('');
  const [languageOverride, setLanguageOverride] = useState<LanguageStyle | undefined>(undefined);
  const [stylePackId, setStylePackId] = useState<string | undefined>(undefined);
  const [selectedFormats, setSelectedFormats] = useState<FormatId[]>(DEFAULT_FORMATS);
  const [editor, setEditor] = useState<Partial<Record<FormatId, EditorEntry>>>({});

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

  // Derived, not synced via effect: no local state needs to "catch up" once the team loads.
  const language = languageOverride ?? teamQuery.data?.team.voice_profile?.default_language ?? 'bangla';
  const topic = newsItemId ? (state.topic ?? '') : manualTopic;
  const stylePacks = stylePacksQuery.data ?? [];

  const generateMutation = useMutation({
    mutationFn: generateContent,
    onSuccess: (response) => {
      const next: Partial<Record<FormatId, EditorEntry>> = {};
      for (const [key, value] of Object.entries(response)) {
        if (key === 'topic' || value === undefined) continue;
        next[key as FormatId] = { text: value as string | YoutubeIdea };
      }
      setEditor(next);
    },
    onError: (err: Error) => toast.error(err.message || 'Generation failed'),
  });

  const regenerateMutation = useMutation({
    mutationFn: (format: FormatId) =>
      generateContent({
        team_id: teamId as string,
        topic,
        news_item_id: newsItemId,
        language,
        style_pack_id: stylePackId,
        formats: [format],
        regenerate: true,
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
      }),
    onError: (err: Error) => toast.error(err.message || 'Refine failed'),
  });

  const saveMutation = useMutation({
    mutationFn: saveDraft,
    onSuccess: () => {
      toast.success('Draft saved', {
        action: { label: 'View drafts', onClick: () => navigate('/dashboard/drafts') },
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
      <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
        <h1 className="text-lg font-semibold">Generate</h1>
        <p className="text-sm text-muted-foreground">You need to belong to a team to generate content.</p>
      </div>
    );
  }

  const editorEntries = Object.entries(editor) as [FormatId, EditorEntry][];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">Generate</h1>
        <PageHelp guideKey="generate" onStartTour={() => startTour(PAGE_TOURS.generate)} />
      </div>

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

          <Button
            onClick={handleSaveDraft}
            disabled={saveMutation.isPending}
            variant="outline"
            className="w-fit"
          >
            {saveMutation.isPending ? 'Saving…' : 'Save draft'}
          </Button>
        </>
      )}
    </div>
  );
}
