"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { Input } from "@/components/ui/input"
import { EmptyCard, Screen } from "@/components/desk/pieces"
import { PLAYBOOKS } from "@/lib/content"
import { CATEGORIES, PAGE_COPY, STEP_COPY, type Category } from "@/lib/model"
import { cn } from "@/lib/utils"

export default function PlaybooksPage() {
  const [query, setQuery] = useState("")
  const [level, setLevel] = useState<"All" | "Core" | "Advanced">("All")
  const [category, setCategory] = useState<Category | "All">("All")
  const items = useMemo(() => {
    return PLAYBOOKS.filter((playbook) => (level === "All" ? true : playbook.level === level))
      .filter((playbook) => (category === "All" ? true : playbook.categories === "All" || playbook.categories.includes(category)))
      .filter((playbook) => {
        const haystack = `${playbook.title} ${playbook.summary}`.toLowerCase()
        return haystack.includes(query.trim().toLowerCase())
      })
  }, [query, level, category])

  return (
    <Screen
      title={PAGE_COPY.playbooks.title}
      helper={PAGE_COPY.playbooks.helper}
      footer={<p className="font-mono text-[12px] text-faint">{items.length} playbooks</p>}
    >
      <div className="mb-4 flex flex-col gap-3">
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search playbooks"
          aria-label="Search playbooks"
          className="max-w-md font-sans"
        />
        <div className="flex flex-wrap gap-2">
          {(["All", "Core", "Advanced"] as const).map((value) => (
            <FilterChip key={value} active={level === value} onClick={() => setLevel(value)}>
              {value === "All" ? "All levels" : value}
            </FilterChip>
          ))}
          <FilterChip active={category === "All"} onClick={() => setCategory("All")}>
            All categories
          </FilterChip>
          {CATEGORIES.map((value) => (
            <FilterChip key={value} active={category === value} onClick={() => setCategory(value)}>
              {value}
            </FilterChip>
          ))}
        </div>
      </div>
      {items.length === 0 ? (
        <EmptyCard title="No playbook matches" body="Try another word, or clear the level and category filters." />
      ) : (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {items.map((playbook) => (
            <article key={playbook.slug} className="desk-card flex flex-col p-4">
              <div className="flex items-center justify-between gap-2">
                <p className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">
                  {playbook.categories === "All" ? "All categories" : playbook.categories.join(", ")}
                </p>
                <span className="rounded-full border border-border px-2 py-0.5 font-mono text-[12px] text-cyan">{playbook.level}</span>
              </div>
              <h2 className="mt-3 font-sans text-base font-medium">{playbook.title}</h2>
              <p className="mt-2 flex-1 font-sans text-sm leading-5 text-muted-foreground">{playbook.summary}</p>
              <p className="mt-3 font-mono text-[12px] text-faint">
                {playbook.minutes} min · {STEP_COPY[playbook.usedAt].label}
              </p>
              <Link href={`/playbooks/${playbook.slug}`} className="mt-3 font-sans text-sm text-cyan">
                View playbook
              </Link>
            </article>
          ))}
        </div>
      )}
    </Screen>
  )
}

function FilterChip({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-full px-3 py-1 font-mono text-[12px]",
        active ? "bg-cyan text-[#0B0F17]" : "border border-border text-muted-foreground",
      )}
    >
      {children}
    </button>
  )
}
