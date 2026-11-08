import assert from "node:assert/strict"
import test from "node:test"
import { buildQuotes, formatMoney, recommendedQuote, scoreConfidence } from "./model.ts"

test("clean electronics is a resell", () => {
  const quotes = buildQuotes({ category: "Electronics", condition: "B", defects: [], packaging: true })
  const winner = recommendedQuote(quotes)
  assert.equal(winner.route, "Resell")
  assert.ok(winner.nrv > 0)
  assert.equal(quotes.filter((quote) => quote.recommended).length, 1)
})

test("worn apparel with cosmetic damage is a refurbish", () => {
  const quotes = buildQuotes({
    category: "Apparel",
    condition: "D",
    defects: ["cosmetic"],
    packaging: false,
  })
  assert.equal(recommendedQuote(quotes).route, "Refurbish")
})

test("hygiene hold closes resell and refurbish, so donate wins", () => {
  const quotes = buildQuotes({ category: "Toys", condition: "C", defects: ["hygiene"], packaging: true })
  assert.equal(quotes.find((quote) => quote.route === "Resell")?.open, false)
  assert.equal(quotes.find((quote) => quote.route === "Refurbish")?.open, false)
  assert.equal(recommendedQuote(quotes).route, "Donate")
})

test("a badly failed low-value item is a scrap with a negative NRV", () => {
  const quotes = buildQuotes({ category: "Other", condition: "D", defects: ["functional"], packaging: false })
  const winner = recommendedQuote(quotes)
  assert.equal(winner.route, "Scrap")
  assert.ok(winner.nrv < 0)
  assert.equal(quotes.find((quote) => quote.route === "Resell")?.open, false)
  assert.equal(quotes.find((quote) => quote.route === "Donate")?.open, false)
})

test("functional appliances stay on the repair bench", () => {
  const quotes = buildQuotes({
    category: "Appliances",
    condition: "D",
    defects: ["functional"],
    packaging: true,
  })
  assert.equal(recommendedQuote(quotes).route, "Refurbish")
})

test("money keeps a leading minus and two decimals", () => {
  assert.equal(formatMoney(-12.5, "USD"), "-$12.50")
  assert.equal(formatMoney(149.8, "USD"), "$149.80")
})

test("one photo and a functional fault marks low confidence", () => {
  const score = scoreConfidence({
    photoCount: 1,
    brand: null,
    defects: ["functional"],
    categoryCorrected: false,
  })
  assert.ok(score < 60)
})
