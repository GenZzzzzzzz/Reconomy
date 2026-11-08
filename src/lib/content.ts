import type { Category, Condition, Defect, StepId } from "@/lib/model"

export type ModelRead = {
  category: Category
  brand: string | null
  condition: Condition
  defects: Defect[]
  packaging: boolean
  sentence: string
  evidence: string[]
}

export type SampleReturn = {
  id: string
  title: string
  detail: string
  read: ModelRead
}

export const SAMPLES: SampleReturn[] = [
  {
    id: "headphones",
    title: "Over-ear headphones",
    detail: "Brand mark visible. Light scuff on the cushion.",
    read: {
      category: "Electronics",
      brand: "Sony",
      condition: "B",
      defects: [],
      packaging: true,
      sentence:
        "Over-ear headphones. Light scuffing on the ear cushion. The headband mark reads Sony. No functional fault in the photos.",
      evidence: [
        "Brand mark is visible on the headband.",
        "Cushion scuff is cosmetic only.",
        "Packaging is in the overview photo.",
        "No crack and no missing part.",
      ],
    },
  },
  {
    id: "jacket",
    title: "Denim jacket",
    detail: "Heavy wear at the elbow. Brand patch visible. No box.",
    read: {
      category: "Apparel",
      brand: "Levi's",
      condition: "D",
      defects: ["cosmetic"],
      packaging: false,
      sentence:
        "Denim jacket. The hem is frayed and one elbow is worn through. The patch reads Levi's. No functional fault.",
      evidence: [
        "Brand patch is readable.",
        "Elbow wear is cosmetic, not a tear that opens the garment.",
        "No packaging in any photo.",
        "Seams still hold.",
      ],
    },
  },
  {
    id: "plush",
    title: "Plush toy",
    detail: "Soiled surface. No brand mark. Hygiene hold.",
    read: {
      category: "Toys",
      brand: null,
      condition: "C",
      defects: ["hygiene"],
      packaging: true,
      sentence: "Plush toy. The brand mark is not visible. The surface is soiled, so this is a hygiene hold.",
      evidence: [
        "No brand mark in the photos.",
        "Soil on the pile is a hygiene hold.",
        "Original box is present.",
        "No rip that exposes the filling.",
      ],
    },
  },
  {
    id: "toaster",
    title: "Countertop toaster",
    detail: "Lever does not latch. Brand mark is not readable.",
    read: {
      category: "Appliances",
      brand: null,
      condition: "D",
      defects: ["functional"],
      packaging: true,
      sentence:
        "Countertop toaster. The lever does not latch in the side photo. The brand mark is not readable. Treat the fault as functional.",
      evidence: [
        "Lever fails to stay down.",
        "Brand mark is absent.",
        "Housing is cracked at one corner.",
        "Packaging is present.",
      ],
    },
  },
]

export const DEMO_READ: ModelRead = {
  category: "Other",
  brand: null,
  condition: "C",
  defects: [],
  packaging: true,
  sentence:
    "The demo model has no live vision call, so it did not name this item. Set the category, and the brand only if you can see a mark.",
  evidence: [
    "No live vision model is connected on this desk.",
    "Category stays a placeholder until you correct it.",
    "Brand stays not identified unless a mark is visible.",
  ],
}

export type Playbook = {
  slug: string
  title: string
  summary: string
  level: "Core" | "Advanced"
  categories: Category[] | "All"
  minutes: number
  usedAt: StepId
  paragraphs: string[]
  rules: string[]
}

export const PLAYBOOKS: Playbook[] = [
  {
    slug: "condition-grades",
    title: "Condition grades",
    summary: "How A, B, C, and D change the as-is value before any route is scored.",
    level: "Core",
    categories: "All",
    minutes: 4,
    usedAt: "assess",
    paragraphs: [
      "Condition is a desk grade, not a catalog attribute. Grade what the photos show, then correct it if the bench disagrees.",
      "As-is value is the category reference value times the grade factor. Missing packaging multiplies that by 0.92. The reference value is a typical return in that category. It is not a product code and it is not a shelf price.",
    ],
    rules: [
      "A is sellable with no visible wear. Factor 0.95.",
      "B is light wear and still complete. Factor 0.80.",
      "C is heavy wear. Factor 0.55.",
      "D is severe damage. Factor 0.25.",
    ],
  },
  {
    slug: "photo-standard",
    title: "Photo standard",
    summary: "What each case needs before the read is trustworthy enough to approve.",
    level: "Core",
    categories: "All",
    minutes: 3,
    usedAt: "upload",
    paragraphs: [
      "One item per case. Photograph the whole item, the damage, and the brand mark only when a mark is actually there. Do not shoot barcodes or sewn-in codes. This desk does not read them.",
      "Confidence rises with coverage and falls when a functional fault is claimed from a single photo. Below 60 the value is marked Low and the approval note is required.",
    ],
    rules: [
      "Overview is required. Damage is required when wear decides the grade.",
      "A brand photo is optional. If you cannot see a mark, leave brand as not identified.",
      "Four clear photos is a full read. One photo stays a low-confidence read.",
      "Reject files that are not photos before they enter the case.",
    ],
  },
  {
    slug: "when-resell-closes",
    title: "When resell closes",
    summary: "Resell is the default cash route, and it closes for two faults only.",
    level: "Core",
    categories: "All",
    minutes: 4,
    usedAt: "compare",
    paragraphs: [
      "Resell keeps the as-is value, then takes 12% channel fees and $5 handling. It wins whenever it is open and the item is not badly damaged, because the other routes give up more of the value.",
      "The route closes for a functional fault and for a hygiene hold. A closed route stays on the card so the reason is visible. It is not ranked and it cannot be approved.",
    ],
    rules: [
      "Functional fault: the item does not do its job. Resell and donate both close.",
      "Hygiene hold: the item cannot be sold or repaired back into sale. Resell and refurbish both close.",
      "Cosmetic wear does not close resell.",
      "A missing part does not close resell by itself. It raises the repair cost and lowers as-is value.",
    ],
  },
  {
    slug: "hygiene-holds",
    title: "Hygiene holds",
    summary: "Soiled plush, swimwear, and other personal goods leave the resale bench.",
    level: "Advanced",
    categories: ["Apparel", "Toys"],
    minutes: 5,
    usedAt: "assess",
    paragraphs: [
      "A hygiene hold is a desk policy, not a guess about the shopper. If the photos show soil, heavy odor evidence, or a class of goods this desk does not resell, mark hygiene.",
      "Resell and refurbish close. Donate stays open unless there is also a functional fault. Scrap remains the fallback when donate is closed or worth less.",
    ],
    rules: [
      "Do not mark hygiene for ordinary dust on electronics.",
      "Do mark hygiene for soiled soft toys and worn swimwear.",
      "Brand is still optional. A missing mark does not create a hold.",
      "Say why in the condition sentence so the approver can see it.",
    ],
  },
  {
    slug: "functional-faults",
    title: "Functional faults",
    summary: "If it does not work, it does not go to resale or to the donation partner.",
    level: "Core",
    categories: ["Electronics", "Appliances", "Home"],
    minutes: 5,
    usedAt: "assess",
    paragraphs: [
      "A functional fault means the item fails its job: a toaster lever that will not latch, a blender that will not sit square, a lamp socket that is dead. Cosmetic scuffs are not functional.",
      "Resell and donate close. Refurbish stays open and is scored against scrap. Severe damage uses a lower restored value, so scrap can win when repair cannot pay for itself.",
    ],
    rules: [
      "One photo of a claimed functional fault is a low-confidence read. Add the damage photo.",
      "Restored value is 0.78 of the category reference, or 0.50 when the grade is D and the fault is functional.",
      "Repair cost stacks: functional $52, missing part $36, cosmetic $14.",
      "If parts are not in stock, approve scrap and record that override reason.",
    ],
  },
  {
    slug: "refurbish-cost",
    title: "Refurbish cost",
    summary: "Repair, fees, and bench handling, and when that sum loses to scrap.",
    level: "Advanced",
    categories: "All",
    minutes: 6,
    usedAt: "compare",
    paragraphs: [
      "Refurbish sells a restored item. Proceeds are not the current as-is value. They are the restored value for the category. Costs are repair, 12% fees on those proceeds, and $8 bench handling.",
      "A clean item often loses to resell, because you would pay the bench to get back to a price resell already captures. A worn item can win here. A low-value item with a functional fault usually loses to scrap.",
    ],
    rules: [
      "No listed defect still carries an $8 inspection inside repair, plus $8 handling.",
      "Hygiene closes the route. Do not send a hold to the bench.",
      "Missing parts are a cost, not an automatic scrap.",
      "Read rank, not the proceeds alone. A high restored price can still lose after repair.",
    ],
  },
  {
    slug: "donation",
    title: "Donation value",
    summary: "The tax benefit is 25% of as-is value, minus shipping, and only if the partner can take it.",
    level: "Core",
    categories: "All",
    minutes: 4,
    usedAt: "compare",
    paragraphs: [
      "Donate does not try to outbid resell. Expected proceeds are 25% of as-is value. Realization cost is $3 shipping. It wins when resell and refurbish are closed and that benefit still beats scrap.",
      "A functional fault closes donate. The partner does not receive goods that do not work. Scrap is the remaining open route.",
    ],
    rules: [
      "Do not donate a functional fault.",
      "A hygiene hold can be donated when there is no functional fault.",
      "If donate NRV is negative, scrap may still be worse. Rank decides.",
      "The next action is the donation pallet, not the resale cage.",
    ],
  },
  {
    slug: "scrap-and-overrides",
    title: "Scrap and overrides",
    summary: "Scrap is always open. An override keeps the model's recommendation on the record.",
    level: "Advanced",
    categories: "All",
    minutes: 5,
    usedAt: "approve",
    paragraphs: [
      "Scrap proceeds are the category salvage rate times the reference value. Cost is the disposal fee. The route never closes, so every case has a recommendation even when the winner loses money.",
      "Approving a different open route is allowed. The cyan glow stays on the model recommendation. The check mark is the approved route. A reason is required. The ledger keeps both.",
    ],
    rules: [
      "Negative NRV is still a decision. Pick the smallest loss.",
      "Do not override onto a closed route.",
      "Parts not in stock is an override reason, not a new route.",
      "A closed case cannot be edited. Start another item if the goods were mis-shot.",
    ],
  },
]

export type GuideSection = {
  id: string
  group: string
  title: string
  paragraphs: string[]
  bullets?: string[]
}

export const GUIDE: GuideSection[] = [
  {
    id: "start",
    group: "Start",
    title: "Start here",
    paragraphs: [
      "Reconomy is the returns desk. A case is one item. Photos are the evidence. The model names a category and, when a mark is visible, a brand. It then recommends the open route with the highest net recovery value.",
      "The queue is the work. Assess is the five-step case. Playbooks hold the rules. The ledger keeps closed decisions. This guide is the map.",
    ],
    bullets: [
      "Open a case from the queue, or start one with Assess.",
      "Use a sample return when you want a full prepared read.",
      "Photos you add yourself are not sent to a live vision model in this build.",
    ],
  },
  {
    id: "five-steps",
    group: "Start",
    title: "The five steps",
    paragraphs: [
      "Every screen keeps the same stepper. Upload, Assess, Compare, Approve, Result. You can return to a completed step. You cannot skip ahead.",
      "Upload takes photos of one item. Assess is the identity and the grade. Compare ranks the four routes. Approve locks one open route. Result is the record and the next physical move.",
    ],
  },
  {
    id: "nrv",
    group: "Money",
    title: "Net recovery value",
    paragraphs: [
      "NRV is expected proceeds minus the cost to complete that route. The highest NRV among open routes is the recommendation. Exactly one card glows.",
      "A closed route has no rank. The reason is on the card. Scrap is always open, so a case always has a recommendation, including when every open route loses money.",
    ],
    bullets: [
      "Resell: as-is value, minus 12% fees and $5 handling.",
      "Refurbish: restored value, minus repair, 12% fees, and $8 handling.",
      "Donate: 25% of as-is value, minus $3 shipping.",
      "Scrap: salvage value, minus the disposal fee.",
    ],
  },
  {
    id: "identity",
    group: "Money",
    title: "What the model uses",
    paragraphs: [
      "Identity is category, required, and brand, optional. Condition, defects, and packaging change the money. Confidence is how well the photos cover that read.",
      "The demo model prepares the four sample returns. For any other photo it refuses to invent a name. You set the category, and the brand only if you can see it, then the same scoring runs.",
    ],
  },
  {
    id: "never",
    group: "Policy",
    title: "What this desk never collects",
    paragraphs: [
      "Do not record a product code, a barcode, or a style number. If one is visible in a photo, ignore it.",
      "Search covers category and brand only. The ledger does not grow a product master.",
    ],
  },
  {
    id: "approve",
    group: "Policy",
    title: "Approval and the ledger",
    paragraphs: [
      "The glow is the model. The check is the person. If they differ, the reason is stored and the result names both.",
      "Confidence under 60 is marked Low. The desk asks for a note before that approval. A closed case is read only.",
    ],
  },
  {
    id: "routes",
    group: "Policy",
    title: "After the decision",
    paragraphs: [
      "Result tells the floor what to do next. Resell goes to the resale cage. Refurbish goes to the bench with the defect list. Donate goes to the partner pallet. Scrap goes to the scrap cage.",
      "Playbooks carry the longer rule for each of those moves. The queue then drops the case. The ledger keeps it.",
    ],
  },
]

export const GUIDE_GROUPS = ["Start", "Money", "Policy"] as const
