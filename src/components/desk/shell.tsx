"use client"

import {
  BookOpen,
  Inbox,
  Library,
  ScanLine,
  ScrollText,
  Settings,
  Check,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, type ReactNode } from "react"
import { Input } from "@/components/ui/input"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { isClosed } from "@/lib/cases"
import { useDesk } from "@/lib/desk"
import { STEP_COPY, STEPS, stepIndex, type StepId } from "@/lib/model"
import { cn } from "@/lib/utils"

const NAV = [
  { href: "/", label: "Queue", icon: Inbox },
  { href: "/assess", label: "Assess", icon: ScanLine },
  { href: "/playbooks", label: "Playbooks", icon: BookOpen },
  { href: "/ledger", label: "Ledger", icon: ScrollText },
  { href: "/guide", label: "Guide", icon: Library },
  { href: "/settings", label: "Settings", icon: Settings },
]

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const router = useRouter()
  const params = useSearchParams()
  const { cases, selectedId, settings } = useDesk()
  const [query, setQuery] = useState(params.get("q") ?? "")
  const openCount = cases.filter((item) => !isClosed(item) && !item.reviewed).length

  const queryId = params.get("case")
  const focusId = pathname.startsWith("/assess") && queryId ? queryId : selectedId
  const focus = cases.find((item) => item.id === focusId) ?? null
  const requested = params.get("step")
  let current: StepId | null = focus?.step ?? null
  if (pathname.startsWith("/assess") && focus && requested && STEPS.includes(requested as StepId)) {
    if (stepIndex(requested as StepId) <= stepIndex(focus.step)) current = requested as StepId
  }

  return (
    <div className="flex h-dvh bg-background text-foreground">
      <a href="#content" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-3 focus:bg-card focus:px-3 focus:py-2">
        Skip to content
      </a>
      <aside className="hidden w-[92px] shrink-0 flex-col border-r border-border md:flex">
        <div className="flex h-14 items-center justify-center font-sans text-sm font-semibold">R</div>
        <nav className="flex flex-1 flex-col gap-1 px-2" aria-label="Desk">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative flex flex-col items-center gap-1 rounded-lg px-1 py-2 font-mono text-[10px] leading-3 tracking-[0.04em] uppercase",
                  active ? "bg-card text-cyan" : "text-faint hover:bg-card hover:text-foreground",
                )}
              >
                <Icon className="size-5" aria-hidden />
                {item.label}
                {item.href === "/" && openCount > 0 ? (
                  <span className="absolute top-1 right-2 font-mono text-[10px] text-cyan">{openCount}</span>
                ) : null}
              </Link>
            )
          })}
        </nav>
      </aside>
      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex h-14 items-center gap-3 border-b border-border px-4 md:px-6">
          <Link href="/" className="font-sans text-base font-semibold tracking-tight">
            Reconomy
          </Link>
          <form
            className="mx-auto hidden w-full max-w-md md:block"
            onSubmit={(event) => {
              event.preventDefault()
              router.push(query.trim() ? `/?q=${encodeURIComponent(query.trim())}` : "/")
            }}
          >
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search category or brand"
              aria-label="Search category or brand"
              className="h-9 border-border bg-card font-sans"
            />
          </form>
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="hidden font-mono text-[12px] tracking-[0.04em] text-faint uppercase sm:inline">Demo model</span>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={8} className="max-w-xs">
              Sample returns are prepared reads. Photos you add are not sent to a live vision model.
            </TooltipContent>
          </Tooltip>
          <Link href="/settings" className="ml-auto font-mono text-[12px] text-muted-foreground md:ml-0">
            {settings.operator}
          </Link>
        </header>
        <nav className="flex gap-2 overflow-x-auto border-b border-border px-3 py-2 md:hidden" aria-label="Desk">
          {NAV.map((item) => {
            const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href)
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "shrink-0 rounded-lg px-3 py-1.5 font-mono text-[12px] tracking-[0.04em] uppercase",
                  active ? "bg-card text-cyan" : "text-faint",
                )}
              >
                {item.label}
              </Link>
            )
          })}
        </nav>
        <div className="border-b border-border">
          <nav aria-label="Progress" className="overflow-x-auto px-4 py-3 md:px-6">
            <ol className="flex min-w-max items-center gap-2">
              {STEPS.map((step, index) => {
                const state = !current ? "upcoming" : index < stepIndex(current) ? "complete" : index === stepIndex(current) ? "current" : "upcoming"
                const clickable = state === "complete" && focus
                const content = (
                  <span className="inline-flex items-center gap-2">
                    <span
                      className={cn(
                        "inline-flex size-6 items-center justify-center rounded-full border font-mono text-[12px]",
                        state === "complete" && "border-success text-success",
                        state === "current" && "border-cyan text-cyan",
                        state === "upcoming" && "border-border text-faint",
                      )}
                    >
                      {state === "complete" ? <Check className="size-3.5" aria-hidden /> : index + 1}
                    </span>
                    <span
                      className={cn(
                        "font-mono text-[12px] leading-4 font-medium",
                        state === "complete" && "text-success",
                        state === "current" && "text-cyan",
                        state === "upcoming" && "text-faint",
                      )}
                    >
                      {STEP_COPY[step].label}
                    </span>
                  </span>
                )
                return (
                  <li key={step} className="flex items-center gap-2">
                    {clickable ? (
                      <button
                        type="button"
                        onClick={() => router.push(`/assess?case=${focus.id}&step=${step}`)}
                        className="rounded-md"
                      >
                        {content}
                      </button>
                    ) : (
                      <span aria-current={state === "current" ? "step" : undefined}>{content}</span>
                    )}
                    {index < STEPS.length - 1 ? <span className="h-px w-6 bg-border" aria-hidden /> : null}
                  </li>
                )
              })}
            </ol>
          </nav>
        </div>
        <main id="content" className="min-h-0 flex-1 overflow-auto" tabIndex={-1}>
          {children}
        </main>
      </div>
    </div>
  )
}
