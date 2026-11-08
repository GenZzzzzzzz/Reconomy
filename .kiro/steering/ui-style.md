---
inclusion: always
---

# Reconomy UI style

Apply this file to every screen. Do not add a light theme, a second accent, or a screen that skips the stepper, the helper line, or metric tooltips.

Reconomy is an AI tool for retailers. A user uploads photos of one returned item. The model identifies it by category and, when visible, by brand, then recommends the most profitable option: Resell, Refurbish, Donate, or Scrap. The recommendation is the option with the highest Net Recovery Value (NRV).

## Product rules that change the UI

- One returned item per case. Photos are the only evidence.
- Identity is category (required) and brand (optional). If the brand is not visible, show "Not identified". Never block the flow on brand.
- No SKU anywhere. Do not collect, display, search, mention, or store a SKU, UPC, EAN, ASIN, barcode, item number, or style code. If a code is visible in a photo, ignore it. Do not OCR it into the interface or the case record.
- The four options are always Resell, Refurbish, Donate, and Scrap. Do not rename them, merge them, or add a fifth path.
- Exactly one option is recommended: the highest NRV. The model marks that option. The interface does not recompute NRV and does not glow more than one card.
- A user may approve a different option. Selection and recommendation are different states. The cyan glow stays on the model's recommendation. The approved choice gets a selected check. If they differ, the Result screen shows both.

## Theme

Dark theme only. `color-scheme: dark`. No theme toggle, no light cards, no white page background.

The page background is flat `#0B0F17`. Do not put a gradient, photo, or pattern behind the screens. Cyan is a signal color: current step, focus, links, the recommended badge, and the recommended glow. Do not fill large regions with cyan.

Tone is techy and professional. No mascots, no illustrated people, no playful empty states. Copy is short and direct.

## Color

Use only these brand colors:

| Token | Hex | Use |
| --- | --- | --- |
| background | `#0B0F17` | Page background |
| card | `#121826` | Cards, tooltips, menus, inputs |
| border | `#243049` | Card borders, input borders, dividers, upcoming stepper marks |
| accent | `#22D3EE` | Current step, focus, links, recommended badge, recommended glow |
| success | `#34D399` | Positive NRV, completed steps |
| warning | `#FBBF24` | Zero NRV, confidence below 60 |
| danger | `#F87171` | Negative NRV, blocking errors |

Supporting text colors, used only so type stays readable on the colors above:

| Token | Hex | Use |
| --- | --- | --- |
| text | `#E7EDF7` | Titles and body |
| muted | `#93A0B8` | Helper text, secondary lines |
| faint | `#66758F` | Upcoming stepper labels, disabled text |

NRV color is the sign of the number, on every screen:

- Positive: `#34D399`
- Zero: `#FBBF24`
- Negative: `#F87171`, and a leading minus sign

Do not rely on color alone. Negative values always include the minus sign. Confidence below 60 uses `#FBBF24` plus the word "Low" beside the percentage.

Primary button: background `#22D3EE`, text `#0B0F17`. Secondary button: transparent, 1px `#243049` border, text `#E7EDF7`. Hover shifts a primary button to a slightly brighter cyan and a secondary button to a `#243049` fill. Disabled buttons drop to 40% opacity and do not glow.

## Typography

Load Inter and JetBrains Mono. No other typeface.

- Inter is for text: screen titles, helper lines, body, button sentences, error sentences, empty states.
- JetBrains Mono is for numbers and labels: currency, percentages, counts, metric names, stepper labels, the four option names, field labels, badges, and the "Recommended" marker.

JetBrains Mono figures are tabular. Currency uses the case currency, a thousands separator, and two decimal places.

| Role | Face | Size / line | Weight |
| --- | --- | --- | --- |
| Screen title | Inter | 28 / 34 | 600 |
| Helper under the title | Inter | 14 / 20 | 400 |
| Card title | Inter | 16 / 24 | 500 |
| Body | Inter | 14 / 22 | 400 |
| Option name | JetBrains Mono | 14 / 20 | 500 |
| Metric label | JetBrains Mono | 12 / 16 | 500 |
| Metric number | JetBrains Mono | 24 / 32 on the NRV, 14 / 20 elsewhere | 500 |
| Stepper label | JetBrains Mono | 12 / 16 | 500 |

Screen titles use sentence case. Option names stay as Resell, Refurbish, Donate, Scrap. Metric labels are uppercase with `0.04em` letter spacing.

## Cards, shadows, and the recommended glow

Every card uses background `#121826`, a 1px solid `#243049` border, and a 12px radius. Controls use an 8px radius.

Every card has this layered soft shadow:

```css
box-shadow:
  0 1px 1px rgba(0, 0, 0, 0.35),
  0 8px 24px rgba(0, 0, 0, 0.35),
  0 24px 48px rgba(0, 0, 0, 0.28);
```

The recommended option keeps that shadow and adds a subtle cyan glow. Do not replace the shadow with the glow.

```css
box-shadow:
  0 1px 1px rgba(0, 0, 0, 0.35),
  0 8px 24px rgba(0, 0, 0, 0.35),
  0 24px 48px rgba(0, 0, 0, 0.28),
  0 0 0 1px rgba(34, 211, 238, 0.45),
  0 0 24px rgba(34, 211, 238, 0.22),
  0 0 48px rgba(34, 211, 238, 0.12);
```

The recommended card also shows a "Recommended" badge in JetBrains Mono, accent colored, on the card itself. Non-recommended cards do not glow.

Focus rings are `2px solid #22D3EE` with a 2px offset. They must stay visible on the dark background.

## Frame on every screen

1. Top bar with the wordmark "Reconomy" in Inter. No tagline in the bar.
2. The five-step stepper.
3. One screen title in Inter, then one helper sentence directly under it.
4. Content in cards.
5. The primary action at the trailing end of the screen footer.

Content width caps at 1120px. Page padding is 24px on desktop and 16px below 720px. Stack card grids in one column below 720px.

## Stepper

Show the same stepper on every screen, in this order:

1. Upload
2. Assess
3. Compare
4. Approve
5. Result

Labels are JetBrains Mono. States:

- Complete: `#34D399` mark and label. Clicking a complete step goes back to it.
- Current: `#22D3EE` mark and label.
- Upcoming: `#66758F` label and a `#243049` mark. Upcoming steps are not clickable.

Do not skip a step, hide the stepper, or replace the five names with numbers only. On a narrow viewport the rail scrolls horizontally and the current step stays in view, with all five labels still present.

## Helper text under each title

Every screen has exactly one title and exactly one helper sentence under that title. The helper is Inter, 14px, color `#93A0B8`, and sits 8px below the title. Do not put a second paragraph there. Use these sentences:

| Step | Title | Helper |
| --- | --- | --- |
| Upload | Add photos of the return | One item per case. Photograph the whole item and any damage. |
| Assess | What the photos show | Category is required. Brand appears only when it is visible. |
| Compare | Recovery options | Ranked by net recovery value. The glowing option is the recommendation. |
| Approve | Confirm the decision | Accept the recommendation, or choose a different option. |
| Result | Decision recorded | This case is closed. The path below is what happens to the item. |

Card titles do not get helper paragraphs. Explain card numbers with tooltips.

## Tooltips on every metric

Every metric has a tooltip. A number or metric label without one is a bug. Do not invent a displayed metric without adding its tooltip in the same change.

The tooltip opens on hover and on keyboard focus, and toggles on tap. The popover uses the card color, the card border, a 8px radius, and the card shadow. The label inside is JetBrains Mono. The explanation is Inter. Place the popover so it does not cover the number it explains.

These are the only metrics, and these are their tooltips:

| Label | Tooltip |
| --- | --- |
| NRV | Net recovery value. Expected proceeds minus the cost to complete this option. The highest NRV is recommended. |
| Expected proceeds | What you are expected to recover if this option is completed, before costs. |
| Realization cost | Labor, materials, fees, and shipping required to complete this option. |
| Confidence | How sure the model is, based only on the photos and the identified category. |
| Rank | Place among the four options, from highest net recovery value to lowest. |

Category and brand are identity fields, not metrics. They do not use these tooltips. Condition, when shown, is a sentence under the category, not a sixth metric.

## The four options

On Compare, Approve, and Result, show all four options as cards, sorted by NRV from highest to lowest. Each card shows, in this order: option name, NRV, expected proceeds, realization cost, confidence, and rank. Each of those five numbers has its tooltip.

Compare is a single row of four cards on desktop. The recommended card glows. Approve uses the same cards; the chosen card gets a check, and the glow stays on the recommendation. Result leads with the approved option and, when the approver overrode the model, a quiet line naming the recommendation they did not take.

## Desk around the five steps

The purpose does not change. The desk around the five steps is how an operator works a day of returns.

- Return queue. Title "Return queue". Helper: "Open cases on this desk. Select one to read the recommendation before you approve it." Filters, a case table, and a preview. The preview repeats the recommended route's metrics with the tooltips above.
- Recovery playbooks. Title "Recovery playbooks". Helper: "Rules this desk uses to judge condition, close a route, and read a net recovery value." A playbook's own title and summary become the title and helper on its page.
- Decision ledger. Title "Decision ledger". Helper: "Closed cases stay here, with the approved route and the model recommendation side by side."
- Desk guide. Title "Desk guide". Helper: "How a return moves from photos to a locked route, and how net recovery value is read."
- Desk settings. Title "Desk settings". Helper: "Currency and review rules for this desk. The theme stays dark." No theme toggle. Language is English only. Every string on every screen is English.

Queue and ledger use the full desk width so the list and the preview can sit together. The five-step flow stays within 1120px.

A closed route stays visible, shows an em dash for NRV, proceeds, cost, and rank, and says why it is closed. It is not recommended and cannot be approved. Scrap is never closed.

NRV at stake is the extra queue metric. Tooltip: "Sum of recommended net recovery value for open cases that still need a decision."

All copy is English.

## Screen contents

Keep each screen to the job its step names.

- Upload. A drop zone on a card: dashed `#243049` border, cyan border while dragging. Accept photos only. Show thumbnails in a card grid. Each photo can be tagged Overview, Damage, or Brand mark. A coverage card shows which of those three the case has. Empty, uploading, and failed-file states live inside the card. The primary action is "Continue", enabled only when at least one photo is attached. A missing tag does not block continue.
- Assess. One identity card: category, brand, and a short condition sentence from the photos. Beside it, the key points from the read, and which of the four routes this grade leaves open or closes. No dollar amounts on this screen. No product codes. The user may correct category and brand before continuing. Brand may be left as "Not identified".
- Compare. The four option cards, plus one sentence naming which open route leads and by how much. Each card adds one reading sentence: why that route is open, or why it is closed. No chart that repeats the numbers.
- Approve. The four cards, the recommended one still glowing, and a primary action "Approve [option]". Changing the selection updates that button label.
- Result. The approved path, its NRV and the other metrics with tooltips, and a secondary action to start another item. Do not offer an edit of the closed decision on this screen.

## Empty, loading, and error

- Loading and empty states sit inside a card, with the stepper and the screen title still visible.
- Loading copy names the step: "Reading the photos", "Scoring recovery options".
- Errors use `#F87171` for the message text and a 1px danger border on the card. Say what failed and the single next action. Do not mention SKUs, model internals, or stack traces.

## Checklist before a screen is done

- Background `#0B0F17`, cards `#121826`, borders `#243049`.
- Inter for text, JetBrains Mono for numbers and labels.
- Layered shadow on every card. Cyan glow only on the recommended option.
- Stepper shows Upload, Assess, Compare, Approve, Result, with the right step current.
- The screen title has the helper sentence from this file directly under it.
- Every visible metric has the tooltip from this file.
- Category is present. Brand is optional. No SKU and no barcode anywhere in the view.
