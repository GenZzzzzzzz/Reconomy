"use client"

import { Pin, RefreshCw } from "lucide-react"
import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { useEffect, useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { EmptyCard, ItemMark, LoadingCard, Metric, Screen } from "@/components/desk/pieces"
import { caseConfidence, caseQuotes, displayBrand, displayCategory, isClosed, type CaseRecord } from "@/lib/cases"
import { useDesk } from "@/lib/desk"
import {
  formatMoney,
  formatPercent,
  formatWhen,
  LOW_CONFIDENCE,
  METRICS,
  moneyTone,
  PAGE_COPY,
  recommendedQuote,
  ROUTES,
  routeReading,
  STEP_COPY,
  type RouteName,
  type StepId,
} from "@/lib/model"
import { cn } from "@/lib/utils"

const PAGE_SIZE = 8
const STEP_ORDER: Record<StepId, number> = { approve: 0, compare: 1, assess: 2, upload: 3, result: 4 }

export default function QueuePage() {
  const router = useRouter()
  const params = useSearchParams()
  const q = (params.get("q") ?? "").trim().toLowerCase()
  const { cases, settings, selectedId, select, save, createCase } = useDesk()
  const [tab, setTab] = useState<"open" | "pinned">("open")
  const [route, setRoute] = useState<RouteName | "All">("All")
  const [page, setPage] = useState(0)
  const [refreshing, setRefreshing] = useState(false)
  const [updatedAt, setUpdatedAt] = useState<string | null>(null)
  const [writingId, setWritingId] = useState<string | null>(null)

  const filtered = useMemo(() => {
    return cases
      .filter((item) => (tab === "pinned" ? item.pinned : !isClosed(item)))
      .filter((item) => {
        if (route === "All") return true
        const quotes = caseQuotes(item)
        if (!quotes) return false
        return recommendedQuote(quotes).route === route
      })
      .filter((item) => {
        if (!q) return true
        return `${displayCategory(item.category)} ${displayBrand(item.brand)}`.toLowerCase().includes(q)
      })
      .sort((a, b) => STEP_ORDER[a.step] - STEP_ORDER[b.step] || b.updatedAt.localeCompare(a.updatedAt))
  }, [cases, tab, route, q])

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const safePage = Math.min(page, pageCount - 1)
  const visible = filtered.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE)
  const selected = filtered.find((item) => item.id === selectedId) ?? visible[0] ?? null

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target
      if (target instanceof HTMLElement && target.closest("input, textarea, select")) return
      if (event.key !== "j" && event.key !== "k" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return
      if (!selected) return
      event.preventDefault()
      const index = filtered.findIndex((item) => item.id === selected.id)
      const next = event.key === "j" || event.key === "ArrowDown" ? index + 1 : index - 1
      const item = filtered[next]
      if (!item) return
      select(item.id)
      setWritingId(item.id)
      window.setTimeout(() => setWritingId((current) => (current === item.id ? null : current)), 450)
      setPage(Math.floor(next / PAGE_SIZE))
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [filtered, selected, select])

  const stake = cases
    .filter((item) => !isClosed(item) && (item.step === "approve" || item.step === "compare"))
    .reduce((sum, item) => {
      const quotes = caseQuotes(item)
      return quotes ? sum + recommendedQuote(quotes).nrv : sum
    }, 0)

  const start = filtered.length === 0 ? 0 : safePage * PAGE_SIZE + 1
  const end = Math.min(filtered.length, (safePage + 1) * PAGE_SIZE)

  return (
    <Screen
      wide
      title={PAGE_COPY.queue.title}
      helper={PAGE_COPY.queue.helper}
      aside={
        <div className="flex items-center gap-4">
          <Metric label={METRICS.stake.label} tooltip={METRICS.stake.tooltip} value={formatMoney(stake, settings.currency)} tone={moneyTone(stake)} />
          <div className="text-right">
            <Button
              type="button"
              variant="outline"
              className="font-sans"
              onClick={() => {
                setRefreshing(true)
                window.setTimeout(() => {
                  setUpdatedAt(new Date().toISOString())
                  setRefreshing(false)
                }, 400)
              }}
            >
              <RefreshCw className="size-4" aria-hidden />
              Refresh
            </Button>
            <p className="mt-2 font-mono text-[12px] text-faint">
              List updated {formatWhen(updatedAt ?? cases[0]?.updatedAt ?? new Date().toISOString())}
            </p>
          </div>
        </div>
      }
      footer={
        <>
          <p className="font-mono text-[12px] text-faint">
            Showing {start}–{end} of {filtered.length}. J and K move the row.
          </p>
          <Button
            type="button"
            className="font-sans"
            onClick={() => {
              const created = createCase()
              router.push(`/assess?case=${created.id}&step=upload`)
            }}
          >
            New assessment
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        {(["open", "pinned"] as const).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => {
              setTab(value)
              setPage(0)
            }}
            className={cn(
              "rounded-full px-3 py-1 font-mono text-[12px] tracking-[0.04em] uppercase",
              tab === value ? "bg-cyan text-[#0B0F17]" : "border border-border text-muted-foreground",
            )}
          >
            {value === "open" ? "Open" : "Pinned"}
          </button>
        ))}
        <span className="mx-2 hidden h-4 w-px bg-border sm:inline" />
        {(["All", ...ROUTES] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={route === value}
            onClick={() => {
              setRoute(value)
              setPage(0)
              const next = cases.filter((item) => {
                if (tab === "pinned" ? !item.pinned : isClosed(item)) return false
                if (value === "All") return true
                const quotes = caseQuotes(item)
                return Boolean(quotes && recommendedQuote(quotes).route === value)
              })
              if (!next.some((item) => item.id === selectedId) && next[0]) select(next[0].id)
            }}
            className={cn(
              "min-h-9 rounded-full px-3 font-mono text-[12px]",
              route === value ? "bg-cyan text-[#0B0F17]" : "border border-border text-muted-foreground",
            )}
          >
            {value === "All" ? "All routes" : value}
          </button>
        ))}
      </div>
      {refreshing ? (
        <LoadingCard label="Refreshing the queue" />
      ) : filtered.length === 0 ? (
        <EmptyCard title="No cases in this view" body="Clear a filter, or start a new assessment from the footer." />
      ) : (
        <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.75fr)]">
          <ul className="grid gap-3 md:hidden">
            {visible.map((item) => {
              const quotes = caseQuotes(item)
              const winner = quotes ? recommendedQuote(quotes) : null
              return (
                <li key={item.id} className={cn("desk-card p-3", item.id === selected?.id && "is-selected")}>
                  <button
                    type="button"
                    onClick={() => {
                      select(item.id)
                      setWritingId(item.id)
                      window.setTimeout(() => setWritingId((current) => (current === item.id ? null : current)), 450)
                    }}
                    className="w-full text-left"
                  >
                    <span className="font-sans text-sm font-medium">{displayCategory(item.category)}</span>
                    <span className="mt-1 block font-mono text-[12px] text-muted-foreground">{displayBrand(item.brand)}</span>
                  </button>
                  <span className="mt-3 flex items-end justify-between gap-3">
                    <span className="font-mono text-sm">{winner ? winner.route : "—"}</span>
                    {winner ? (
                      <Metric
                        label={METRICS.nrv.label}
                        tooltip={METRICS.nrv.tooltip}
                        value={formatMoney(winner.nrv, settings.currency)}
                        tone={moneyTone(winner.nrv)}
                      />
                    ) : (
                      <span className="font-mono text-sm text-faint">—</span>
                    )}
                  </span>
                </li>
              )
            })}
          </ul>
          <div className="desk-card hidden overflow-x-auto md:block">
            <table className="w-full min-w-[680px] text-left">
              <thead>
                <tr className="border-b border-border">
                  <th className="px-3 py-3 font-mono text-[12px] font-medium tracking-[0.04em] text-faint uppercase">Received</th>
                  <th className="px-3 py-3 font-mono text-[12px] font-medium tracking-[0.04em] text-faint uppercase">Item</th>
                  <th className="px-3 py-3 font-mono text-[12px] font-medium tracking-[0.04em] text-faint uppercase">Step</th>
                  <th className="px-3 py-3 font-mono text-[12px] font-medium tracking-[0.04em] text-faint uppercase">Route</th>
                  <th className="px-3 py-3 font-mono text-[12px] font-medium tracking-[0.04em] text-faint uppercase">NRV</th>
                  <th className="px-3 py-3 font-mono text-[12px] font-medium tracking-[0.04em] text-faint uppercase">Pin</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((item) => (
                  <QueueRow
                    key={item.id}
                    item={item}
                    active={item.id === selected?.id}
                    currency={settings.currency}
                    onSelect={() => {
                    select(item.id)
                    setWritingId(item.id)
                    window.setTimeout(() => setWritingId((current) => (current === item.id ? null : current)), 450)
                  }}
                    onPin={() => save({ ...item, pinned: !item.pinned }, item.pinned ? "Pin removed." : "Pinned on the desk.")}
                  />
                ))}
              </tbody>
            </table>
          </div>
          <Preview
            item={selected}
            currency={settings.currency}
            writing={writingId === selected?.id}
            onPin={() => selected && save({ ...selected, pinned: !selected.pinned })}
            onReview={() => selected && save({ ...selected, reviewed: true }, "Marked reviewed.")}
          />
        </div>
      )}
      {pageCount > 1 ? (
        <div className="mt-4 flex items-center justify-end gap-2">
          <Button type="button" variant="outline" className="font-sans" disabled={safePage === 0} onClick={() => setPage(safePage - 1)}>
            Previous
          </Button>
          <span className="font-mono text-[12px] text-faint">
            {safePage + 1} / {pageCount}
          </span>
          <Button
            type="button"
            variant="outline"
            className="font-sans"
            disabled={safePage >= pageCount - 1}
            onClick={() => setPage(safePage + 1)}
          >
            Next
          </Button>
        </div>
      ) : null}
    </Screen>
  )
}

function caseHref(item: CaseRecord) {
  return `/assess?case=${item.id}&step=${item.step}`
}

function QueueRow({
  item,
  active,
  currency,
  onSelect,
  onPin,
}: {
  item: CaseRecord
  active: boolean
  currency: "USD" | "EUR" | "GBP"
  onSelect: () => void
  onPin: () => void
}) {
  const quotes = caseQuotes(item)
  const winner = quotes ? recommendedQuote(quotes) : null
  return (
    <tr
      className={cn("cursor-pointer border-b border-border last:border-0", active ? "bg-[#182033]" : "hover:bg-[#182033]/70")}
      onClick={onSelect}
    >
      <td className="px-3 py-3">
        <span className="font-mono text-[12px] text-muted-foreground">
          {!item.reviewed ? <span className="mr-2 inline-block size-1.5 rounded-full bg-cyan" aria-label="Not reviewed" /> : null}
          {formatWhen(item.updatedAt)}
        </span>
      </td>
      <td className="px-3 py-3">
        <Link href={caseHref(item)} className="block text-left" onClick={(event) => event.stopPropagation()}>
          <span className="block font-sans text-sm font-medium text-cyan">{displayCategory(item.category)}</span>
          <span className="font-mono text-[12px] text-muted-foreground">{displayBrand(item.brand)}</span>
        </Link>
      </td>
      <td className="px-3 py-3 font-mono text-[12px] text-muted-foreground">{STEP_COPY[item.step].label}</td>
      <td className="px-3 py-3 font-mono text-sm">{winner ? winner.route : "—"}</td>
      <td className="px-3 py-3">
        {winner ? (
          <Metric
            label={METRICS.nrv.label}
            tooltip={METRICS.nrv.tooltip}
            value={formatMoney(winner.nrv, currency)}
            tone={moneyTone(winner.nrv)}
          />
        ) : (
          <span className="font-mono text-sm text-faint">—</span>
        )}
      </td>
      <td className="px-3 py-3">
        <button
        type="button"
        aria-label={item.pinned ? "Remove pin" : "Pin case"}
        onClick={(event) => {
          event.stopPropagation()
          onPin()
        }}
        className="text-muted-foreground"
      >
          <Pin className={cn("size-4", item.pinned && "fill-cyan text-cyan")} />
        </button>
      </td>
    </tr>
  )
}

function Preview({
  item,
  currency,
  writing,
  onPin,
  onReview,
}: {
  item: CaseRecord | null
  currency: "USD" | "EUR" | "GBP"
  writing: boolean
  onPin: () => void
  onReview: () => void
}) {
  if (!item) return <EmptyCard title="Select a case" body="The read, the route, and the money show up here." />
  const quotes = caseQuotes(item)
  const winner = quotes ? recommendedQuote(quotes) : null
  const confidence = caseConfidence(item)
  return (
    <aside className="desk-card p-4 xl:sticky xl:top-0">
      <ItemMark category={displayCategory(item.category)} brand={displayBrand(item.brand)} />
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
        <p className="font-sans text-base leading-6 font-medium">{item.id}</p>
        <Button asChild className="font-sans">
          <Link href={caseHref(item)}>Open case</Link>
        </Button>
      </div>
      <p className="mt-1 font-mono text-[12px] text-muted-foreground">
        {STEP_COPY[item.step].label} · {item.reviewed ? "Reviewed" : "Not reviewed"}
        {item.approvedRoute ? ` · Approved ${item.approvedRoute}` : ""}
      </p>
      <p className="mt-2 font-sans text-sm leading-5 text-muted-foreground">
        {item.model?.sentence ?? "Photos are not on the case yet."}
      </p>
      {quotes ? (
        <ul className="mt-3 flex flex-wrap gap-2">
          {quotes.map((quote) => (
            <li
              key={quote.route}
              className={cn(
                "rounded-full border px-2 py-0.5 font-mono text-[12px]",
                quote.recommended ? "border-cyan text-cyan" : "border-border text-muted-foreground",
              )}
              title={routeReading(quote)}
            >
              {quote.route} {quote.open ? "open" : "closed"}
            </li>
          ))}
        </ul>
      ) : null}
      {winner ? (
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Metric label={METRICS.nrv.label} tooltip={METRICS.nrv.tooltip} value={formatMoney(winner.nrv, currency)} tone={moneyTone(winner.nrv)} size="lg" />
          <div>
            <p className="font-mono text-[12px] leading-4 font-medium tracking-[0.04em] text-faint uppercase">Route</p>
            <p className="mt-1 font-mono text-sm leading-5">{winner.route}</p>
          </div>
          <Metric
            label={METRICS.confidence.label}
            tooltip={METRICS.confidence.tooltip}
            value={formatPercent(confidence)}
            extra={confidence < LOW_CONFIDENCE ? "Low" : undefined}
            tone={confidence < LOW_CONFIDENCE ? "zero" : "default"}
          />
          <Metric label={METRICS.rank.label} tooltip={METRICS.rank.tooltip} value={winner.rank ? String(winner.rank) : "—"} />
        </div>
      ) : null}
      <h2 className="mt-5 font-sans text-base font-medium">Key points</h2>
      <ul className="mt-2 space-y-1">
        {(item.model?.evidence ?? ["No read yet."]).map((point) => (
          <li key={point} className="font-sans text-sm leading-5 text-muted-foreground">
            {point}
          </li>
        ))}
      </ul>
      <h2 className="mt-5 font-sans text-base font-medium">Desk read</h2>
      {writing ? (
        <p className="mt-2 font-sans text-sm text-muted-foreground" role="status">
          Writing the read...
        </p>
      ) : (
        <p className="mt-2 font-sans text-sm leading-5">
          {winner
            ? `${winner.route} is the recommendation at ${formatMoney(winner.nrv, currency)}. ${item.condition ? `Condition ${item.condition}.` : ""}`
            : "Add photos before this case can be scored."}
        </p>
      )}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" variant="outline" className="font-sans" onClick={onPin}>
          {item.pinned ? "Unpin" : "Pin"}
        </Button>
        <Button type="button" variant="outline" className="font-sans" onClick={onReview} disabled={item.reviewed}>
          {item.reviewed ? "Reviewed" : "Mark reviewed"}
        </Button>
      </div>
    </aside>
  )
}
