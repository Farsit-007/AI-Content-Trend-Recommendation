import { Router, Request, Response } from 'express';
import swaggerUi from 'swagger-ui-express';
import { BrandVoiceExampleRoutes } from '../modules/BrandVoiceExample/brandVoiceExample.route';
import { NewsItemRoutes } from '../modules/NewsItem/newsItem.route';
import { PlatformPostRoutes } from '../modules/PlatformPost/platformPost.route';
import { PlatformCatalogRoutes } from '../modules/PlatformCatalog/platformCatalog.route';
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
  { path: '/platforms', route: PlatformCatalogRoutes },
  { path: '/news-items', route: NewsItemRoutes },
  { path: '/platform-posts', route: PlatformPostRoutes },
  { path: '/brand-voice-examples', route: BrandVoiceExampleRoutes },
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
