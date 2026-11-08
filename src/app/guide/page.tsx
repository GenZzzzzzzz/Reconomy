"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { EmptyCard, Screen } from "@/components/desk/pieces"
import { GUIDE, GUIDE_GROUPS, PLAYBOOKS } from "@/lib/content"
import { PAGE_COPY, STEP_COPY, STEPS } from "@/lib/model"
import { cn } from "@/lib/utils"

const ENTRIES = [
  {
    id: "start",
    kicker: "Required",
    title: "Start here",
    body: "One item, photos, then the open route with the highest net recovery value.",
  },
  {
    id: "five-steps",
    kicker: "Start",
    title: "The five steps",
    body: "Upload, assess, compare, approve, result. Go back to a finished step. Do not skip ahead.",
  },
  {
    id: "nrv",
    kicker: "Money",
    title: "Net recovery value",
    body: "Proceeds minus the cost to finish that route. The highest open value is the recommendation.",
  },
  {
    id: "never",
    kicker: "Policy",
    title: "What this desk never collects",
    body: "No product code, no barcode, no style number. Category, and a brand only when you can see it.",
  },
  {
    id: "routes",
    kicker: "Policy",
    title: "After the decision",
    body: "Resale cage, repair bench, donation pallet, or scrap cage. The ledger keeps the record.",
  },
] as const

export default function GuidePage() {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(GUIDE[0]?.id ?? "start")
  const matches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return GUIDE
    return GUIDE.filter((section) => `${section.title} ${section.paragraphs.join(" ")} ${(section.bullets ?? []).join(" ")}`.toLowerCase().includes(needle))
  }, [query])
  const section = matches.find((entry) => entry.id === active) ?? matches[0]

  return (
    <Screen title={PAGE_COPY.guide.title} helper={PAGE_COPY.guide.helper}>
      {query.trim() ? null : (
        <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {ENTRIES.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setActive(entry.id)}
              className={cn("desk-card p-4 text-left", section?.id === entry.id && "is-selected")}
            >
              <p className="font-mono text-[12px] tracking-[0.04em] text-cyan uppercase">{entry.kicker}</p>
              <p className="mt-2 font-sans text-base font-medium">{entry.title}</p>
              <p className="mt-2 font-sans text-sm leading-5 text-muted-foreground">{entry.body}</p>
            </button>
          ))}
          <Link href="/playbooks" className="desk-card p-4">
            <p className="font-mono text-[12px] tracking-[0.04em] text-cyan uppercase">Rules</p>
            <p className="mt-2 font-sans text-base font-medium">Recovery playbooks</p>
            <p className="mt-2 font-sans text-sm leading-5 text-muted-foreground">
              Condition, photo standard, and the faults that close a route.
            </p>
          </Link>
        </div>
      )}
      <div className="grid gap-4 lg:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="desk-card p-3">
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search the guide"
            aria-label="Search the guide"
            className="mb-3 font-sans"
          />
          {GUIDE_GROUPS.map((group) => {
            const sections = matches.filter((entry) => entry.group === group)
            if (sections.length === 0) return null
            return (
              <div key={group} className="mb-3">
                <p className="px-2 py-1 font-mono text-[12px] tracking-[0.04em] text-faint uppercase">{group}</p>
                {sections.map((entry) => (
                  <button
                    key={entry.id}
                    type="button"
                    onClick={() => setActive(entry.id)}
                    className={cn(
                      "block w-full rounded-md px-2 py-1.5 text-left font-sans text-sm",
                      section?.id === entry.id ? "bg-[#182033] text-cyan" : "text-muted-foreground",
                    )}
                  >
                    {entry.title}
                  </button>
                ))}
              </div>
            )
          })}
        </aside>
        {section ? (
          <article className="desk-card p-5">
            <p className="font-mono text-[12px] tracking-[0.04em] text-cyan uppercase">{section.group}</p>
            <h2 className="mt-2 font-sans text-base font-medium">{section.title}</h2>
            {section.paragraphs.map((paragraph) => (
              <p key={paragraph} className="mt-3 font-sans text-sm leading-6">
                {paragraph}
              </p>
            ))}
            {section.bullets ? (
              <ul className="mt-4 space-y-2">
                {section.bullets.map((bullet) => (
                  <li key={bullet} className="font-sans text-sm leading-5 text-muted-foreground">
                    {bullet}
                  </li>
                ))}
              </ul>
            ) : null}
            <ol className="mt-5 grid gap-3 md:grid-cols-5">
              {STEPS.map((step, index) => (
                <li key={step} className={cn("rounded-lg border border-border p-3", section.id === "five-steps" && "border-cyan/40")}>
                  <p className="font-mono text-[12px] text-cyan">
                    {index + 1} {STEP_COPY[step].label}
                  </p>
                  <p className="mt-2 font-sans text-sm text-muted-foreground">{STEP_COPY[step].helper}</p>
                </li>
              ))}
            </ol>
            {query.trim() ? null : (
              <div className="mt-6 border-t border-border pt-4">
                <p className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">Hot playbooks</p>
                <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                  {PLAYBOOKS.slice(0, 4).map((playbook) => (
                    <li key={playbook.slug}>
                      <Link href={`/playbooks/${playbook.slug}`} className="block rounded-lg border border-border p-3">
                        <span className="font-sans text-sm font-medium">{playbook.title}</span>
                        <span className="mt-1 block font-sans text-sm text-muted-foreground">{playbook.summary}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </article>
        ) : (
          <EmptyCard title="No guide entry matches" body="Try a step name, or a word like confidence, donate, or photos." />
        )}
      </div>
    </Screen>
  )
}
