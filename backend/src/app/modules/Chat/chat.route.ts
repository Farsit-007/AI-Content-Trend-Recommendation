import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { ChatController } from './chat.controller';
import { ChatValidation } from './chat.validation';

const router = Router();

router.use(requireAuth);

router.post('/', validation(ChatValidation.askChatValidation), ChatController.askChat);

router.get('/conversations', ChatController.listConversations);
router.get('/conversations/:conversationId', ChatController.getConversationMessages);

export const ChatRoutes = router;
