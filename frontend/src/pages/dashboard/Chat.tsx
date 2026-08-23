import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { History, Info, Loader2, MessageSquare, Plus, Send, Sparkles, Square } from 'lucide-react';

import {
  askChat,
  askChatStream,
  getConversationMessages,
  listConversations,
  type ChatContextTier,
  type ChatSourceRef,
} from '@/lib/api/chat';
import { getTeam } from '@/lib/api/teams';
import type { LanguageStyle } from '@/lib/api/content';
import { useTeamId } from '@/lib/useTeamId';
import { timeAgo } from '@/lib/datetime';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { EmptyState } from '@/components/ui/empty-state';
import { Textarea } from '@/components/ui/textarea';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PageHeader } from '@/components/dashboard/PageHeader';
import { MarkdownMessage } from '@/components/chat/MarkdownMessage';
import { MessageActions } from '@/components/chat/MessageActions';

const LANGUAGE_OPTIONS: { value: LanguageStyle; label: string }[] = [
  { value: 'bangla', label: 'বাংলা' },
  { value: 'english', label: 'English' },
];

const SUGGESTED_PROMPTS = [
  "What's trending in AI right now?",
  'Summarize the top DevOps story this week',
  'Give me 3 content angles from today’s feed',
];

/**
 * Shown when the backend had to search wider than the team's own categories, or found nothing at
 * all. `subscribed` deliberately renders nothing — the normal case needs no explanation, and a
 * banner on every answer would train people to ignore it.
 */
const TIER_NOTICE: Partial<Record<ChatContextTier, string>> = {
  broadened:
    'Nothing in your exact categories matched, so this answer draws on the broader groups they ' +
    'belong to — adjacent to what you follow, not squarely inside it.',
  none:
    "Your team's feed has nothing on this. Answers stay grounded in your own data, so there is " +
    'nothing to draw on — try subscribing to another category in Team Settings.',
};

interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
  /** Citation targets for an assistant turn, from the stream's `context` event. */
  sources?: ChatSourceRef[];
}

export default function Chat() {
  const teamId = useTeamId();
  const queryClient = useQueryClient();
  const [messages, setMessages] = useState<ChatTurn[]>([]);
  /**
   * Live stream, so Stop can abort it. The server already honours cancellation and persists whatever
   * it produced, so aborting mid-answer keeps the partial text rather than discarding it.
   */
  const abortRef = useRef<AbortController | null>(null);
  const [conversationId, setConversationId] = useState<string | undefined>(undefined);
  const [input, setInput] = useState('');
  const [contextTier, setContextTier] = useState<ChatContextTier | null>(null);
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
  const language =
    languageOverride ?? teamQuery.data?.team.voice_profile?.default_language ?? 'bangla';

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
    // The tier describes the last answer's retrieval, which isn't replayed from stored history —
    // keeping a stale banner would attach it to the wrong answer.
    setContextTier(null);
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
    setContextTier(null);
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
          if (last?.role === 'assistant')
            next[next.length - 1] = { ...last, content: last.content + text };
          return next;
        });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        await askChatStream(payload, {
          onStart: setConversationId,
          onContext: (tier, sources) => {
            setContextTier(tier);
            // Attached to the turn rather than held in page state: a citation belongs to the answer
            // that made it, and page state would relabel older answers on the next question.
            setMessages((prev) => {
              const next = [...prev];
              const last = next[next.length - 1];
              if (last?.role === 'assistant') next[next.length - 1] = { ...last, sources };
              return next;
            });
          },
          onDelta: appendDelta,
          signal: controller.signal,
        });
      } finally {
        abortRef.current = null;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['chat-conversations', teamId] });
    },
    onError: (err: Error) => {
      // An abort is the user's own Stop, not a failure: the tokens already on screen are real and
      // the backend has persisted them, so the turn stays exactly as it is.
      if (err.name === 'AbortError') {
        // Unless nothing had streamed yet — then there is no partial answer to keep, only an empty
        // bubble that would sit there looking like a reply that never arrived.
        setMessages((prev) => {
          const last = prev.at(-1);
          return last?.role === 'assistant' && last.content === '' ? prev.slice(0, -1) : prev;
        });
        return;
      }

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
    // Cleared up front: the previous answer's tier must not appear to describe the new question.
    setContextTier(null);
    chatMutation.mutate({
      team_id: teamId,
      message: trimmed,
      conversation_id: conversationId,
      language,
    });
  };

  /**
   * Re-asks the previous question, replacing the answer in place.
   *
   * Drops the old assistant turn before re-sending so the reply arrives where the previous one was
   * rather than appended beneath it — the same conversation continues, so `conversation_id` is
   * deliberately kept: the model should see the exchange it is retrying.
   */
  const regenerateLast = () => {
    if (chatMutation.isPending) return;
    const lastQuestion = [...messages].reverse().find((m) => m.role === 'user');
    if (!lastQuestion) return;

    setMessages((prev) => (prev.at(-1)?.role === 'assistant' ? prev.slice(0, -1) : prev));
    chatMutation.mutate({
      team_id: teamId as string,
      message: lastQuestion.content,
      conversation_id: conversationId,
      language,
    });
  };

  if (!teamId) {
    return (
      <div className="flex flex-col gap-4">
        <PageHeader accent="Ask" title="Growth Studio" icon={MessageSquare} guideKey="chat" />
        <div className="glass-card rounded-xl">
          <EmptyState
            icon={MessageSquare}
            title="No team yet"
            description="You need to belong to a team to ask Growth Studio — answers come from its feed."
          />
        </div>
      </div>
    );
  }

  const conversations = conversationsQuery.data ?? [];

  return (
    <div className="flex h-[calc(100svh-8rem)] flex-col gap-4">
      <PageHeader
        accent="Ask"
        title="Growth Studio"
        icon={MessageSquare}
        guideKey="chat"
        description="News-grounded Q&A — answers are pulled from your team's feed, not general knowledge."
        actions={
          <>
            <Tabs
              value={language}
              onValueChange={(value) => setLanguageOverride(value as LanguageStyle)}
            >
              <TabsList>
                {LANGUAGE_OPTIONS.map((option) => (
                  <TabsTrigger key={option.value} value={option.value}>
                    {option.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Below lg the conversation rail is hidden, so history stays reachable as a menu. */}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="gap-1.5 lg:hidden">
                  <History className="size-3.5" />
                  History
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="max-h-80 w-72 overflow-y-auto">
                {conversations.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    No past conversations yet.
                  </p>
                ) : (
                  conversations.map((conv) => (
                    <DropdownMenuItem
                      key={conv.conversation_id}
                      onSelect={() => void loadConversation(conv.conversation_id)}
                      className={cn(
                        'flex flex-col items-start gap-0.5',
                        conv.conversation_id === conversationId && 'bg-muted',
                      )}
                    >
                      <span className="line-clamp-1 text-xs text-foreground">
                        {conv.last_message_preview}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        {conv.message_count} message{conv.message_count === 1 ? '' : 's'} ·{' '}
                        {timeAgo(conv.last_activity_at)}
                      </span>
                    </DropdownMenuItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>

            <Button variant="outline" size="sm" onClick={startNewChat} className="gap-1.5">
              <Plus className="size-3.5" />
              <span className="hidden sm:inline">New chat</span>
            </Button>
          </>
        }
      />

      <div className="flex min-h-0 flex-1 gap-4">
        {/* Conversation rail — a persistent list beats a dropdown once there is real history. */}
        <aside className="glass-card hidden w-64 shrink-0 flex-col overflow-hidden rounded-xl lg:flex">
          <div className="flex items-center gap-2 border-b border-border px-3 py-2.5">
            <History className="size-3.5 text-muted-foreground" />
            <p className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
              Conversations
            </p>
          </div>
          <div className="flex-1 overflow-y-auto p-2">
            {conversationsQuery.isLoading ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">Loading…</p>
            ) : conversations.length === 0 ? (
              <p className="px-2 py-1.5 text-xs text-muted-foreground">
                Nothing yet — your questions show up here.
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {conversations.map((conv) => (
                  <li key={conv.conversation_id}>
                    <button
                      type="button"
                      onClick={() => void loadConversation(conv.conversation_id)}
                      className={cn(
                        'flex w-full flex-col items-start gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-accent/50',
                        conv.conversation_id === conversationId && 'bg-brand-surface',
                      )}
                    >
                      <span className="line-clamp-2 text-xs text-foreground">
                        {conv.last_message_preview}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        {conv.message_count} msg · {timeAgo(conv.last_activity_at)}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col gap-3">
          <div ref={scrollRef} className="glass-card flex-1 overflow-y-auto rounded-xl p-4">
            {messages.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center gap-4 text-center">
                <div className="flex size-12 items-center justify-center rounded-full bg-brand-surface">
                  <MessageSquare className="size-6 text-brand" />
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
                      className="rounded-full border border-border px-3 py-1.5 text-xs text-muted-foreground transition hover:border-brand/40 hover:text-foreground"
                    >
                      {prompt}
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {messages.map((turn, i) => {
                  const isLast = i === messages.length - 1;
                  const isStreaming =
                    isLast && turn.role === 'assistant' && chatMutation.isPending;
                  return (
                    <div
                      key={i}
                      className={cn(
                        'group/msg flex flex-col gap-1',
                        turn.role === 'user' ? 'items-end' : 'items-start',
                      )}
                    >
                      <div
                        className={cn(
                          'max-w-[85%] rounded-xl px-4 py-2.5 text-sm',
                          turn.role === 'user'
                            ? 'bg-primary text-primary-foreground whitespace-pre-wrap'
                            : 'border border-border bg-muted text-foreground/90',
                        )}
                      >
                        {turn.role === 'assistant' ? (
                          <>
                            <MarkdownMessage content={turn.content} sources={turn.sources} />
                            {isStreaming && turn.content.length > 0 && (
                              <span
                                aria-hidden="true"
                                className="ml-0.5 inline-block h-3.5 w-1.5 bg-current align-middle motion-safe:animate-pulse"
                              />
                            )}
                          </>
                        ) : (
                          turn.content
                        )}
                      </div>
                      {turn.content.length > 0 && !isStreaming && (
                        <MessageActions
                          content={turn.content}
                          onRegenerate={
                            isLast && turn.role === 'assistant' ? regenerateLast : undefined
                          }
                          regenerateDisabled={chatMutation.isPending}
                        />
                      )}
                    </div>
                  );
                })}
                {/* Only before the first token — once text is flowing the caret carries the signal,
                    and two indicators at once reads as two things happening. */}
                {chatMutation.isPending && messages.at(-1)?.content === '' && (
                  <div className="flex justify-start">
                    <div className="flex items-center gap-2 rounded-xl border border-border bg-muted px-4 py-2.5 text-sm text-muted-foreground">
                      <Loader2 className="size-3.5 animate-spin" /> Thinking…
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {contextTier && TIER_NOTICE[contextTier] && (
            <p
              role="status"
              className="flex items-start gap-1.5 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-xs text-muted-foreground"
            >
              <Info className="mt-px size-3.5 shrink-0 text-amber-400" />
              {TIER_NOTICE[contextTier]}
            </p>
          )}

          <form
            data-tour="chat-input"
            onSubmit={(e) => {
              e.preventDefault();
              send(input);
            }}
            className="flex items-end gap-2"
          >
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                // Enter sends, Shift+Enter breaks the line — what every comparable assistant does,
                // and the reason a single-line input was the wrong control for a question that can
                // reasonably run to a paragraph.
                // `isComposing` guards IME users — Bengali phonetic input included: Enter there
                // confirms the candidate word, and treating it as send would mangle every message.
                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                  e.preventDefault();
                  send(input);
                }
              }}
              rows={1}
              placeholder="Ask about trends, categories, or a specific story…  (Shift+Enter for a new line)"
              className="max-h-40 min-h-9 flex-1 resize-y py-2"
            />
            {chatMutation.isPending ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => abortRef.current?.abort()}
                className="gap-2"
              >
                <Square className="size-4" />
                <span className="hidden sm:inline">Stop</span>
              </Button>
            ) : (
              <Button type="submit" disabled={!input.trim()} className="btn-glow gap-2">
                <Send className="size-4" />
                <span className="hidden sm:inline">Send</span>
              </Button>
            )}
          </form>

          <p className="flex items-center gap-1 text-xs text-muted-foreground">
            <Sparkles className="size-3" /> Every answer is grounded in your team&apos;s actual news
            feed — not invented.
          </p>
        </div>
      </div>
    </div>
  );
}
