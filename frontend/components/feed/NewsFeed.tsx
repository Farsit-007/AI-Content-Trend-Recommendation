"use client"

import { useEffect, useMemo, useState } from "react"
import { motion } from "framer-motion"
import { Newspaper } from "lucide-react"
import { toast } from "sonner"
import { Skeleton } from "@/components/ui/skeleton"
import type { NewsItem } from "@/lib/mock/news"
import { fetchNewsItems, setNewsItemOverride } from "@/lib/api/newsItems"
import { DEFAULT_CATEGORIES, fetchEffectiveCategories } from "@/lib/api/teams"
import CategoryTabs from "./CategoryTabs"
import SortSelect from "./SortSelect"
import NewsCard from "./NewsCard"
import { type Category, type SortOption } from "./constants"

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.05 } },
}

const cardVariant = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.3 } },
}

export default function NewsFeed() {
  const [items, setItems] = useState<NewsItem[]>([])
  const [categories, setCategories] = useState<string[]>(DEFAULT_CATEGORIES)
  const [isLoading, setIsLoading] = useState(true)
  const [activeCategory, setActiveCategory] = useState<Category>("All")
  const [sort, setSort] = useState<SortOption>("Trending")

  useEffect(() => {
    let cancelled = false

    async function load() {
      setIsLoading(true)
      try {
        const [fetchedItems, fetchedCategories] = await Promise.all([
          fetchNewsItems(),
          fetchEffectiveCategories(),
        ])
        if (cancelled) return
        setItems(fetchedItems)
        setCategories(fetchedCategories)
      } catch (err) {
        if (cancelled) return
        toast.error(err instanceof Error ? err.message : "Failed to load the feed")
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    load()
    return () => {
      cancelled = true
    }
  }, [])

  async function handleRecategorize(itemId: string, category: string) {
    const previous = items
    setItems((cur) => cur.map((i) => (i.id === itemId ? { ...i, category, is_overridden: true } : i)))
    try {
      await setNewsItemOverride(itemId, { category })
    } catch (err) {
      setItems(previous)
      toast.error(err instanceof Error ? err.message : "Failed to recategorize")
    }
  }

  async function handleScoreChange(itemId: string, opportunity_score: number) {
    const previous = items
    setItems((cur) => cur.map((i) => (i.id === itemId ? { ...i, opportunity_score, is_overridden: true } : i)))
    try {
      await setNewsItemOverride(itemId, { opportunity_score })
    } catch (err) {
      setItems(previous)
      toast.error(err instanceof Error ? err.message : "Failed to update opportunity score")
    }
  }

  const tabs = useMemo(() => ["All", ...categories], [categories])

  const filtered = useMemo(() => {
    const base =
      activeCategory === "All" ? items : items.filter((i) => i.category === activeCategory)

    return [...base].sort((a, b) => {
      if (sort === "Trending") return b.trend_score - a.trend_score
      if (sort === "Latest")
        return new Date(b.published_at).getTime() - new Date(a.published_at).getTime()
      return b.relevance_score - a.relevance_score
    })
  }, [items, activeCategory, sort])

  return (
    <div className="space-y-4">
      {/* Controls */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <CategoryTabs categories={tabs} active={activeCategory} onSelect={setActiveCategory} />
        <SortSelect value={sort} onSort={setSort} />
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-56 rounded-lg" />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
          <Newspaper className="size-10 opacity-30" />
          <p className="text-sm">No items in this category yet.</p>
        </div>
      ) : (
        <motion.div
          key={`${activeCategory}-${sort}`}
          variants={container}
          initial="hidden"
          animate="show"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4"
        >
          {filtered.map((item) => (
            <motion.div key={item.id} variants={cardVariant}>
              <NewsCard
                item={item}
                categories={categories}
                onRecategorize={(category) => handleRecategorize(item.id, category)}
                onScoreChange={(score) => handleScoreChange(item.id, score)}
              />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
