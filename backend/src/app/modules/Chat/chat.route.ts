import { Router } from 'express';
import { requireAuth } from '../../middleware/auth';
import { validation } from '../../middleware/validation';
import { ChatController } from './chat.controller';
import { ChatValidation } from './chat.validation';

const router = Router();

router.use(requireAuth);

router.post('/', validation(ChatValidation.askChatValidation), ChatController.askChat);

export const ChatRoutes = router;
