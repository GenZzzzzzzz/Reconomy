import { DEMO_READ, SAMPLES, type ModelRead } from "@/lib/content"
import {
  buildQuotes,
  recommendedQuote,
  scoreConfidence,
  type Category,
  type Condition,
  type Defect,
  type RouteName,
  type StepId,
} from "@/lib/model"

export const PHOTO_ROLES = ["overview", "damage", "mark"] as const
export type PhotoRole = (typeof PHOTO_ROLES)[number]

export type Photo = { id: string; name: string; url: string; role: PhotoRole | null }

export type TrailEntry = { at: string; text: string }

export type CaseRecord = {
  id: string
  createdAt: string
  updatedAt: string
  step: StepId
  category: Category | null
  brand: string | null
  condition: Condition | null
  defects: Defect[]
  packaging: boolean
  photos: Photo[]
  model: ModelRead | null
  pinned: boolean
  reviewed: boolean
  selectedRoute: RouteName | null
  approvedRoute: RouteName | null
  overrideReason: string | null
  note: string
  approver: string
  approvedAt: string | null
  trail: TrailEntry[]
}

export function stamp(item: CaseRecord, text?: string): CaseRecord {
  const at = new Date().toISOString()
  return {
    ...item,
    updatedAt: at,
    trail: text ? [...item.trail, { at, text }] : item.trail,
  }
}

export function isClosed(item: CaseRecord) {
  return item.step === "result" && item.approvedRoute !== null
}

export function caseConfidence(item: CaseRecord) {
  if (!item.category || !item.condition) return 0
  return scoreConfidence({
    photoCount: item.photos.length,
    brand: item.brand,
    defects: item.defects,
    categoryCorrected: Boolean(item.model && item.category !== item.model.category),
  })
}

export function caseQuotes(item: CaseRecord) {
  if (!item.category || !item.condition) return null
  return buildQuotes({
    category: item.category,
    condition: item.condition,
    defects: item.defects,
    packaging: item.packaging,
  })
}

export function displayBrand(brand: string | null) {
  return brand && brand.trim() ? brand.trim() : "Not identified"
}

export function displayCategory(category: Category | null) {
  return category ?? "Unidentified"
}

type Draft = {
  id: string
  at: string
  step: StepId
  read?: ModelRead
  photos?: number
  pinned?: boolean
  reviewed?: boolean
  note?: string
  approve?: RouteName | "model"
  overrideReason?: string
  trail?: string[]
}

function photosFor(id: string, count: number): Photo[] {
  const shots: { name: string; role: PhotoRole | null }[] = [
    { name: "Overview", role: "overview" },
    { name: "Damage", role: "damage" },
    { name: "Brand mark", role: "mark" },
    { name: "Detail", role: "damage" },
  ]
  return Array.from({ length: count }, (_, index) => ({
    id: `${id}-photo-${index + 1}`,
    name: shots[index]?.name ?? `Photo ${index + 1}`,
    url: "",
    role: shots[index]?.role ?? null,
  }))
}

function fromDraft(draft: Draft): CaseRecord {
  const read = draft.read ?? null
  const base: CaseRecord = {
    id: draft.id,
    createdAt: draft.at,
    updatedAt: draft.at,
    step: draft.step,
    category: read?.category ?? null,
    brand: read?.brand ?? null,
    condition: read?.condition ?? null,
    defects: read?.defects ?? [],
    packaging: read?.packaging ?? true,
    photos: photosFor(draft.id, draft.photos ?? 0),
    model: read,
    pinned: draft.pinned ?? false,
    reviewed: draft.reviewed ?? false,
    selectedRoute: null,
    approvedRoute: null,
    overrideReason: null,
    note: draft.note ?? "",
    approver: "",
    approvedAt: null,
    trail: (draft.trail ?? ["Case opened on the desk."]).map((text) => ({ at: draft.at, text })),
  }
  if (!draft.approve || !read) return base
  const winner = recommendedQuote(
    buildQuotes({
      category: read.category,
      condition: read.condition,
      defects: read.defects,
      packaging: read.packaging,
    }),
  ).route
  const approved = draft.approve === "model" ? winner : draft.approve
  return {
    ...base,
    step: "result",
    selectedRoute: approved,
    approvedRoute: approved,
    overrideReason: draft.overrideReason ?? null,
    approver: "Desk operator",
    approvedAt: draft.at,
    reviewed: true,
    trail: [
      ...base.trail,
      {
        at: draft.at,
        text:
          approved === winner
            ? `Approved ${approved}, matching the recommendation.`
            : `Approved ${approved}. The model recommended ${winner}.`,
      },
    ],
  }
}

const lamp: ModelRead = {
  category: "Home",
  brand: null,
  condition: "B",
  defects: ["cosmetic"],
  packaging: true,
  sentence: "Table lamp. The shade has a small dent. Cord and socket look intact. No brand mark is visible.",
  evidence: [
    "Shade dent is cosmetic.",
    "Socket and cord show no functional fault.",
    "No brand mark.",
    "Packaging is in the overview.",
  ],
}

const sneakers: ModelRead = {
  category: "Apparel",
  brand: "Nike",
  condition: "B",
  defects: [],
  packaging: false,
  sentence: "Pair of sneakers. The side mark reads Nike. Light sole wear. No box in the photos.",
  evidence: ["Brand mark is visible.", "Wear is light and even.", "Both shoes are present.", "No packaging."],
}

const blender: ModelRead = {
  category: "Appliances",
  brand: null,
  condition: "C",
  defects: ["functional", "missing"],
  packaging: false,
  sentence: "Blender. The jar is cracked and the lid is not in the photos. The jar does not sit square on the base.",
  evidence: ["Jar is cracked.", "Lid is missing.", "Base seating fails.", "No brand mark and no packaging."],
}

const bundle: ModelRead = {
  category: "Other",
  brand: null,
  condition: "D",
  defects: ["functional"],
  packaging: false,
  sentence: "One photo of a broken mixed bundle. The category is uncertain and no brand mark is visible.",
  evidence: ["Only one photo.", "The photo is not sharp.", "Pieces look non-functional.", "No brand mark."],
}

const tablet: ModelRead = {
  category: "Electronics",
  brand: "Apple",
  condition: "C",
  defects: ["cosmetic", "missing"],
  packaging: false,
  sentence: "Tablet in a scuffed shell. The rear mark reads Apple. The charger is not in the photos.",
  evidence: ["Brand mark is visible.", "Shell is scuffed.", "Charger is missing.", "No packaging."],
}

const swim: ModelRead = {
  category: "Apparel",
  brand: null,
  condition: "C",
  defects: ["hygiene"],
  packaging: true,
  sentence: "Swimwear with worn elastic. No brand mark. Treat it as a hygiene hold.",
  evidence: ["No brand mark.", "Elastic is tired.", "Hygiene hold applies.", "Packaging is present."],
}

const cushion: ModelRead = {
  category: "Home",
  brand: null,
  condition: "D",
  defects: ["functional"],
  packaging: false,
  sentence: "Seat cushion. The foam is torn and the cover seam has failed. No brand mark is visible.",
  evidence: ["Foam is exposed.", "Seam has failed.", "No brand mark.", "No packaging."],
}

const saucepan: ModelRead = {
  category: "Home",
  brand: null,
  condition: "A",
  defects: [],
  packaging: true,
  sentence: "Saucepan with no visible wear. The brand mark is not in the photos. Packaging is present.",
  evidence: ["No wear on the cooking surface.", "Handle is solid.", "No brand mark.", "Packaging is present."],
}

const earbuds: ModelRead = {
  category: "Electronics",
  brand: null,
  condition: "B",
  defects: ["cosmetic"],
  packaging: true,
  sentence: "In-ear headphones. The tips show residue. No brand mark is readable. They are otherwise complete.",
  evidence: ["Residue is cosmetic, not a hygiene hold for this class.", "Both buds are present.", "No brand mark.", "Case is included."],
}

const doll: ModelRead = {
  category: "Toys",
  brand: null,
  condition: "B",
  defects: [],
  packaging: false,
  sentence: "Doll with light wear on the hair. No soil. No brand mark. No box.",
  evidence: ["No hygiene hold.", "Hair wear is light.", "No brand mark.", "No packaging."],
}

const coat: ModelRead = {
  category: "Apparel",
  brand: null,
  condition: "C",
  defects: ["cosmetic"],
  packaging: true,
  sentence: "Wool coat. Cuff wear and a loose button. No brand mark is visible. The lining is intact.",
  evidence: ["Cuff wear is cosmetic.", "One button is loose.", "No brand mark.", "Packaging is present."],
}

export const SEED_CASES: CaseRecord[] = [
  fromDraft({
    id: "RC-2418",
    at: "2026-11-07T17:40:00.000Z",
    step: "approve",
    read: SAMPLES[0].read,
    photos: 4,
    pinned: true,
    trail: ["Photos added.", "Model read Electronics, brand Sony, condition B."],
  }),
  fromDraft({
    id: "RC-2414",
    at: "2026-11-07T16:55:00.000Z",
    step: "approve",
    read: SAMPLES[1].read,
    photos: 3,
    trail: ["Photos added.", "Model read Apparel, brand Levi's, condition D."],
  }),
  fromDraft({
    id: "RC-2411",
    at: "2026-11-07T16:10:00.000Z",
    step: "compare",
    read: SAMPLES[2].read,
    photos: 3,
    pinned: true,
    trail: ["Photos added.", "Hygiene hold marked on a plush toy."],
  }),
  fromDraft({
    id: "RC-2408",
    at: "2026-11-07T15:20:00.000Z",
    step: "assess",
    read: SAMPLES[3].read,
    photos: 2,
    trail: ["Photos added.", "Functional fault on a toaster. Brand not identified."],
  }),
  fromDraft({
    id: "RC-2402",
    at: "2026-11-07T14:05:00.000Z",
    step: "approve",
    read: lamp,
    photos: 4,
    reviewed: true,
    trail: ["Photos added.", "Model read Home, brand not identified, condition B."],
  }),
  fromDraft({
    id: "RC-2396",
    at: "2026-11-06T23:40:00.000Z",
    step: "compare",
    read: sneakers,
    photos: 3,
    trail: ["Photos added.", "Model read Apparel, brand Nike, condition B."],
  }),
  fromDraft({
    id: "RC-2391",
    at: "2026-11-06T22:15:00.000Z",
    step: "approve",
    read: blender,
    photos: 2,
    trail: ["Photos added.", "Functional fault and a missing lid."],
  }),
  fromDraft({
    id: "RC-2384",
    at: "2026-11-06T21:05:00.000Z",
    step: "approve",
    read: bundle,
    photos: 1,
    trail: ["One photo added.", "Low coverage. Category left as Other."],
  }),
  fromDraft({
    id: "RC-2377",
    at: "2026-11-06T19:30:00.000Z",
    step: "result",
    read: tablet,
    photos: 3,
    approve: "Scrap",
    overrideReason: "Repair parts are not in stock",
    note: "Screen kit is not in stock. Scrap the unit rather than hold the bench.",
    trail: ["Photos added.", "Model read Electronics, brand Apple, condition C."],
  }),
  fromDraft({
    id: "RC-2366",
    at: "2026-11-06T18:10:00.000Z",
    step: "result",
    read: swim,
    photos: 3,
    approve: "model",
    trail: ["Photos added.", "Hygiene hold on swimwear."],
  }),
  fromDraft({
    id: "RC-2358",
    at: "2026-11-05T20:45:00.000Z",
    step: "result",
    read: cushion,
    photos: 2,
    approve: "model",
    note: "Foam is torn through. Scrap loses less than a repair.",
    trail: ["Photos added.", "Functional fault on a seat cushion."],
  }),
  fromDraft({
    id: "RC-2344",
    at: "2026-11-05T18:20:00.000Z",
    step: "compare",
    read: saucepan,
    photos: 3,
    reviewed: true,
    trail: ["Photos added.", "No wear. Brand not identified."],
  }),
  fromDraft({
    id: "RC-2338",
    at: "2026-11-05T16:00:00.000Z",
    step: "assess",
    read: earbuds,
    photos: 3,
    trail: ["Photos added.", "Residue on the tips. Brand not identified."],
  }),
  fromDraft({
    id: "RC-2321",
    at: "2026-11-04T21:25:00.000Z",
    step: "approve",
    read: doll,
    photos: 2,
    trail: ["Photos added.", "Light wear. No hygiene hold."],
  }),
  fromDraft({
    id: "RC-2312",
    at: "2026-11-04T19:05:00.000Z",
    step: "result",
    read: coat,
    photos: 4,
    approve: "model",
    reviewed: true,
    trail: ["Photos added.", "Cosmetic wear on a coat. Brand not identified."],
  }),
  fromDraft({
    id: "RC-2419",
    at: "2026-11-07T17:55:00.000Z",
    step: "upload",
    photos: 0,
    trail: ["Case opened. Waiting for photos."],
  }),
]

export function blankCase(id: string, at: string): CaseRecord {
  return fromDraft({ id, at, step: "upload", photos: 0, trail: ["Case opened. Waiting for photos."] })
}

export function applyRead(item: CaseRecord, read: ModelRead, at: string, text: string): CaseRecord {
  return {
    ...item,
    updatedAt: at,
    step: "assess",
    category: read.category,
    brand: read.brand,
    condition: read.condition,
    defects: read.defects,
    packaging: read.packaging,
    model: read,
    trail: [...item.trail, { at, text }],
  }
}

export { DEMO_READ }
