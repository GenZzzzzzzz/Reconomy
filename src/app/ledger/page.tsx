"use client"

import { useRouter } from "next/navigation"
import { useMemo, useState } from "react"
import { Button } from "@/components/ui/button"
import { EmptyCard, Metric, Screen } from "@/components/desk/pieces"
import { caseQuotes, displayBrand, displayCategory, isClosed } from "@/lib/cases"
import { useDesk } from "@/lib/desk"
import { formatMoney, formatWhen, METRICS, moneyTone, PAGE_COPY, recommendedQuote, ROUTES, type RouteName } from "@/lib/model"
import { cn } from "@/lib/utils"

export default function LedgerPage() {
  const router = useRouter()
  const { cases, settings } = useDesk()
  const [route, setRoute] = useState<RouteName | "All">("All")
  const [overrides, setOverrides] = useState(false)
  const rows = useMemo(() => {
    return cases
      .filter(isClosed)
      .filter((item) => {
        if (!overrides) return true
        const quotes = caseQuotes(item)
        if (!quotes || !item.approvedRoute) return false
        return recommendedQuote(quotes).route !== item.approvedRoute
      })
      .filter((item) => (route === "All" ? true : item.approvedRoute === route))
      .sort((a, b) => (b.approvedAt ?? b.updatedAt).localeCompare(a.approvedAt ?? a.updatedAt))
  }, [cases, route, overrides])

  return (
    <Screen
      wide
      title={PAGE_COPY.ledger.title}
      helper={PAGE_COPY.ledger.helper}
      footer={
        <>
          <p className="font-mono text-[12px] text-faint">{rows.length} closed cases</p>
          <Button type="button" className="font-sans" onClick={() => router.push("/")}>
            Back to the queue
          </Button>
        </>
      }
    >
      <div className="mb-4 flex flex-wrap gap-2">
        <Filter active={!overrides} onClick={() => setOverrides(false)}>
          All closed
        </Filter>
        <Filter active={overrides} onClick={() => setOverrides(true)}>
          Overrides
        </Filter>
        {(["All", ...ROUTES] as const).map((value) => (
          <Filter key={value} active={route === value} onClick={() => setRoute(value)}>
            {value === "All" ? "All routes" : value}
          </Filter>
        ))}
      </div>
      {rows.length === 0 ? (
        <EmptyCard title="Nothing closed in this view" body="Approve a case, or clear the override filter." />
      ) : (
        <div className="desk-card overflow-x-auto">
          <table className="w-full min-w-[760px] text-left">
            <thead>
              <tr className="border-b border-border">
                {["Closed", "Item", "Approved", "Recommended"].map((label) => (
                  <th key={label} className="px-3 py-3 font-mono text-[12px] font-medium tracking-[0.04em] text-faint uppercase">
                    {label}
                  </th>
                ))}
                <th className="px-3 py-3 font-mono text-[12px] font-medium tracking-[0.04em] text-faint uppercase">NRV</th>
                <th className="px-3 py-3 font-mono text-[12px] font-medium tracking-[0.04em] text-faint uppercase">Record</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((item) => {
                const quotes = caseQuotes(item)
                const winner = quotes ? recommendedQuote(quotes) : null
                const approved = quotes?.find((quote) => quote.route === item.approvedRoute) ?? winner
                const overridden = winner && item.approvedRoute && winner.route !== item.approvedRoute
                return (
                  <tr key={item.id} className="border-b border-border last:border-0">
                    <td className="px-3 py-3 font-mono text-[12px] text-muted-foreground">{formatWhen(item.approvedAt ?? item.updatedAt)}</td>
                    <td className="px-3 py-3">
                      <span className="block font-sans text-sm">{displayCategory(item.category)}</span>
                      <span className="font-mono text-[12px] text-muted-foreground">{displayBrand(item.brand)}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-sm">{item.approvedRoute}</td>
                    <td className="px-3 py-3 font-mono text-sm text-muted-foreground">{winner?.route ?? "—"}</td>
                    <td className="px-3 py-3">
                      {approved ? (
                        <Metric
                          label={METRICS.nrv.label}
                          tooltip={METRICS.nrv.tooltip}
                          value={formatMoney(approved.nrv, settings.currency)}
                          tone={moneyTone(approved.nrv)}
                        />
                      ) : (
                        <span className="font-mono text-sm text-faint">—</span>
                      )}
                    </td>
                    <td className="px-3 py-3">
                      <button
                        type="button"
                        className="font-sans text-sm text-cyan"
                        onClick={() => router.push(`/assess?case=${item.id}&step=result`)}
                      >
                        {overridden ? "Override" : "Open"}
                      </button>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Screen>
  )
}

function Filter({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn("rounded-full px-3 py-1 font-mono text-[12px]", active ? "bg-cyan text-[#0B0F17]" : "border border-border text-muted-foreground")}
    >
      {children}
    </button>
  )
}
