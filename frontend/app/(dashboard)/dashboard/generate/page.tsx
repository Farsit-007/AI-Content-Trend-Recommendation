import { Suspense } from "react"
import ContentGenerator from "@/components/generate/ContentGenerator"

export const metadata = { title: "Generate — Growth Studio" }

export default function GeneratePage() {
  return (
    <Suspense>
      <ContentGenerator />
    </Suspense>
  )
}
