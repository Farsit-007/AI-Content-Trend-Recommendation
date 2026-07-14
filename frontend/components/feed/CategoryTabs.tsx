"use client"

import { motion } from "framer-motion"
import { type Category } from "./constants"

type Props = {
  categories: Category[]
  active: Category
  onSelect: (cat: Category) => void
}

export default function CategoryTabs({ categories, active, onSelect }: Props) {
  return (
    <div className="flex gap-1 overflow-x-auto pb-1 scrollbar-none">
      {categories.map((cat) => (
        <button
          key={cat}
          onClick={() => onSelect(cat)}
          className="relative px-3 py-1.5 text-sm whitespace-nowrap rounded-md transition-colors"
        >
          {active === cat && (
            <motion.div
              layoutId="tab-indicator"
              className="absolute inset-0 rounded-md bg-primary/15 border border-primary/30"
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
            />
          )}
          <span
            className={
              active === cat
                ? "relative text-primary font-medium"
                : "relative text-muted-foreground hover:text-foreground"
            }
          >
            {cat}
          </span>
        </button>
      ))}
    </div>
  )
}
