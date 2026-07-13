import ReportView from "@/components/report/ReportView"
import { MOCK_REPORT } from "@/lib/mock/report"

export const metadata = { title: "Report — Growth Studio" }

export default function ReportPage() {
  return <ReportView report={MOCK_REPORT} />
}
