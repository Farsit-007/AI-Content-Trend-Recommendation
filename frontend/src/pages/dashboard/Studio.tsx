import { lazy, Suspense } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Sparkles } from 'lucide-react';

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { PageHeader } from '@/components/dashboard/PageHeader';

const Compose = lazy(() => import('@/pages/dashboard/Generate'));
const Library = lazy(() => import('@/pages/dashboard/Drafts'));

const TABS = [
  { value: 'compose', label: 'Compose' },
  { value: 'library', label: 'Library' },
] as const;

type StudioTab = (typeof TABS)[number]['value'];

const isStudioTab = (value: string | null): value is StudioTab =>
  TABS.some((tab) => tab.value === value);

/**
 * One surface for creating content and for everything already created.
 *
 * These were two sidebar entries and two mental models, which made the seam visible in the worst
 * place: you generated on one page, then went looking for the result on another. Same route, two
 * tabs — and because the tab lives in the query string, a link to a specific tab still works and
 * the browser back button moves between them.
 *
 * Each tab is its own lazy chunk, so opening Studio does not download the other half.
 */
export default function Studio() {
  const [searchParams, setSearchParams] = useSearchParams();
  const raw = searchParams.get('tab');
  const tab: StudioTab = isStudioTab(raw) ? raw : 'compose';

  const changeTab = (next: string) => {
    if (!isStudioTab(next)) return;
    // `replace` so switching tabs does not stack history entries — back should leave Studio, not
    // walk through every tab the user glanced at.
    setSearchParams(
      (params) => {
        params.set('tab', next);
        return params;
      },
      { replace: true },
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <PageHeader
        title="Studio"
        icon={Sparkles}
        guideKey="generate"
        description="Write new content, and review everything this team has already written."
      />

      <Tabs value={tab} onValueChange={changeTab}>
        <TabsList>
          {TABS.map((option) => (
            <TabsTrigger key={option.value} value={option.value}>
              {option.label}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      <Suspense fallback={<Skeleton className="h-64 w-full rounded-xl" />}>
        {tab === 'compose' ? <Compose embedded /> : <Library embedded />}
      </Suspense>
    </div>
  );
}
