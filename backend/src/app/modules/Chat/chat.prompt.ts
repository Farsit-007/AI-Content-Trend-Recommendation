import { ChatMessage } from '../../lib/llmClient';
import { ChatContextItem, IChatMessage } from './chat.interface';

const SYSTEM_PROMPT =
  'You are the "Ask Growth Studio" assistant for a social media growth marketing team. ' +
  "You answer questions about trending news/topics relevant to the team's content, the team's own " +
  "platform performance (Facebook, YouTube, LinkedIn, etc.), and what content to create next. " +
  'Ground every answer in the context provided below — do not invent statistics or news that is not in the context. ' +
  'If the context does not contain enough information to answer precisely, say so and offer the closest relevant ' +
  'recommendation from what is available. ' +
  'Reply in the same mixed Bengali/English ("Banglish") or English style the user writes in, ' +
  'in a warm, concise, actionable tone — this is a coworker, not a formal report.';

const formatContext = (context: ChatContextItem[]): string => {
  if (context.length === 0) return 'No specific context was retrieved for this question.';
  return context.map((item, i) => `${i + 1}. [${item.source}]\n${item.content}`).join('\n\n');
};

export const buildMessages = (
  question: string,
  context: ChatContextItem[],
  history: IChatMessage[],
): ChatMessage[] => [
  { role: 'system', content: `${SYSTEM_PROMPT}\n\nContext:\n${formatContext(context)}` },
  ...history.map((msg): ChatMessage => ({ role: msg.role, content: msg.content })),
  { role: 'user', content: question },
];
