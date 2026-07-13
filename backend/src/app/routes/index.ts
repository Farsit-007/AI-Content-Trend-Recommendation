import { Router } from 'express';
import { BrandVoiceExampleRoutes } from '../modules/BrandVoiceExample/brandVoiceExample.route';
import { NewsItemRoutes } from '../modules/NewsItem/newsItem.route';
import { PlatformPostRoutes } from '../modules/PlatformPost/platformPost.route';

const router = Router();

const moduleRoutes: { path: string; route: Router }[] = [
  { path: '/news-items', route: NewsItemRoutes },
  { path: '/platform-posts', route: PlatformPostRoutes },
  { path: '/brand-voice-examples', route: BrandVoiceExampleRoutes },
];

moduleRoutes.forEach((route) => {
  router.use(route.path, route.route);
});

export default router;
