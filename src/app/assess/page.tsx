"use client"

import Link from "next/link"
import { useRouter, useSearchParams } from "next/navigation"
import { Suspense, useEffect, useRef, useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { EmptyCard, ErrorCard, LoadingCard, Metric, OptionCard, Screen } from "@/components/desk/pieces"
import { caseConfidence, caseQuotes, displayBrand, isClosed, PHOTO_ROLES, type CaseRecord, type Photo, type PhotoRole } from "@/lib/cases"
import { SAMPLES } from "@/lib/content"
import { useDesk } from "@/lib/desk"
import {
  CATEGORIES,
  CONDITION_COPY,
  CONDITIONS,
  DEFECT_COPY,
  DEFECTS,
  formatPercent,
  leadSentence,
  LOW_CONFIDENCE,
  METRICS,
  NEXT_ACTION,
  OVERRIDE_REASONS,
  recommendedQuote,
  routeReading,
  STEP_COPY,
  stepIndex,
  type Category,
  type Condition,
  type Defect,
  type RouteName,
  type StepId,
} from "@/lib/model"
import { cn } from "@/lib/utils"

export default function AssessPage() {
  return (
    <Suspense fallback={<Screen title={STEP_COPY.upload.title} helper={STEP_COPY.upload.helper}><LoadingCard label="Loading the desk" /></Screen>}>
      <AssessInner />
    </Suspense>
  )
}

function AssessInner() {
  const router = useRouter()
  const params = useSearchParams()
  const { ready, cases, settings, createCase, save, applySample, applyDemoRead } = useDesk()
  const started = useRef(false)
  const caseId = params.get("case")
  const item = cases.find((entry) => entry.id === caseId) ?? null
  const [phase, setPhase] = useState<"reading" | "scoring" | null>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState(false)

  useEffect(() => {
    if (!ready || started.current) return
    const idFromUrl = new URLSearchParams(window.location.search).get("case")
    if (idFromUrl) return
    started.current = true
    const existing = cases.find((entry) => entry.step === "upload" && entry.photos.length === 0 && !entry.model)
    const id = existing?.id ?? createCase().id
    router.replace(`/assess?case=${id}&step=upload`)
  }, [ready, caseId, cases, createCase, router])

  if (!item) {
    return (
      <Screen title={STEP_COPY.upload.title} helper={STEP_COPY.upload.helper}>
        {ready && caseId ? (
          <EmptyCard title="That case is not on this desk" body="Go back to the queue and open a case from the list." />
        ) : (
          <LoadingCard label="Loading the desk" />
        )}
      </Screen>
    )
  }

  const requested = params.get("step") as StepId | null
  const step: StepId =
    requested && stepIndex(requested) <= stepIndex(item.step) ? requested : item.step
  const copy = STEP_COPY[step]
  const locked = isClosed(item)
  const quotes = caseQuotes(item)

  function go(next: StepId) {
    router.push(`/assess?case=${item!.id}&step=${next}`)
  }

  function addFiles(list: FileList | File[]) {
    if (locked) return
    const incoming = Array.from(list)
    const photos: Photo[] = []
    let error: string | null = null
    for (const file of incoming) {
      const heic = file.type === "image/heic" || file.name.toLowerCase().endsWith(".heic")
      if (heic) {
        error = "This browser cannot read that photo. Export it as JPG and add it again."
        continue
      }
      if (!file.type.startsWith("image/")) {
        error = "That file is not a photo. Add a JPG, PNG, or WEBP of the item."
        continue
      }
      photos.push({ id: crypto.randomUUID(), name: file.name, url: URL.createObjectURL(file), role: null })
    }
    setFileError(error)
    if (photos.length === 0) return
    save({ ...item!, photos: [...item!.photos, ...photos].slice(0, 8) }, "Photos added.")
  }

  return (
    <Screen
      title={copy.title}
      helper={copy.helper}
      footer={
        <Footer
          item={item}
          step={step}
          phase={phase}
          locked={locked}
          onBack={() => {
            const order: StepId[] = ["upload", "assess", "compare", "approve", "result"]
            const previous = order[stepIndex(step) - 1]
            if (previous) go(previous)
          }}
          onContinue={() => {
            if (step === "upload") {
              if (item.model) {
                go("assess")
                return
              }
              setPhase("reading")
              window.setTimeout(() => {
                applyDemoRead(item.id)
                setPhase(null)
                go("assess")
              }, 900)
              return
            }
            if (step === "assess") {
              setPhase("scoring")
              window.setTimeout(() => {
                const next = { ...item, step: "compare" as const }
                save(next, "Recovery options scored.")
                setPhase(null)
                go("compare")
              }, 700)
              return
            }
            if (step === "compare" && quotes) {
              const winner = recommendedQuote(quotes).route
              save({ ...item, step: "approve", selectedRoute: item.selectedRoute ?? winner }, "Ready for approval.")
              go("approve")
            }
          }}
          onApprove={() => {
            if (!quotes) return
            const winner = recommendedQuote(quotes).route
            const chosen = item.selectedRoute ?? winner
            save(
              {
                ...item,
                step: "result",
                selectedRoute: chosen,
                approvedRoute: chosen,
                approver: settings.operator,
                approvedAt: new Date().toISOString(),
                reviewed: true,
              },
              chosen === winner ? `Approved ${chosen}, matching the recommendation.` : `Approved ${chosen}. The model recommended ${winner}.`,
            )
            go("result")
          }}
          onNew={() => {
            const created = createCase()
            router.push(`/assess?case=${created.id}&step=upload`)
          }}
          onQueue={() => router.push("/")}
        />
      }
    >
      {phase === "reading" ? <LoadingCard label="Reading the photos" /> : null}
      {phase === "scoring" ? <LoadingCard label="Scoring recovery options" /> : null}
      {phase === null && step === "upload" ? (
        <UploadStep
          item={item}
          locked={locked}
          dragOver={dragOver}
          fileError={fileError}
          onDrag={setDragOver}
          onFiles={addFiles}
          onRemove={(id) => save({ ...item, photos: item.photos.filter((photo) => photo.id !== id) })}
          onRole={(id, role) =>
            save({
              ...item,
              photos: item.photos.map((photo) => (photo.id === id ? { ...photo, role: photo.role === role ? null : role } : photo)),
            })
          }
          onSample={(sampleId) => {
            setFileError(null)
            setPhase("reading")
            window.setTimeout(() => {
              applySample(item.id, sampleId)
              setPhase(null)
              go("assess")
            }, 700)
          }}
        />
      ) : null}
      {phase === null && step === "assess" ? <AssessStep item={item} locked={locked} save={save} /> : null}
      {phase === null && (step === "compare" || step === "approve" || step === "result") && quotes ? (
        <div className="grid gap-4">
          {step === "compare" ? <p className="font-sans text-sm text-muted-foreground">{leadSentence(quotes, settings.currency)}</p> : null}
          {step === "approve" && caseConfidence(item) < LOW_CONFIDENCE ? (
            <div className="desk-card border-warning p-4">
              <p className="font-sans text-sm text-warning">Low confidence. Add a note before you approve.</p>
            </div>
          ) : null}
          {step === "result" && item.approvedRoute && quotes.find((quote) => quote.recommended)?.route !== item.approvedRoute ? (
            <p className="font-sans text-sm text-muted-foreground">
              Approved {item.approvedRoute}. The recommendation was {quotes.find((quote) => quote.recommended)?.route}.
            </p>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {quotes.map((quote) => (
              <OptionCard
                key={quote.route}
                quote={quote}
                item={item}
                currency={settings.currency}
                showLines={settings.showCostLines}
                selected={step !== "compare" && (item.selectedRoute ?? item.approvedRoute) === quote.route}
                onSelect={
                  step === "approve" && !locked && quote.open
                    ? () =>
                        save({
                          ...item,
                          selectedRoute: quote.route,
                          overrideReason: quote.route === recommendedQuote(quotes).route ? null : item.overrideReason,
                        })
                    : undefined
                }
              />
            ))}
          </div>
          {step === "approve" && !locked && quotes ? <ApproveFields item={item} save={save} /> : null}
          {step === "result" && item.approvedRoute ? <ResultNotes item={item} /> : null}
        </div>
      ) : null}
      {phase === null && step !== "upload" && step !== "assess" && !quotes ? (
        <ErrorCard message="Set a category on Assess, then score the routes again." />
      ) : null}
    </Screen>
  )
}

const PHOTO_ROLE_COPY: Record<PhotoRole, { label: string; detail: string }> = {
  overview: { label: "Overview", detail: "The whole item, one frame." },
  damage: { label: "Damage", detail: "The wear that sets the grade." },
  mark: { label: "Brand mark", detail: "Only if a mark is visible." },
}

function UploadStep({
  item,
  locked,
  dragOver,
  fileError,
  onDrag,
  onFiles,
  onRemove,
  onRole,
  onSample,
}: {
  item: CaseRecord
  locked: boolean
  dragOver: boolean
  fileError: string | null
  onDrag: (value: boolean) => void
  onFiles: (files: FileList | File[]) => void
  onRemove: (id: string) => void
  onRole: (id: string, role: PhotoRole) => void
  onSample: (id: string) => void
}) {
  return (
    <div className="grid gap-4">
      <div
        className={cn("desk-card border-dashed p-6", dragOver && "border-cyan")}
        onDragOver={(event) => {
          event.preventDefault()
          onDrag(true)
        }}
        onDragLeave={() => onDrag(false)}
        onDrop={(event) => {
          event.preventDefault()
          onDrag(false)
          if (!locked) onFiles(event.dataTransfer.files)
        }}
      >
        <h2 className="font-sans text-base font-medium">Photos</h2>
        <p className="mt-2 font-sans text-sm leading-5 text-muted-foreground">
          Overview, damage, and a brand mark only if you can see one. One item in the frame.
        </p>
        <label className="mt-4 inline-flex">
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            disabled={locked}
            onChange={(event) => {
              if (event.target.files) onFiles(event.target.files)
              event.target.value = ""
            }}
          />
          <span className="inline-flex h-10 cursor-pointer items-center rounded-lg bg-cyan px-4 font-sans text-sm font-medium text-[#0B0F17]">
            Add photos
          </span>
        </label>
        {item.photos.length === 0 ? (
          <p className="mt-4 font-sans text-sm text-muted-foreground">No photos yet. Drop them here, or load a sample below.</p>
        ) : (
          <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            {item.photos.map((photo) => (
              <li key={photo.id} className="desk-card overflow-hidden">
                {photo.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={photo.url} alt="" className="aspect-square w-full object-cover" />
                ) : (
                  <div className="flex aspect-square items-center justify-center font-mono text-[12px] text-faint">{photo.name}</div>
                )}
                <div className="flex items-center justify-between gap-2 px-2 pt-2">
                  <span className="truncate font-mono text-[12px]">{photo.name}</span>
                  {!locked ? (
                    <button type="button" className="font-mono text-[12px] text-muted-foreground" onClick={() => onRemove(photo.id)}>
                      Remove
                    </button>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-1 p-2">
                  {PHOTO_ROLES.map((role) => (
                    <button
                      key={role}
                      type="button"
                      disabled={locked}
                      aria-pressed={photo.role === role}
                      onClick={() => onRole(photo.id, role)}
                      className={cn(
                        "rounded-full px-2 py-0.5 font-mono text-[12px]",
                        photo.role === role ? "bg-cyan text-[#0B0F17]" : "border border-border text-muted-foreground",
                      )}
                    >
                      {PHOTO_ROLE_COPY[role].label}
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      <div className="desk-card p-4">
        <h2 className="font-sans text-base font-medium">Photo standard</h2>
        <p className="mt-2 font-sans text-sm leading-5 text-muted-foreground">
          Tag what each photo proves. A missing tag does not block the case. Do not photograph a code.
        </p>
        <ul className="mt-4 grid gap-3 sm:grid-cols-3">
          {PHOTO_ROLES.map((role) => {
            const covered = item.photos.some((photo) => photo.role === role)
            return (
              <li key={role} className="rounded-lg border border-border p-3">
                <p className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">{PHOTO_ROLE_COPY[role].label}</p>
                <p className="mt-2 font-sans text-sm text-muted-foreground">{PHOTO_ROLE_COPY[role].detail}</p>
                <p className={cn("mt-2 font-mono text-[12px]", covered ? "text-success" : "text-warning")}>{covered ? "Covered" : "Not tagged"}</p>
              </li>
            )
          })}
        </ul>
      </div>
      {fileError ? <ErrorCard message={fileError} /> : null}
      <div className="desk-card p-4">
        <h2 className="font-sans text-base font-medium">Sample returns</h2>
        <p className="mt-2 font-sans text-sm text-muted-foreground">Prepared reads for this desk. They do not use your photos.</p>
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {SAMPLES.map((sample) => (
            <button
              key={sample.id}
              type="button"
              disabled={locked}
              onClick={() => onSample(sample.id)}
              className="desk-card p-4 text-left"
            >
              <span className="block font-sans text-sm font-medium">{sample.title}</span>
              <span className="mt-1 block font-sans text-sm text-muted-foreground">{sample.detail}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}

function AssessStep({
  item,
  locked,
  save,
}: {
  item: CaseRecord
  locked: boolean
  save: (item: CaseRecord, trail?: string) => void
}) {
  const confidence = caseConfidence(item)
  const quotes = caseQuotes(item)
  const corrected = item.model && item.category && item.category !== item.model.category
  const playbook = item.defects.includes("functional")
    ? { href: "/playbooks/functional-faults", label: "Functional faults" }
    : item.defects.includes("hygiene")
      ? { href: "/playbooks/hygiene-holds", label: "Hygiene holds" }
      : { href: "/playbooks/condition-grades", label: "Condition grades" }
  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(280px,0.85fr)]">
    <div className="desk-card p-5">
      <div className="grid gap-5 md:grid-cols-2">
        <label className="grid gap-2">
          <span className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">Category</span>
          <Select
            value={item.category ?? undefined}
            disabled={locked}
            onValueChange={(value) => save({ ...item, category: value as Category }, `Category set to ${value}.`)}
          >
            <SelectTrigger className="w-full font-sans">
              <SelectValue placeholder="Choose a category" />
            </SelectTrigger>
            <SelectContent>
              {CATEGORIES.map((category) => (
                <SelectItem key={category} value={category}>
                  {category}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <label className="grid gap-2">
          <span className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">Brand</span>
          <Input
            value={item.brand ?? ""}
            disabled={locked}
            placeholder="Not identified"
            className="font-sans"
            onChange={(event) => save({ ...item, brand: event.target.value.trim() ? event.target.value : null })}
          />
          <span className="font-sans text-sm text-muted-foreground">Optional. Leave blank when the mark is not visible.</span>
        </label>
        <label className="grid gap-2">
          <span className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">Condition</span>
          <Select
            value={item.condition ?? undefined}
            disabled={locked}
            onValueChange={(value) => save({ ...item, condition: value as Condition }, `Condition set to ${value}.`)}
          >
            <SelectTrigger className="w-full font-sans">
              <SelectValue placeholder="Grade the photos" />
            </SelectTrigger>
            <SelectContent>
              {CONDITIONS.map((condition) => (
                <SelectItem key={condition} value={condition}>
                  {condition} · {CONDITION_COPY[condition]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
        <div className="flex items-center justify-between gap-3 rounded-lg border border-border px-3">
          <span className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">Packaging present</span>
          <Switch
            checked={item.packaging}
            disabled={locked}
            onCheckedChange={(checked) => save({ ...item, packaging: checked })}
            aria-label="Packaging present"
          />
        </div>
      </div>
      <div className="mt-5">
        <p className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">Defects</p>
        <div className="mt-2 flex flex-wrap gap-2">
          {DEFECTS.map((defect) => {
            const on = item.defects.includes(defect)
            return (
              <button
                key={defect}
                type="button"
                disabled={locked}
                onClick={() => {
                  const defects: Defect[] = on ? item.defects.filter((entry) => entry !== defect) : [...item.defects, defect]
                  save({ ...item, defects })
                }}
                className={cn(
                  "rounded-full border px-3 py-1 font-mono text-[12px]",
                  on ? "border-cyan text-cyan" : "border-border text-muted-foreground",
                )}
              >
                {DEFECT_COPY[defect]}
              </button>
            )
          })}
        </div>
      </div>
      <p className="mt-5 font-sans text-sm leading-5">{item.model?.sentence}</p>
      {corrected ? (
        <p className="mt-2 font-sans text-sm text-muted-foreground">Corrected on the desk. The model read {item.model?.category}.</p>
      ) : null}
      <p className="mt-2 font-sans text-sm text-muted-foreground">Brand on the case: {displayBrand(item.brand)}.</p>
      <div className="mt-4">
        <Metric
          label={METRICS.confidence.label}
          tooltip={METRICS.confidence.tooltip}
          value={formatPercent(confidence)}
          extra={confidence < LOW_CONFIDENCE ? "Low" : undefined}
          tone={confidence < LOW_CONFIDENCE ? "zero" : "default"}
        />
      </div>
    </div>
    <div className="grid gap-4">
      <section className="desk-card p-4">
        <h2 className="font-sans text-base font-medium">Key points</h2>
        <ul className="mt-3 space-y-2">
          {(item.model?.evidence ?? ["No model read yet. Grade the photos on this card."]).map((point) => (
            <li key={point} className="font-sans text-sm leading-5 text-muted-foreground">
              {point}
            </li>
          ))}
        </ul>
      </section>
      <section className="desk-card p-4">
        <h2 className="font-sans text-base font-medium">What this grade does</h2>
        <p className="mt-2 font-sans text-sm leading-5 text-muted-foreground">
          Money and rank stay on the next step. This list is only which routes remain open.
        </p>
        {quotes ? (
          <ul className="mt-3 divide-y divide-border">
            {quotes.map((quote) => (
              <li key={quote.route} className="py-2">
                <p className={cn("font-mono text-[12px] tracking-[0.04em] uppercase", quote.open ? "text-foreground" : "text-faint")}>
                  {quote.route} · {quote.open ? "Open" : "Closed"}
                </p>
                <p className="mt-1 font-sans text-sm leading-5 text-muted-foreground">{routeReading(quote)}</p>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-3 font-sans text-sm text-muted-foreground">Set a category and a condition to see which routes close.</p>
        )}
        <Link href={playbook.href} className="mt-3 inline-block font-sans text-sm text-cyan">
          {playbook.label}
        </Link>
      </section>
    </div>
    </div>
  )
}

function ApproveFields({ item, save }: { item: CaseRecord; save: (item: CaseRecord, trail?: string) => void }) {
  const quotes = caseQuotes(item)
  if (!quotes) return null
  const winner = recommendedQuote(quotes).route
  const chosen = item.selectedRoute ?? winner
  const override = chosen !== winner
  return (
    <div className="desk-card grid gap-4 p-4">
      {override ? (
        <label className="grid gap-2">
          <span className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">Override reason</span>
          <Select value={item.overrideReason ?? undefined} onValueChange={(value) => save({ ...item, overrideReason: value })}>
            <SelectTrigger className="w-full font-sans">
              <SelectValue placeholder="Why this is not the recommendation" />
            </SelectTrigger>
            <SelectContent>
              {OVERRIDE_REASONS.map((reason) => (
                <SelectItem key={reason} value={reason}>
                  {reason}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </label>
      ) : null}
      <label className="grid gap-2">
        <span className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">Note</span>
        <textarea
          value={item.note}
          onChange={(event) => save({ ...item, note: event.target.value })}
          rows={3}
          className="rounded-lg border border-border bg-card px-3 py-2 font-sans text-sm"
          placeholder="What the approver should remember"
        />
      </label>
    </div>
  )
}

function ResultNotes({ item }: { item: CaseRecord }) {
  const route = item.approvedRoute
  if (!route) return null
  return (
    <div className="desk-card grid gap-3 p-4">
      <h2 className="font-sans text-base font-medium">What happens next</h2>
      <p className="font-sans text-sm leading-5">{NEXT_ACTION[route]}</p>
      <p className="font-mono text-[12px] text-muted-foreground">
        {item.approver || "Desk operator"} · {item.approvedAt ? new Date(item.approvedAt).toLocaleString("en-US", { timeZone: "America/Los_Angeles", timeZoneName: "short" }) : ""}
      </p>
      {item.overrideReason ? <p className="font-sans text-sm text-muted-foreground">{item.overrideReason}</p> : null}
      {item.note ? <p className="font-sans text-sm">{item.note}</p> : null}
      <ul className="space-y-1">
        {item.trail.map((entry, index) => (
          <li key={`${entry.at}-${index}`} className="font-sans text-sm text-muted-foreground">
            {entry.text}
          </li>
        ))}
      </ul>
    </div>
  )
}

function Footer({
  item,
  step,
  phase,
  locked,
  onBack,
  onContinue,
  onApprove,
  onNew,
  onQueue,
}: {
  item: CaseRecord
  step: StepId
  phase: "reading" | "scoring" | null
  locked: boolean
  onBack: () => void
  onContinue: () => void
  onApprove: () => void
  onNew: () => void
  onQueue: () => void
}) {
  const { settings } = useDesk()
  const quotes = caseQuotes(item)
  const winner = quotes ? recommendedQuote(quotes).route : null
  const chosen = (item.selectedRoute ?? winner) as RouteName | null
  const low = caseConfidence(item) < LOW_CONFIDENCE
  const override = Boolean(winner && chosen && chosen !== winner)
  const approveDisabled =
    !chosen ||
    phase !== null ||
    (override && settings.requireOverrideReason && !item.overrideReason) ||
    (low && settings.requireLowConfidenceNote && item.note.trim().length < 3)

  if (step === "result") {
    return (
      <>
        <p className="font-mono text-[12px] text-faint">{item.id} is closed.</p>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="font-sans" onClick={onNew}>
            Start another item
          </Button>
          <Button type="button" className="font-sans" onClick={onQueue}>
            Back to the queue
          </Button>
        </div>
      </>
    )
  }

  const continueDisabled =
    phase !== null ||
    locked ||
    (step === "upload" && item.photos.length === 0) ||
    (step === "assess" && !item.category) ||
    (step === "compare" && !quotes)

  return (
    <>
      <div>
        {step !== "upload" ? (
          <Button type="button" variant="outline" className="font-sans" onClick={onBack}>
            Back
          </Button>
        ) : (
          <p className="font-mono text-[12px] text-faint">{item.id}</p>
        )}
      </div>
      {step === "approve" ? (
        <Button type="button" className="font-sans" disabled={approveDisabled || locked} onClick={onApprove}>
          Approve {chosen ?? "route"}
        </Button>
      ) : (
        <Button type="button" className="font-sans" disabled={continueDisabled} onClick={onContinue}>
          Continue
        </Button>
      )}
    </>
  )
}
