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

router.get('/conversations', ChatController.listConversations);
router.get('/conversations/:conversationId', ChatController.getConversationMessages);

export const ChatRoutes = router;
