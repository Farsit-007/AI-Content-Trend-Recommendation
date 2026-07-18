import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { GeneratedContentRoutes } from '../modules/GeneratedContent/generatedContent.route';
import { BrandVoiceExampleRoutes } from '../modules/BrandVoiceExample/brandVoiceExample.route';
import { ChatRoutes } from '../modules/Chat/chat.route';
import { ContentGenerationRoutes } from '../modules/ContentGeneration/contentGeneration.route';
import { NewsItemRoutes } from '../modules/NewsItem/newsItem.route';
import { StylePackRoutes } from '../modules/StylePack/stylePack.route';
import { TeamRoutes } from '../modules/Team/team.route';
import { AuthRoutes, UserRoutes } from '../modules/User/user.route';
import { openApiDocument } from '../docs/openapi';

const router = Router();

// API documentation: raw OpenAPI 3.1 spec and interactive Swagger UI.
router.get('/openapi.json', (_req: Request, res: Response) => {
  res.json(openApiDocument);
});
router.use('/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));

const moduleRoutes: { path: string; route: Router }[] = [
  { path: '/auth', route: AuthRoutes },
  { path: '/users', route: UserRoutes },
  { path: '/teams', route: TeamRoutes },
  { path: '/news-items', route: NewsItemRoutes },
  { path: '/brand-voice-examples', route: BrandVoiceExampleRoutes },
  { path: '/content', route: ContentGenerationRoutes },
  { path: '/chat', route: ChatRoutes },
  { path: '/generated-content', route: GeneratedContentRoutes },
  { path: '/style-packs', route: StylePackRoutes },
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
