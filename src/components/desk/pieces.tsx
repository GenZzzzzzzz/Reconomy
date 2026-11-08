"use client"

import { Check } from "lucide-react"
import type { ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { caseConfidence, displayBrand, type CaseRecord } from "@/lib/cases"
import {
  costTooltip,
  formatMoney,
  formatPercent,
  LOW_CONFIDENCE,
  METRICS,
  moneyTone,
  routeReading,
  type Currency,
  type OptionQuote,
} from "@/lib/model"
import { cn } from "@/lib/utils"

export function Screen({
  title,
  helper,
  aside,
  wide = false,
  children,
  footer,
}: {
  title: string
  helper: string
  aside?: ReactNode
  wide?: boolean
  children: ReactNode
  footer?: ReactNode
}) {
  return (
    <div className="flex min-h-full flex-col px-4 py-6 md:px-6">
      <div className={cn("mx-auto flex w-full flex-1 flex-col", wide ? "max-w-none" : "max-w-[1120px]")}>
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-sans text-[28px] leading-[34px] font-semibold tracking-tight">{title}</h1>
            <p className="mt-2 max-w-2xl font-sans text-sm leading-5 text-muted-foreground">{helper}</p>
          </div>
          {aside}
        </div>
        <div className="mt-6 flex-1">{children}</div>
        {footer ? <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">{footer}</div> : null}
      </div>
    </div>
  )
}

export function Metric({
  label,
  tooltip,
  value,
  tone = "default",
  size = "md",
  extra,
}: {
  label: string
  tooltip: string
  value: string
  tone?: "default" | "positive" | "zero" | "negative"
  size?: "md" | "lg"
  extra?: string
}) {
  const toneClass =
    tone === "positive" ? "text-success" : tone === "zero" ? "text-warning" : tone === "negative" ? "text-danger" : "text-foreground"
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button type="button" className="block rounded-md text-left">
          <span className="block font-mono text-[12px] leading-4 font-medium tracking-[0.04em] text-faint uppercase">{label}</span>
          <span className={cn("mt-1 block font-mono font-medium tabular-nums", size === "lg" ? "text-2xl leading-8" : "text-sm leading-5", toneClass)}>
            {value}
            {extra ? <span className="ml-2 text-[12px] text-warning">{extra}</span> : null}
          </span>
        </button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={8} className="block max-w-xs px-3 py-2">
        <p className="font-mono text-[11px] tracking-[0.04em] uppercase">{label}</p>
        <p className="mt-1 font-sans text-sm leading-5 text-foreground">{tooltip}</p>
      </TooltipContent>
    </Tooltip>
  )
}

export function ItemMark({ category, brand }: { category: string; brand: string }) {
  return (
    <div className="desk-card flex aspect-[4/3] w-full flex-col justify-between p-4" aria-hidden>
      <p className="font-mono text-[12px] tracking-[0.04em] text-cyan uppercase">{category}</p>
      <div className="mx-auto h-16 w-16 rounded-full border border-border" />
      <p className="font-mono text-[12px] text-muted-foreground">{brand}</p>
    </div>
  )
}

export function OptionCard({
  quote,
  item,
  currency,
  showLines,
  selected = false,
  onSelect,
}: {
  quote: OptionQuote
  item: CaseRecord
  currency: Currency
  showLines: boolean
  selected?: boolean
  onSelect?: () => void
}) {
  const confidence = caseConfidence(item)
  const low = confidence < LOW_CONFIDENCE
  const interactive = Boolean(onSelect) && quote.open
  return (
    <article
      className={cn(
        "desk-card flex h-full flex-col p-4",
        quote.recommended && "is-recommended",
        selected && "is-selected",
        !quote.open && "is-closed",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <h2 className="font-mono text-sm leading-5 font-medium">{quote.route}</h2>
        <div className="flex flex-col items-end gap-1">
          {quote.recommended ? (
            <span className="font-mono text-[12px] leading-4 font-medium tracking-[0.04em] text-cyan uppercase">Recommended</span>
          ) : null}
          {selected ? (
            <span className="inline-flex items-center gap-1 font-mono text-[12px] text-foreground">
              <Check className="size-3.5 text-cyan" aria-hidden />
              Selected
            </span>
          ) : null}
          {!quote.open ? <span className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">Closed</span> : null}
        </div>
      </div>
      <div className="mt-4 grid gap-3">
        <Metric
          label={METRICS.nrv.label}
          tooltip={METRICS.nrv.tooltip}
          value={quote.open ? formatMoney(quote.nrv, currency) : "—"}
          tone={quote.open ? moneyTone(quote.nrv) : "default"}
          size="lg"
        />
        <Metric
          label={METRICS.proceeds.label}
          tooltip={METRICS.proceeds.tooltip}
          value={quote.open ? formatMoney(quote.proceeds, currency) : "—"}
        />
        <Metric
          label={METRICS.cost.label}
          tooltip={quote.open ? costTooltip(quote, currency) : METRICS.cost.tooltip}
          value={quote.open ? formatMoney(quote.cost, currency) : "—"}
        />
        {showLines && quote.open ? (
          <p className="font-sans text-sm leading-5 text-muted-foreground">
            {quote.lines.map((line) => `${line.label} ${formatMoney(line.amount, currency)}`).join(" · ")}
          </p>
        ) : null}
        <Metric
          label={METRICS.confidence.label}
          tooltip={METRICS.confidence.tooltip}
          value={formatPercent(confidence)}
          extra={low ? "Low" : undefined}
          tone={low ? "zero" : "default"}
        />
        <Metric
          label={METRICS.rank.label}
          tooltip={METRICS.rank.tooltip}
          value={quote.rank ? String(quote.rank) : "—"}
        />
      </div>
      <p className="mt-4 font-sans text-sm leading-5 text-muted-foreground">{routeReading(quote)}</p>
      {interactive ? (
        <Button type="button" variant={selected ? "default" : "outline"} className="mt-4 font-sans" onClick={onSelect}>
          {selected ? "Chosen" : `Choose ${quote.route}`}
        </Button>
      ) : null}
    </article>
  )
}

export function EmptyCard({ title, body }: { title: string; body: string }) {
  return (
    <div className="desk-card p-6">
      <h2 className="font-sans text-base leading-6 font-medium">{title}</h2>
      <p className="mt-2 font-sans text-sm leading-5 text-muted-foreground">{body}</p>
    </div>
  )
}

export function ErrorCard({ message }: { message: string }) {
  return (
    <div className="desk-card is-error p-4">
      <p className="font-sans text-sm leading-5 text-danger">{message}</p>
    </div>
  )
}

export function LoadingCard({ label }: { label: string }) {
  return (
    <div className="desk-card p-6" role="status">
      <p className="font-sans text-sm leading-5 text-muted-foreground">{label}</p>
    </div>
  )
}

export function moneyClass(tone: "positive" | "zero" | "negative") {
  if (tone === "negative") return "text-danger"
  if (tone === "zero") return "text-warning"
  return "text-success"
}

export function displayBrandOf(item: Pick<CaseRecord, "brand">) {
  return displayBrand(item.brand)
}
