import Image from 'next/image'
import { Printer } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from '../../components/ui/Button'
import { farmSettings } from '../../data/farmSettings'

// A clean A4 page for receipts and statements. On screen it shows inside the app with a Print
// button; when printed (or saved as PDF from the print dialog) only the sheet is printed.

const PRINT_CSS = `
@media print {
  @page { size: A4; margin: 14mm; }
  html, body { background: #fff !important; }
  body:has(.print-sheet) aside, .print-hide { display: none !important; }
  body * { visibility: hidden !important; }
  .print-sheet, .print-sheet * { visibility: visible !important; }
  .print-sheet { position: absolute; left: 0; top: 0; width: 100%; max-width: none; margin: 0; padding: 0; box-shadow: none; border: 0; }
}
`

type Props = {
  /** "Receipt", "Customer statement"… */
  kind: string
  /** Reference shown under the kind, e.g. S-1042. */
  docRef: string
  children: ReactNode
}

export function PrintSheet({ kind, docRef, children }: Props) {
  const name = farmSettings.tradingAs ?? farmSettings.farmName
  const contact = [farmSettings.address, farmSettings.phone, farmSettings.email].filter(Boolean)
  return (
    <>
      <style>{PRINT_CSS}</style>
      <div className="print-hide flex flex-wrap items-center gap-3">
        <p className="flex-1 type-body-md text-fg-secondary">Use Print, then choose “Save as PDF” to download a copy.</p>
        <Button variant="primary" leadingIcon={Printer} onClick={() => window.print()}>
          Print / Save as PDF
        </Button>
      </div>
      <article className="print-sheet relative mx-auto flex w-full max-w-[794px] flex-col gap-6 rounded-lg border border-line bg-white p-5 text-[#1a1a1a] shadow-xs sm:p-10">
        <header className="flex items-start gap-3 border-b border-line pb-5">
          <Image src="/logo-mark.svg" width={22} height={28} alt="" className="mt-1" />
          <div className="flex min-w-0 flex-1 flex-col">
            <span className="type-h3">{name}</span>
            {name !== farmSettings.farmName && <span className="type-body-sm text-fg-tertiary">{farmSettings.farmName}</span>}
            {contact.map((line) => (
              <span key={line} className="type-body-sm text-fg-secondary">
                {line}
              </span>
            ))}
          </div>
          <div className="flex flex-col items-end">
            <span className="type-overline text-fg-tertiary">{kind}</span>
            <span className="type-mono-sm text-fg-secondary">{docRef}</span>
          </div>
        </header>
        {children}
        {farmSettings.receiptFooter && <footer className="border-t border-line pt-4 type-body-sm text-fg-secondary">{farmSettings.receiptFooter}</footer>}
      </article>
    </>
  )
}

