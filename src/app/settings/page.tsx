"use client"

import { useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { Screen } from "@/components/desk/pieces"
import { isClosed } from "@/lib/cases"
import { useDesk } from "@/lib/desk"
import { CURRENCIES, PAGE_COPY, type Currency } from "@/lib/model"

export default function SettingsPage() {
  const { cases, settings, updateSettings, reset } = useDesk()
  const [tour, setTour] = useState(false)
  const [confirmReset, setConfirmReset] = useState(false)
  const openCases = cases.filter((item) => !isClosed(item)).length

  return (
    <Screen
      title={PAGE_COPY.settings.title}
      helper={PAGE_COPY.settings.helper}
      footer={
        <div className="ml-auto">
          <Button type="button" variant="outline" className="font-sans" onClick={() => setConfirmReset(true)}>
            Reset this desk
          </Button>
        </div>
      }
    >
      <div className="grid gap-4">
        <section className="desk-card p-5">
          <p className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">This desk</p>
          <h2 className="mt-2 font-sans text-base font-medium">Returns desk</h2>
          <p className="mt-2 font-sans text-sm text-muted-foreground">{openCases} open cases. Decisions stay in this browser until you reset.</p>
        </section>
        <section className="desk-card divide-y divide-border px-5">
          <Row
            label="Operator"
            body="The name written on an approval."
            control={
              <Input
                value={settings.operator}
                onChange={(event) => updateSettings({ operator: event.target.value || "Desk operator" })}
                aria-label="Operator"
                className="w-48 font-sans"
              />
            }
          />
          <Row
            label="Currency"
            body="Labels amounts on this desk. Switching it does not convert the numbers."
            control={
              <Select value={settings.currency} onValueChange={(value) => updateSettings({ currency: value as Currency })}>
                <SelectTrigger className="w-28 font-mono" aria-label="Currency">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CURRENCIES.map((currency) => (
                    <SelectItem key={currency} value={currency}>
                      {currency}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            }
          />
          <Row
            label="Language"
            body="Every screen on this desk is English."
            control={<span className="font-mono text-[12px] text-muted-foreground">English</span>}
          />
          <Row
            label="Theme"
            body="The desk stays dark. There is no light theme."
            control={<span className="font-mono text-[12px] text-muted-foreground">Dark</span>}
          />
          <Row
            label="Override reason"
            body="Require a reason when the approved route is not the recommendation."
            control={
              <Switch
                checked={settings.requireOverrideReason}
                onCheckedChange={(checked) => updateSettings({ requireOverrideReason: checked })}
                aria-label="Require an override reason"
              />
            }
          />
          <Row
            label="Low confidence note"
            body="Require a note when confidence is under 60."
            control={
              <Switch
                checked={settings.requireLowConfidenceNote}
                onCheckedChange={(checked) => updateSettings({ requireLowConfidenceNote: checked })}
                aria-label="Require a note when confidence is low"
              />
            }
          />
          <Row
            label="Cost lines"
            body="Show the parts of realization cost on each option card."
            control={
              <Switch
                checked={settings.showCostLines}
                onCheckedChange={(checked) => updateSettings({ showCostLines: checked })}
                aria-label="Show cost lines"
              />
            }
          />
          <Row
            label="Desk tour"
            body="Two minutes on the queue, the five steps, the playbooks, and the ledger."
            control={
              <Button type="button" variant="outline" className="font-sans" onClick={() => setTour(true)}>
                Start
              </Button>
            }
          />
        </section>
      </div>
      <Dialog open={tour} onOpenChange={setTour}>
        <DialogContent className="bg-card text-foreground sm:max-w-lg">
          <DialogHeader>
            <DialogTitle className="font-sans">How this desk is organized</DialogTitle>
            <DialogDescription className="font-sans text-muted-foreground">
              The job is unchanged: one returned item, four routes, highest net recovery value.
            </DialogDescription>
          </DialogHeader>
          <ul className="space-y-3 font-sans text-sm leading-5">
            <li>Queue holds open cases. Select a row to read the recommendation before you open it.</li>
            <li>Assess is Upload, Assess, Compare, Approve, Result. You can go back. You cannot skip.</li>
            <li>Playbooks are the rules for grades, closed routes, and overrides.</li>
            <li>Ledger keeps the approved route next to the recommendation, including overrides.</li>
          </ul>
          <DialogFooter>
            <Button type="button" className="font-sans" onClick={() => setTour(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={confirmReset} onOpenChange={setConfirmReset}>
        <DialogContent className="bg-card text-foreground">
          <DialogHeader>
            <DialogTitle className="font-sans">Reset this desk?</DialogTitle>
            <DialogDescription className="font-sans text-muted-foreground">
              Sample cases come back. Approvals you made in this browser are removed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button type="button" variant="outline" className="font-sans" onClick={() => setConfirmReset(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="font-sans"
              onClick={() => {
                reset()
                setConfirmReset(false)
              }}
            >
              Reset
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Screen>
  )
}

function Row({ label, body, control }: { label: string; body: string; control: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4 py-4">
      <div className="max-w-xl">
        <p className="font-mono text-[12px] tracking-[0.04em] text-faint uppercase">{label}</p>
        <p className="mt-1 font-sans text-sm leading-5 text-muted-foreground">{body}</p>
      </div>
      {control}
    </div>
  )
}
