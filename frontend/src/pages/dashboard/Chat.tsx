import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';
import { Loader2, MessageSquare, Send, Sparkles } from 'lucide-react';
import { askChat } from '@/lib/api/chat';
import { getTeam } from '@/lib/api/teams';
import type { LanguageStyle } from '@/lib/api/content';
import { useTeamId } from '@/lib/useTeamId';
import { useTour } from '@/context/tour-context';
import { PAGE_TOURS } from '@/lib/tours';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHelp } from '@/components/dashboard/PageHelp';

const LANGUAGE_OPTIONS: { value: LanguageStyle; label: string }[] = [
  { value: 'bangla', label: 'বাংলা' },
  { value: 'english', label: 'English' },
  { value: 'banglish', label: 'Banglish' },
];

const SUGGESTED_PROMPTS = [
  "What's trending in AI right now?",
  'Summarize the top DevOps story this week',
  'Give me 3 content angles from today’s feed',
];

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

export default function Chat() {
  const teamId = useTeamId();
  const { startTour } = useTour();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [languageOverride, setLanguageOverride] = useState<LanguageStyle | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);

  const teamQuery = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId as string),
    enabled: Boolean(teamId),
  });
  const language = languageOverride ?? teamQuery.data?.team.voice_profile?.default_language ?? 'bangla';

  const chatMutation = useMutation({
    mutationFn: askChat,
    onSuccess: (response) => {
      setConversationId(response.conversation_id);
      setMessages((prev) => [...prev, { role: 'assistant', content: response.reply }]);
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Chat failed');
      setMessages((prev) => prev.slice(0, -1));
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, chatMutation.isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !teamId || chatMutation.isPending) return;
    setMessages((prev) => [...prev, { role: 'user', content: trimmed }]);
    setInput('');
    chatMutation.mutate({ team_id: teamId, message: trimmed, conversation_id: conversationId, language });
  };

  if (!teamId) {
    return (
      <div className="glass-card flex flex-col items-center gap-2 rounded-xl p-8 text-center">
        <h1 className="text-lg font-semibold">Chat</h1>
        <p className="text-sm text-muted-foreground">You need to belong to a team to ask Growth Studio.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100svh-8rem)] flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">
            Ask <span className="gradient-text">Growth Studio</span>
          </h1>
          <p className="text-sm text-muted-foreground">
            News-grounded Q&A — answers are pulled from your team's feed, not general knowledge.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex w-fit rounded-md border border-white/10 p-0.5">
            {LANGUAGE_OPTIONS.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => setLanguageOverride(option.value)}
                className={cn(
                  'rounded px-3 py-1 text-sm transition',
                  language === option.value ? 'bg-violet-600 text-white' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {option.label}
              </button>
            ))}
          </div>
          <PageHelp guideKey="chat" onStartTour={() => startTour(PAGE_TOURS.chat)} />
        </div>
      </div>

      <div ref={scrollRef} className="glass-card flex-1 overflow-y-auto rounded-xl p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-violet-400/10">
              <MessageSquare className="size-6 text-violet-300" />
            </div>
            <div>
              <p className="font-medium text-foreground">Ask anything about your feed</p>
              <p className="text-sm text-muted-foreground">
                Try one of these, or type your own question below.
              </p>
            </div>
            <div className="flex flex-wrap justify-center gap-2">
              {SUGGESTED_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  onClick={() => send(prompt)}
                  className="rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground transition hover:border-violet-400/40 hover:text-foreground"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((turn, i) => (
              <div
                key={i}
                className={cn('flex', turn.role === 'user' ? 'justify-end' : 'justify-start')}
              >
                <div
                  className={cn(
                    'max-w-[85%] rounded-xl px-4 py-2.5 text-sm whitespace-pre-wrap',
                    turn.role === 'user'
                      ? 'bg-violet-600 text-white'
                      : 'border border-white/10 bg-white/5 text-foreground/90',
                  )}
                >
                  {turn.content}
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-muted-foreground">
                  <Loader2 className="size-3.5 animate-spin" /> Thinking…
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      <form
        data-tour="chat-input"
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="Ask about trends, categories, or a specific story…"
          className="flex-1"
        />
        <Button type="submit" disabled={!input.trim() || chatMutation.isPending} className="btn-glow gap-2 bg-violet-600 hover:bg-violet-500">
          {chatMutation.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          <span className="hidden sm:inline">Send</span>
        </Button>
      </form>
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Sparkles className="size-3" /> Every answer is grounded in your team's actual news feed — not invented.
      </p>
    </div>
  );
}
