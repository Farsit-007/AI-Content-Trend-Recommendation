import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { llmRateLimiter } from '../../middleware/rateLimit';
import { validation } from '../../middleware/validation';
import { ChatController } from './chat.controller';
import { ChatValidation } from './chat.validation';

const router = Router();

router.use(requireAuth);

// Asking a question costs an embedding call plus a completion — rate limited per team, unlike the
// two read-only history endpoints below.
router.post('/', llmRateLimiter, validation(ChatValidation.askChatValidation), ChatController.askChat);

// Streaming twin of the route above — same auth, validation and per-team LLM budget, delivered over
// SSE. Kept as a separate path rather than content-negotiated on `POST /`, so the buffered endpoint
// stays byte-identical for any existing client.
router.post(
  '/stream',
  llmRateLimiter,
  validation(ChatValidation.askChatValidation),
  ChatController.askChatStream,
);

router.get('/conversations', ChatController.listConversations);
router.get('/conversations/:conversationId', ChatController.getConversationMessages);

export const ChatRoutes = router;
