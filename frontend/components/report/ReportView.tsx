"use client"

import PageHeader from "@/components/shared/PageHeader"
import OverviewStats from "./OverviewStats"
import PlatformSection from "./PlatformSection"
import AIInsightBlock from "./AIInsightBlock"
import OpportunityList from "./OpportunityList"
import type { Report } from "@/lib/mock/report"

type Props = { report: Report }

function fmtDate(iso: string) {
  return new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" })
}

export default function ReportView({ report }: Props) {
  return (
    <div className="max-w-3xl mx-auto">
      <PageHeader
        title="30-Day Performance Report"
        subtitle={`${fmtDate(report.period.start)} — ${fmtDate(report.period.end)} · Generated ${fmtDate(report.generated_at)}`}
      />

      <OverviewStats overview={report.overview} />

      <h3 className="font-semibold text-sm mb-3 text-muted-foreground uppercase tracking-wide">
        Platform Breakdown
      </h3>
      {report.platforms.map((p) => (
        <PlatformSection key={p.platform} summary={p} />
      ))}

      <div className="mt-6">
        <AIInsightBlock insight={report.ai_insight} />
      </div>

      <OpportunityList opportunities={report.opportunities} />
    </div>
  )
}
