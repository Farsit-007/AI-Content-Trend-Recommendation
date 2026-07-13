"use client"

import { useState, useMemo } from "react"
import { motion } from "framer-motion"
import { Newspaper } from "lucide-react"
import type { NewsItem } from "@/lib/mock/news"
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

type Props = { items: NewsItem[] }

export default function NewsFeed({ items }: Props) {
  const [activeCategory, setActiveCategory] = useState<Category>("All")
  const [sort, setSort] = useState<SortOption>("Trending")

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
        <CategoryTabs active={activeCategory} onSelect={setActiveCategory} />
        <SortSelect value={sort} onSort={setSort} />
      </div>

      {/* Grid */}
      {filtered.length === 0 ? (
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
              <NewsCard item={item} />
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  )
}
