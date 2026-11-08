"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import { OptionCard, Screen } from "@/components/desk/pieces"
import type { Playbook } from "@/lib/content"
import type { CaseRecord } from "@/lib/cases"
import { useDesk } from "@/lib/desk"
import { buildQuotes, STEP_COPY } from "@/lib/model"

const EXAMPLE: CaseRecord = {
  id: "example",
  createdAt: "",
  updatedAt: "",
  step: "compare",
  category: "Electronics",
  brand: "Example",
  condition: "B",
  defects: [],
  packaging: true,
  photos: [
    { id: "1", name: "Overview", url: "", role: "overview" },
    { id: "2", name: "Damage", url: "", role: "damage" },
    { id: "3", name: "Brand mark", url: "", role: "mark" },
    { id: "4", name: "Detail", url: "", role: "damage" },
  ],
  model: null,
  pinned: false,
  reviewed: false,
  selectedRoute: null,
  approvedRoute: null,
  overrideReason: null,
  note: "",
  approver: "",
  approvedAt: null,
  trail: [],
}

export function PlaybookView({ playbook }: { playbook: Playbook }) {
  const { settings } = useDesk()
  const example = playbook.slug === "when-resell-closes" ? buildQuotes({ category: "Electronics", condition: "B", defects: [], packaging: true }) : null
  return (
    <Screen
      title={playbook.title}
      helper={playbook.summary}
      footer={
        <>
          <Button asChild variant="outline" className="font-sans">
            <Link href="/playbooks">All playbooks</Link>
          </Button>
          <Button asChild className="font-sans">
            <Link href="/assess">Open assess</Link>
          </Button>
        </>
      }
    >
      <div className="grid gap-4">
        <article className="desk-card p-5">
          <p className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">
            {playbook.level} · {playbook.minutes} min · Used at {STEP_COPY[playbook.usedAt].label}
          </p>
          {playbook.paragraphs.map((paragraph) => (
            <p key={paragraph} className="mt-3 font-sans text-sm leading-6">
              {paragraph}
            </p>
          ))}
          <ul className="mt-4 space-y-2">
            {playbook.rules.map((rule) => (
              <li key={rule} className="font-sans text-sm leading-5 text-muted-foreground">
                {rule}
              </li>
            ))}
          </ul>
        </article>
        {example ? (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {example.map((quote) => (
              <OptionCard key={quote.route} quote={quote} item={EXAMPLE} currency={settings.currency} showLines={settings.showCostLines} />
            ))}
          </div>
        ) : null}
      </div>
    </Screen>
  )
}
