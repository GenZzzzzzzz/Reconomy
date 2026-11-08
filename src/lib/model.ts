export const ROUTES = ["Resell", "Refurbish", "Donate", "Scrap"] as const
export type RouteName = (typeof ROUTES)[number]

export const CATEGORIES = ["Apparel", "Electronics", "Home", "Appliances", "Toys", "Other"] as const
export type Category = (typeof CATEGORIES)[number]

export const CONDITIONS = ["A", "B", "C", "D"] as const
export type Condition = (typeof CONDITIONS)[number]

export const DEFECTS = ["cosmetic", "functional", "missing", "hygiene"] as const
export type Defect = (typeof DEFECTS)[number]

export const STEPS = ["upload", "assess", "compare", "approve", "result"] as const
export type StepId = (typeof STEPS)[number]

export const CURRENCIES = ["USD", "EUR", "GBP"] as const
export type Currency = (typeof CURRENCIES)[number]

export const LOW_CONFIDENCE = 60

export const METRICS = {
  nrv: {
    label: "NRV",
    tooltip:
      "Net recovery value. Expected proceeds minus the cost to complete this option. The highest NRV is recommended.",
  },
  proceeds: {
    label: "Expected proceeds",
    tooltip: "What you are expected to recover if this option is completed, before costs.",
  },
  cost: {
    label: "Realization cost",
    tooltip: "Labor, materials, fees, and shipping required to complete this option.",
  },
  confidence: {
    label: "Confidence",
    tooltip: "How sure the model is, based only on the photos and the identified category.",
  },
  rank: {
    label: "Rank",
    tooltip: "Place among the four options, from highest net recovery value to lowest.",
  },
  stake: {
    label: "NRV at stake",
    tooltip: "Sum of recommended net recovery value for open cases that still need a decision.",
  },
} as const

export const STEP_COPY: Record<StepId, { title: string; helper: string; label: string }> = {
  upload: {
    label: "Upload",
    title: "Add photos of the return",
    helper: "One item per case. Photograph the whole item and any damage.",
  },
  assess: {
    label: "Assess",
    title: "What the photos show",
    helper: "Category is required. Brand appears only when it is visible.",
  },
  compare: {
    label: "Compare",
    title: "Recovery options",
    helper: "Ranked by net recovery value. The glowing option is the recommendation.",
  },
  approve: {
    label: "Approve",
    title: "Confirm the decision",
    helper: "Accept the recommendation, or choose a different option.",
  },
  result: {
    label: "Result",
    title: "Decision recorded",
    helper: "This case is closed. The path below is what happens to the item.",
  },
}

export const PAGE_COPY = {
  queue: {
    title: "Return queue",
    helper: "Open cases on this desk. Select one to read the recommendation before you approve it.",
  },
  playbooks: {
    title: "Recovery playbooks",
    helper: "Rules this desk uses to judge condition, close a route, and read a net recovery value.",
  },
  ledger: {
    title: "Decision ledger",
    helper: "Closed cases stay here, with the approved route and the model recommendation side by side.",
  },
  guide: {
    title: "Desk guide",
    helper: "How a return moves from photos to a locked route, and how net recovery value is read.",
  },
  settings: {
    title: "Desk settings",
    helper: "Currency and review rules for this desk. The theme stays dark.",
  },
} as const

export const CONDITION_COPY: Record<Condition, string> = {
  A: "Sellable, no visible wear",
  B: "Light wear, complete",
  C: "Heavy wear",
  D: "Severe damage",
}

export const DEFECT_COPY: Record<Defect, string> = {
  cosmetic: "Cosmetic",
  functional: "Functional",
  missing: "Missing part",
  hygiene: "Hygiene hold",
}

export const NEXT_ACTION: Record<RouteName, string> = {
  Resell: "Move the item to the resale cage. Do not send it to repair.",
  Refurbish: "Send the item to the repair bench with the defect list on this case.",
  Donate: "Pallet the item for the donation partner. Keep it out of resale.",
  Scrap: "Place the item in the scrap cage for the next disposal pickup.",
}

export const OVERRIDE_REASONS = [
  "Condition on the bench is worse than the photos",
  "The resale channel will not accept this category",
  "Safety or hygiene hold",
  "Repair parts are not in stock",
  "A customer agreement names a different route",
] as const

const BASE: Record<Category, number> = {
  Electronics: 220,
  Apparel: 64,
  Home: 110,
  Appliances: 180,
  Toys: 36,
  Other: 45,
}

const SALVAGE: Record<Category, number> = {
  Electronics: 0.08,
  Apparel: 0.02,
  Home: 0.05,
  Appliances: 0.1,
  Toys: 0.02,
  Other: 0.03,
}

const DISPOSAL: Record<Category, number> = {
  Electronics: 6,
  Apparel: 1,
  Home: 15,
  Appliances: 12,
  Toys: 1,
  Other: 4,
}

const CONDITION_FACTOR: Record<Condition, number> = {
  A: 0.95,
  B: 0.8,
  C: 0.55,
  D: 0.25,
}

const REPAIR: Record<Defect, number> = {
  cosmetic: 14,
  functional: 52,
  missing: 36,
  hygiene: 10,
}

export type CostLine = { label: string; amount: number }

export type OptionQuote = {
  route: RouteName
  open: boolean
  closedReason: string | null
  proceeds: number
  cost: number
  lines: CostLine[]
  nrv: number
  rank: number | null
  recommended: boolean
}

export type QuoteInput = {
  category: Category
  condition: Condition
  defects: Defect[]
  packaging: boolean
}

export function cents(value: number) {
  return Math.round(value * 100) / 100
}

export function stepIndex(step: StepId) {
  return STEPS.indexOf(step)
}

export function hasDefect(defects: Defect[], defect: Defect) {
  return defects.includes(defect)
}

export function buildQuotes(input: QuoteInput): OptionQuote[] {
  const base = BASE[input.category]
  const factor = CONDITION_FACTOR[input.condition]
  const asIs = cents(base * factor * (input.packaging ? 1 : 0.92))
  const functional = hasDefect(input.defects, "functional")
  const hygiene = hasDefect(input.defects, "hygiene")

  const repair = cents(
    input.defects.reduce((sum, defect) => sum + REPAIR[defect], 0) + (input.defects.length === 0 ? 8 : 0),
  )

  const drafts: Omit<OptionQuote, "rank" | "recommended">[] = [
    quoteRoute("Resell", !functional && !hygiene, functional
      ? "Closed. A functional fault cannot be resold as-is."
      : hygiene
        ? "Closed. A hygiene hold cannot go to resale."
        : null, asIs, [
      { label: "Channel fees", amount: cents(asIs * 0.12) },
      { label: "Handling", amount: 5 },
    ]),
    quoteRoute(
      "Refurbish",
      !hygiene,
      hygiene ? "Closed. A hygiene hold is not repaired back into resale." : null,
      functional && input.condition === "D" ? cents(base * 0.5) : cents(base * 0.78),
      [],
    ),
    quoteRoute("Donate", !functional, functional ? "Closed. A functional fault is not accepted for donation." : null, cents(asIs * 0.25), [
      { label: "Shipping", amount: 3 },
    ]),
    quoteRoute("Scrap", true, null, cents(base * SALVAGE[input.category]), [
      { label: "Disposal", amount: DISPOSAL[input.category] },
    ]),
  ]

  const refurbish = drafts.find((draft) => draft.route === "Refurbish")
  if (refurbish) {
    const fees = cents(refurbish.proceeds * 0.12)
    refurbish.lines = [
      { label: "Repair", amount: repair },
      { label: "Channel fees", amount: fees },
      { label: "Handling", amount: 8 },
    ]
    refurbish.cost = cents(refurbish.lines.reduce((sum, line) => sum + line.amount, 0))
    refurbish.nrv = cents(refurbish.proceeds - refurbish.cost)
  }

  const open = drafts
    .filter((draft) => draft.open)
    .sort((a, b) => b.nrv - a.nrv || ROUTES.indexOf(a.route) - ROUTES.indexOf(b.route))
  const closed = drafts.filter((draft) => !draft.open).sort((a, b) => ROUTES.indexOf(a.route) - ROUTES.indexOf(b.route))
  const ranked = [...open, ...closed]

  return ranked.map((draft, index) => ({
    ...draft,
    rank: draft.open ? index + 1 : null,
    recommended: draft.open && index === 0,
  }))
}

function quoteRoute(
  route: RouteName,
  open: boolean,
  closedReason: string | null,
  proceeds: number,
  lines: CostLine[],
): Omit<OptionQuote, "rank" | "recommended"> {
  const cost = cents(lines.reduce((sum, line) => sum + line.amount, 0))
  return {
    route,
    open,
    closedReason,
    proceeds,
    cost,
    lines,
    nrv: cents(proceeds - cost),
  }
}

export function routeReading(quote: OptionQuote) {
  if (!quote.open) return quote.closedReason ?? "Closed."
  if (quote.route === "Resell") return "Open. Sold as-is, after channel fees and handling."
  if (quote.route === "Refurbish") return "Open. Restored value, minus repair, fees, and bench handling."
  if (quote.route === "Donate") return "Open. A quarter of the as-is value, minus shipping to the partner."
  return "Open. Salvage minus disposal. This route never closes."
}

export function recommendedQuote(quotes: OptionQuote[]) {
  const winner = quotes.find((quote) => quote.recommended)
  if (!winner) throw new Error("Every case has a recommended route.")
  return winner
}

export function leadSentence(quotes: OptionQuote[], currency: Currency) {
  const winner = recommendedQuote(quotes)
  const next = quotes.find((quote) => quote.open && !quote.recommended)
  if (!next) return `${winner.route} is the only open route.`
  const gap = cents(winner.nrv - next.nrv)
  return `${winner.route} leads ${next.route} by ${formatMoney(gap, currency)}.`
}

export function costTooltip(quote: OptionQuote, currency: Currency) {
  const detail = quote.lines
    .map((line) => `${line.label} ${formatMoney(line.amount, currency)}`)
    .join(", ")
  return `${METRICS.cost.tooltip} On this option: ${detail}.`
}

export function scoreConfidence(input: {
  photoCount: number
  brand: string | null
  defects: Defect[]
  categoryCorrected: boolean
}) {
  const photos = Math.min(Math.max(input.photoCount, 0), 4)
  let score = 34 + photos * 13
  if (input.brand) score += 6
  if (photos >= 4) score += 4
  if (hasDefect(input.defects, "functional") && photos < 2) score -= 18
  if (input.categoryCorrected) score -= 8
  return Math.max(28, Math.min(96, score))
}

export function formatMoney(amount: number, currency: Currency) {
  const formatted = new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.abs(amount))
  return amount < 0 ? `-${formatted}` : formatted
}

export function formatPercent(value: number) {
  return `${Math.round(value)}%`
}

export function moneyTone(amount: number): "positive" | "zero" | "negative" {
  if (amount < 0) return "negative"
  if (amount === 0) return "zero"
  return "positive"
}

export function formatWhen(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(iso))
}

export function formatDay(iso: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(new Date(iso))
}

export function referenceValue(category: Category) {
  return BASE[category]
}
