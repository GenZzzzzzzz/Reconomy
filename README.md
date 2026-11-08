# Reconomy

Returns desk for a retailer. An operator adds photos of one returned item. The desk identifies it by category and, only when a mark is visible, by brand. It recommends the open route with the highest net recovery value: Resell, Refurbish, Donate, or Scrap.

There is no product code, barcode, or style number anywhere in the desk.

## Run locally

```bash
npm install
npm run dev
```

Open http://localhost:3847.

`npm test` checks the route math. `npm run lint` runs ESLint.

## What you can do

- Work the queue: filter by route, pin a case, read the preview, and open it.
- Step through Upload, Assess, Compare, Approve, and Result. Sample returns have prepared reads. Photos you add are not sent to a live vision model; you set the category yourself, then the same scoring runs.
- Read the playbooks and the guide for grades, closed routes, and overrides.
- Review closed decisions in the ledger, including cases where the approver did not take the recommendation.

The desk is dark. Currency and the operator name are in Settings and stay in this browser.
