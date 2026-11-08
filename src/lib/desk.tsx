"use client"

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useState, type ReactNode } from "react"
import { applyRead, blankCase, SEED_CASES, stamp, type CaseRecord } from "@/lib/cases"
import { DEMO_READ, SAMPLES } from "@/lib/content"
import type { Currency } from "@/lib/model"

const KEY = "reconomy-desk-v1"

export type Settings = {
  operator: string
  currency: Currency
  requireOverrideReason: boolean
  requireLowConfidenceNote: boolean
  showCostLines: boolean
}

type DeskState = {
  cases: CaseRecord[]
  settings: Settings
  selectedId: string | null
}

const DEFAULT_SETTINGS: Settings = {
  operator: "Desk operator",
  currency: "USD",
  requireOverrideReason: true,
  requireLowConfidenceNote: true,
  showCostLines: false,
}

function initialState(): DeskState {
  return {
    cases: SEED_CASES,
    settings: DEFAULT_SETTINGS,
    selectedId: SEED_CASES.find((item) => item.step !== "result")?.id ?? SEED_CASES[0]?.id ?? null,
  }
}

function nextId(cases: CaseRecord[]) {
  const max = cases.reduce((highest, item) => {
    const value = Number(item.id.replace("RC-", ""))
    return Number.isFinite(value) ? Math.max(highest, value) : highest
  }, 2000)
  return `RC-${max + 1}`
}

type Action =
  | { type: "hydrate"; state: DeskState }
  | { type: "select"; id: string | null }
  | { type: "upsert"; item: CaseRecord; select?: boolean }
  | { type: "settings"; patch: Partial<Settings> }
  | { type: "reset" }

function reducer(state: DeskState, action: Action): DeskState {
  switch (action.type) {
    case "hydrate":
      return action.state
    case "select":
      return { ...state, selectedId: action.id }
    case "upsert":
      return {
        ...state,
        selectedId: action.select ? action.item.id : state.selectedId,
        cases: state.cases.some((item) => item.id === action.item.id)
          ? state.cases.map((item) => (item.id === action.item.id ? action.item : item))
          : [action.item, ...state.cases],
      }
    case "settings":
      return { ...state, settings: { ...state.settings, ...action.patch } }
    case "reset":
      return initialState()
    default:
      return state
  }
}

function strip(state: DeskState): DeskState {
  return {
    ...state,
    cases: state.cases.map((item) => ({
      ...item,
      photos: item.photos.map((photo) => ({ ...photo, url: "" })),
    })),
  }
}

type DeskApi = {
  ready: boolean
  cases: CaseRecord[]
  settings: Settings
  selectedId: string | null
  select: (id: string | null) => void
  createCase: () => CaseRecord
  save: (item: CaseRecord, trail?: string) => void
  updateSettings: (patch: Partial<Settings>) => void
  reset: () => void
  applySample: (id: string, sampleId: string) => void
  applyDemoRead: (id: string) => void
}

const DeskContext = createContext<DeskApi | null>(null)

export function DeskProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState)
  const [ready, setReady] = useState(false)

  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEY)
      if (raw) {
        const parsed = JSON.parse(raw) as DeskState
        if (Array.isArray(parsed.cases) && parsed.settings) {
          dispatch({
            type: "hydrate",
            state: {
              cases: parsed.cases,
              settings: { ...DEFAULT_SETTINGS, ...parsed.settings },
              selectedId: parsed.selectedId,
            },
          })
        }
      }
    } catch {
      localStorage.removeItem(KEY)
    }
    // localStorage is read after mount so the server and the first client render match.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setReady(true)
  }, [])

  useEffect(() => {
    if (!ready) return
    localStorage.setItem(KEY, JSON.stringify(strip(state)))
  }, [ready, state])

  const select = useCallback((id: string | null) => dispatch({ type: "select", id }), [])

  const save = useCallback((item: CaseRecord, trail?: string) => {
    dispatch({ type: "upsert", item: trail ? stamp(item, trail) : { ...item, updatedAt: new Date().toISOString() } })
  }, [])

  const createCase = useCallback(() => {
    const item = blankCase(nextId(state.cases), new Date().toISOString())
    dispatch({ type: "upsert", item, select: true })
    return item
  }, [state.cases])

  const updateSettings = useCallback((patch: Partial<Settings>) => {
    dispatch({ type: "settings", patch })
  }, [])

  const reset = useCallback(() => {
    localStorage.removeItem(KEY)
    dispatch({ type: "reset" })
  }, [])

  const applySample = useCallback(
    (id: string, sampleId: string) => {
      const sample = SAMPLES.find((entry) => entry.id === sampleId)
      const current = state.cases.find((item) => item.id === id)
      if (!sample || !current) return
      const photos = (
        [
          ["Overview", "overview"],
          ["Damage", "damage"],
          ["Brand mark", "mark"],
        ] as const
      ).map(([name, role], index) => ({
        id: `${id}-sample-${sample.id}-${index}`,
        name,
        url: "",
        role,
      }))
      const next = applyRead(
        { ...current, photos },
        sample.read,
        new Date().toISOString(),
        `Sample loaded: ${sample.title}.`,
      )
      dispatch({ type: "upsert", item: next, select: true })
    },
    [state.cases],
  )

  const applyDemoRead = useCallback(
    (id: string) => {
      const current = state.cases.find((item) => item.id === id)
      if (!current) return
      const next = applyRead(current, DEMO_READ, new Date().toISOString(), "Demo model returned an unidentified read.")
      dispatch({ type: "upsert", item: next, select: true })
    },
    [state.cases],
  )

  const api = useMemo<DeskApi>(
    () => ({
      ready,
      cases: state.cases,
      settings: state.settings,
      selectedId: state.selectedId,
      select,
      createCase,
      save,
      updateSettings,
      reset,
      applySample,
      applyDemoRead,
    }),
    [ready, state.cases, state.settings, state.selectedId, select, createCase, save, updateSettings, reset, applySample, applyDemoRead],
  )

  return <DeskContext.Provider value={api}>{children}</DeskContext.Provider>
}

export function useDesk() {
  const value = useContext(DeskContext)
  if (!value) throw new Error("useDesk must be used inside DeskProvider")
  return value
}
