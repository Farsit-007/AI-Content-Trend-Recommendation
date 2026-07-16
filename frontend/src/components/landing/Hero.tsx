import { Link } from "react-router-dom";
import { motion, useReducedMotion } from "motion/react";
import { ArrowRight, Play, Sparkles, TrendingUp, Flame } from "lucide-react";

import { useAuth } from "@/context/auth-context";
import { Button } from "@/components/ui/button";
import { AuroraBackground } from "./AuroraBackground";
import { GridPattern } from "./GridPattern";

const trendingItems = [
  { tag: "AI Agents", delta: "+184%", hot: true },
  { tag: "RAG pipelines", delta: "+96%", hot: true },
  { tag: "Edge inference", delta: "+42%", hot: false },
];

export function Hero() {
  const { isAuthenticated } = useAuth();
  const reduceMotion = useReducedMotion();

  const primaryTo = isAuthenticated ? "/dashboard" : "/login";
  const primaryLabel = isAuthenticated ? "Go to dashboard" : "Get started free";

  return (
    <section className="relative overflow-hidden pt-24 pb-20 sm:pt-32">
      <AuroraBackground />
      <GridPattern />

      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Copy */}
          <div className="text-center lg:text-left">
            <div className="glass-card mb-6 inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm">
              <Sparkles className="size-4 text-violet-400" />
              AI Content &amp; Trend Intelligence
            </div>

            <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
              Turn trends into content that{" "}
              <span className="gradient-text">actually grows</span>
            </h1>

            <p className="text-muted-foreground mx-auto mt-6 max-w-xl text-lg lg:mx-0">
              Track what&apos;s trending, generate on-brand content in seconds,
              and measure what works — all in one intelligent workspace.
            </p>

            <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row lg:justify-start">
              <Button asChild size="lg" className="btn-glow">
                <Link to={primaryTo}>
                  {primaryLabel}
                  <ArrowRight className="size-4" />
                </Link>
              </Button>
              <Button asChild variant="outline" size="lg">
                <Link to="/about">
                  <Play className="size-4" />
                  See how it works
                </Link>
              </Button>
            </div>

            <div className="text-muted-foreground mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm lg:justify-start">
              <span>10k+ trends tracked daily</span>
              <span className="hidden sm:inline">•</span>
              <span>No credit card required</span>
            </div>
          </div>

          {/* Faked product mockup */}
          <motion.div
            initial={reduceMotion ? false : { opacity: 0, y: 30 }}
            animate={reduceMotion ? {} : { opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="glass-card relative rounded-2xl p-4 shadow-2xl"
          >
            <div className="border-border flex items-center gap-2 border-b pb-3">
              <TrendingUp className="size-4 text-violet-500" />
              <span className="text-sm font-medium">Trend Feed</span>
              <span className="ml-auto flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                Live
              </span>
            </div>

            <div className="mt-3 space-y-2">
              {trendingItems.map((item, i) => (
                <motion.div
                  key={item.tag}
                  initial={reduceMotion ? false : { opacity: 0, x: 12 }}
                  animate={reduceMotion ? {} : { opacity: 1, x: 0 }}
                  transition={{ delay: 0.3 + i * 0.15, duration: 0.4 }}
                  className="bg-muted flex items-center justify-between rounded-lg px-3 py-2.5"
                >
                  <div className="flex items-center gap-2">
                    {item.hot && <Flame className="size-3.5 text-amber-500" />}
                    <span className="text-sm font-medium">{item.tag}</span>
                  </div>
                  <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                    {item.delta}
                  </span>
                </motion.div>
              ))}
            </div>

            <div className="mt-3 rounded-lg border border-violet-500/20 bg-violet-500/10 p-3">
              <p className="text-xs text-violet-700 dark:text-violet-200">
                <Sparkles className="mr-1 inline size-3" />
                Suggested: “5 ways AI agents are reshaping growth teams”
              </p>
            </div>
          </motion.div>
        </div>
      </div>
    </section>
  );
}
