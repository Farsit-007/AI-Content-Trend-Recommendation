import { MOCK_NEWS_ITEMS } from "@/lib/mock/news"
import NewsFeed from "@/components/feed/NewsFeed"

export const metadata = {
  title: "Feed — Growth Studio",
}

export default function FeedPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Trending Feed</h1>
        <p className="text-sm text-muted-foreground mt-1">
          AI-scored news ranked by trend and opportunity for your channels
        </p>
      </div>
      <NewsFeed items={MOCK_NEWS_ITEMS} />
    </div>
  )
}
