'use client'

import { PageHeader } from '../components/layout/PageHeader'
import { Card } from '../components/ui/Card'

/** Stand-in for screens not built yet. */
export default function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} />
      <Card className="items-center justify-center p-12">
        <p className="type-body-md text-fg-tertiary">This screen is coming next.</p>
      </Card>
    </>
  )
}
