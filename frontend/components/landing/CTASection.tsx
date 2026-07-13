"use client"

import { motion } from "framer-motion"
import { Button } from "@/components/ui/button"
import { ArrowRight } from "lucide-react"

export default function CTASection() {
  return (
    <section className="py-10 md:py-14">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: "easeOut" }}
          viewport={{ once: true }}
        >
          <div className="relative overflow-hidden rounded-2xl border border-violet-500/20 p-10 text-center md:p-16">
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-violet-950/60 to-cyan-950/40" />
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_60%_60%_at_50%_50%,rgba(124,58,237,0.12),transparent)]" />
            <div
              className="pointer-events-none absolute inset-0 opacity-[0.04]"
              style={{
                backgroundImage:
                  "linear-gradient(rgba(255,255,255,0.15) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,0.15) 1px,transparent 1px)",
                backgroundSize: "32px 32px",
              }}
            />
            <div className="relative">
              <h2 className="mb-3 text-3xl font-bold tracking-tight sm:text-4xl">
                Ready to stop guessing and start{" "}
                <span className="gradient-text">creating?</span>
              </h2>
              <p className="mx-auto mb-8 max-w-lg text-muted-foreground">
                Growth Studio gives the Programming Hero marketing team a full week of content
                ideas — personalized, platform-specific, in Banglish — in 5 minutes.
              </p>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-center">
                <Button
                  size="lg"
                  className="btn-glow gap-2 bg-gradient-to-r from-violet-600 to-cyan-600 px-8 text-white hover:from-violet-500 hover:to-cyan-500 border-0"
                >
                  See the Demo
                  <ArrowRight className="size-4" />
                </Button>
                <Button size="lg" variant="outline" className="px-8 border-white/15 hover:bg-white/5">
                  View on GitHub
                </Button>
              </div>
              <div className="mt-8 flex flex-wrap items-center justify-center gap-5 text-xs text-muted-foreground">
                {["✓ $0 AI & API cost", "✓ MongoDB Atlas Vector Search", "✓ 4 RAG flows", "✓ 3 platforms"].map((t) => (
                  <span key={t}>{t}</span>
                ))}
              </div>
            </div>
          </div>
        </motion.div>
      </div>
    </section>
  )
}
