import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DropdownMenu as DropdownMenuPrimitive } from 'radix-ui';
import { History, Loader2, MessageSquare, Plus, Send, Sparkles } from 'lucide-react';
import { askChat, askChatStream, getConversationMessages, listConversations } from '@/lib/api/chat';
import { getTeam } from '@/lib/api/teams';
import type { LanguageStyle } from '@/lib/api/content';
import { useTeamId } from '@/lib/useTeamId';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PageHelp } from '@/components/dashboard/PageHelp';

const LANGUAGE_OPTIONS: { value: LanguageStyle; label: string }[] = [
  { value: 'bangla', label: 'বাংলা' },
  { value: 'english', label: 'English' },
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
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [languageOverride, setLanguageOverride] = useState<LanguageStyle | undefined>(undefined);
  const scrollRef = useRef<HTMLDivElement>(null);
  // Auto-resume the most recent conversation on mount, exactly once — without this guard, the
  // conversations list refetching after every new message (its queryKey is invalidated below)
  // would otherwise fight with the user's own in-progress conversation selection.
  const hasAutoResumedRef = useRef(false);

  const teamQuery = useQuery({
    queryKey: ['team', teamId],
    queryFn: () => getTeam(teamId as string),
    enabled: Boolean(teamId),
  });
  const language = languageOverride ?? teamQuery.data?.team.voice_profile?.default_language ?? 'bangla';

  const conversationsQuery = useQuery({
    queryKey: ['chat-conversations', teamId],
    queryFn: () => listConversations(teamId as string),
    enabled: Boolean(teamId),
  });

  const loadConversation = async (targetConversationId: string) => {
    if (!teamId) return;
    const history = await getConversationMessages(teamId, targetConversationId);
    setConversationId(targetConversationId);
    setMessages(history.map((m) => ({ role: m.role, content: m.content })));
  };

  // Resume the most recent past conversation once the list has loaded, unless the user has
  // already started a fresh one (e.g. by typing before this resolves, or explicitly "New chat").
  // This is a one-time hydration of local chat state from an async fetch triggered by mount, not
  // a synchronous derived-state update — intentionally exempt from the cascading-render rule.
  useEffect(() => {
    if (hasAutoResumedRef.current || !conversationsQuery.data || conversationId) return;
    hasAutoResumedRef.current = true;
    const mostRecent = conversationsQuery.data[0];
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time async hydration, see above
    if (mostRecent) void loadConversation(mostRecent.conversation_id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationsQuery.data]);

  const startNewChat = () => {
    hasAutoResumedRef.current = true;
    setConversationId(undefined);
    setMessages([]);
  };

  /**
   * Streams the answer in, appending each chunk to the last assistant turn.
   *
   * Still a TanStack mutation, and still keyed `['chat']`, so the app-wide ActiveTasksIndicator keeps
   * showing an in-flight answer when the user navigates away — that behaviour predates streaming and
   * shouldn't regress because of it.
   *
   * An empty assistant turn is appended up front and then grown in place, so the bubble (and its
   * caret) appear immediately rather than after the first token lands.
   */
  const chatMutation = useMutation({
    mutationKey: ['chat'],
    mutationFn: async (payload: Parameters<typeof askChat>[0]) => {
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      const appendDelta = (text: string) =>
        setMessages((prev) => {
          const next = [...prev];
          const last = next[next.length - 1];
          if (last?.role === 'assistant') next[next.length - 1] = { ...last, content: last.content + text };
          return next;
        });

      await askChatStream(payload, {
        onStart: setConversationId,
        onDelta: appendDelta,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations', teamId] });
    },
    onError: (err: Error) => {
      toast.error(err.message || 'Chat failed');
      // Drop the question and the empty/partial answer together — leaving a half-finished bubble
      // with no error attached would read as a complete reply.
      setMessages((prev) => {
        const withoutAnswer = prev.at(-1)?.role === 'assistant' ? prev.slice(0, -1) : prev;
        return withoutAnswer.slice(0, -1);
      });
    },
  });

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, chatMutation.isPending]);

  const send = (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !teamId || chatMutation.isPending) return;
    hasAutoResumedRef.current = true;
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
          <div className="inline-flex w-fit rounded-md border border-border p-0.5">
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
          <DropdownMenuPrimitive.Root>
            <DropdownMenuPrimitive.Trigger asChild>
              <Button variant="outline" size="sm" className="gap-1.5">
                <History className="size-3.5" />
                <span className="hidden sm:inline">History</span>
              </Button>
            </DropdownMenuPrimitive.Trigger>
            <DropdownMenuPrimitive.Portal>
              <DropdownMenuPrimitive.Content
                align="end"
                className="z-50 max-h-80 min-w-64 overflow-y-auto rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-md"
              >
                {(conversationsQuery.data ?? []).length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">No past conversations yet.</p>
                ) : (
                  conversationsQuery.data?.map((conv) => (
                    <DropdownMenuPrimitive.Item
                      key={conv.conversation_id}
                      onSelect={() => void loadConversation(conv.conversation_id)}
                      className={cn(
                        'flex cursor-pointer flex-col gap-0.5 rounded-sm px-2 py-1.5 text-xs outline-none data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground',
                        conv.conversation_id === conversationId && 'bg-muted',
                      )}
                    >
                      <span className="truncate text-foreground">{conv.last_message_preview}</span>
                      <span className="text-muted-foreground">
                        {conv.message_count} message{conv.message_count === 1 ? '' : 's'} ·{' '}
                        {new Date(conv.last_activity_at).toLocaleString()}
                      </span>
                    </DropdownMenuPrimitive.Item>
                  ))
                )}
              </DropdownMenuPrimitive.Content>
            </DropdownMenuPrimitive.Portal>
          </DropdownMenuPrimitive.Root>
          <Button variant="outline" size="sm" onClick={startNewChat} className="gap-1.5">
            <Plus className="size-3.5" />
            <span className="hidden sm:inline">New chat</span>
          </Button>
          <PageHelp guideKey="chat" />
        </div>
      </div>

      <div ref={scrollRef} className="glass-card flex-1 overflow-y-auto rounded-xl p-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
            <div className="flex size-12 items-center justify-center rounded-full bg-violet-400/10">
              <MessageSquare className="size-6 text-violet-700 dark:text-violet-300" />
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
                  className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-violet-400/40 hover:text-foreground"
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
                      : 'border border-border bg-muted text-foreground/90',
                  )}
                >
                  {turn.content}
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
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
        <Button type="submit" disabled={!input.trim() || chatMutation.isPending} className="btn-glow gap-2">
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
