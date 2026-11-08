// Home page: our title + the before/after value of AI decisions. Every number has a sourced info tip.

const NRF = 'NRF and Happy Returns, 2025 Retail Returns Landscape.';
const LOCUS = 'Locus, "How AI-Optimized Reverse Logistics Is Becoming Retail\'s Hidden Competitive Edge" (vendor benchmark).';
const RP = 'ReturnPro, "What Is Reverse Logistics? The Complete Retailer\'s Guide" (vendor maturity model: Stage 1 manual vs Stage 4 AI-driven routing).';

// ---------- Before/after model: online retailer, $1M in sales ----------
// Before = the manual (least mature) end of each published range. After = the AI-driven (most mature) end.
const M = {
  sales: 1_000_000,
  returnRate: 0.193,     // NRF: 19.3% of online sales returned
  recBefore: 0.40,       // ReturnPro Stage 1 (manual): recovery below 40% of item value
  recAfter: 0.70,        // ReturnPro Stage 4 (AI-driven routing): recovery above 70%
  procCost: 0.30,        // Locus: processing costs 15-30% of item price (manual = high end)
  procCut: 0.30,         // ReturnPro: 15-30% lower cost per return at Stage 3-4 (upper end)
  scale: 100_000_000,    // scale-up example
};
const returned = M.sales * M.returnRate;
const before = { recovered: returned * M.recBefore, lost: returned * (1 - M.recBefore), proc: returned * M.procCost };
const after = { recovered: returned * M.recAfter, lost: returned * (1 - M.recAfter), proc: returned * M.procCost * (1 - M.procCut) };
before.total = before.lost + before.proc;
after.total = after.lost + after.proc;
const saved = before.total - after.total;
const perDollarBefore = before.total / returned;
const perDollarAfter = after.total / returned;

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const cents = (n) => '$' + n.toFixed(2);
const short = (n) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : money(n));
const pctTxt = (n) => `${+(n * 100).toFixed(1)}%`;

function moneyTable(num) {
  const rows = [
    {
      label: 'Merchandise returned',
      b: num(money(returned), `${money(M.sales)} online sales × ${pctTxt(M.returnRate)} online return rate. ${NRF}`),
      a: num(money(returned), 'Same returns. Better decisions change what happens to them, not how many come back.'),
      d: '<span class="muted">–</span>',
    },
    {
      label: 'Value recovered',
      b: num(money(before.recovered), `${pctTxt(M.recBefore)} of item value: manual processing recovers below 40%. ${RP}`),
      a: num(money(after.recovered), `${pctTxt(M.recAfter)} of item value: AI-driven routing recovers above 70%. ${RP}`),
      d: num(`+${money(after.recovered - before.recovered)}`, 'Extra value recovered by routing each item to its best channel.', 'accent'),
    },
    {
      label: 'Value wasted',
      b: num(money(before.lost), `${pctTxt(1 - M.recBefore)} of returned value is never recovered.`, 'bad'),
      a: num(money(after.lost), `${pctTxt(1 - M.recAfter)} of returned value is never recovered.`),
      d: num(`−${money(before.lost - after.lost)}`, 'Waste cut in half.', 'accent'),
    },
    {
      label: 'Processing cost',
      b: num(money(before.proc), `Shipping, inspection, repackaging and restocking at ${pctTxt(M.procCost)} of item price (high end of 15–30% for manual handling). ${LOCUS}`),
      a: num(money(after.proc), `${pctTxt(M.procCut)} lower cost per return at the most mature, AI-driven stage (top of the 15–30% range). ${RP}`),
      d: num(`−${money(before.proc - after.proc)}`, 'Lower handling cost per returned item.', 'accent'),
    },
  ];
  return `
    <table class="cmp">
      <caption class="sr-only">Returns cost for an online retailer with $1M in sales, manual versus AI-driven decisions</caption>
      <thead><tr><th scope="col">Per ${num(money(M.sales), 'Example online sales. The savings scale with sales.')} of online sales</th><th scope="col" class="r">Before: manual</th><th scope="col" class="r">After: AI decisions</th><th scope="col" class="r">Difference</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><th scope="row">${r.label}</th><td class="r" data-label="Before">${r.b}</td><td class="r" data-label="After">${r.a}</td><td class="r" data-label="Difference">${r.d}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total lost on returns</th>
          <td class="r" data-label="Before">${num(money(before.total), 'Value wasted + processing cost, manual.', 'bad')}</td>
          <td class="r" data-label="After">${num(money(after.total), 'Value wasted + processing cost, AI-driven.')}</td>
          <td class="r" data-label="Saved">${num(money(saved), `Saved per ${money(M.sales)} of online sales: ${pctTxt(saved / M.sales)} of revenue.`, 'accent big-save')}</td>
        </tr>
      </tfoot>
    </table>`;
}

function benchTable(num) {
  const rows = [
    ['Value recovered', num('Below 40%', `Stage 1, manual processing. ${RP}`, 'bad'), num('Above 70%', `Stage 4, AI-driven routing. ${RP}`, 'accent')],
    ['Liquidated vs refurbished and resold', num('1×', `Margin from wholesale liquidation, the default for many returns. ${RP}`), num('3–5×', `Margin from refurbishing and reselling through an open-box channel instead. ${RP}`, 'accent')],
    ['Cost per return', '<span class="muted">High</span>', num('15–30% lower', `At Stage 3–4 maturity. ${RP}`, 'accent')],
    ['Return-to-shelf time', num('8–12 days', `Manual processing. ${LOCUS}`), num('3–5 days', `AI-powered processing. ${LOCUS}`, 'accent')],
    ['Labor cost', '<span class="muted">Baseline</span>', num('~30% lower', `Automated triage replaces manual inspection and sorting. ${LOCUS}`, 'accent')],
  ];
  return `
    <table class="cmp bench">
      <caption class="sr-only">Manual versus AI-driven returns benchmarks</caption>
      <thead><tr><th scope="col">Industry benchmark</th><th scope="col" class="r">Manual</th><th scope="col" class="r">AI-driven</th></tr></thead>
      <tbody>${rows.map(([l, b, a]) => `<tr><th scope="row">${l}</th><td class="r" data-label="Manual">${b}</td><td class="r" data-label="AI-driven">${a}</td></tr>`).join('')}</tbody>
    </table>`;
}

// Hero panel: how much of every returned dollar is lost, before vs after, plus the scale-up.
function valuePanel(num) {
  const bar = (cls, label, v, tipTxt) => `
    <div class="lb-row">
      <span class="lb-label">${label}</span>
      <span class="lb-track"><span class="lb-fill ${cls}" style="width:${(v * 100).toFixed(1)}%"></span></span>
      ${num(cents(v), tipTxt, cls === 'bad' ? 'bad lb-val' : 'accent lb-val')}
    </div>`;
  return `
    <div class="card hero-panel">
      <span class="label">Lost from every returned dollar</span>
      ${bar('bad', 'Manual', perDollarBefore, `Total lost (${money(before.total)}) ÷ merchandise returned (${money(returned)}).`)}
      ${bar('good', 'Reconomy', perDollarAfter, `Total lost with AI-driven decisions (${money(after.total)}) ÷ merchandise returned (${money(returned)}).`)}
      <div class="hp-scale">
        <span class="label">Saved at ${num(short(M.scale), 'Example: an online retailer with $100M in sales.')} online sales</span>
        ${num(short(saved * (M.scale / M.sales)), `${money(saved)} saved per $1M × 100. Same rates as the table below.`, 'accent hp-big')}
      </div>
    </div>`;
}

export function homeHTML({ num }) {
  return `
  <section class="hero hero-static" id="hero" aria-label="Reconomy">
    <div class="hero-bg on" style="background-image:url('assets/hero-1.jpg')" aria-hidden="true"></div>
    <div class="hero-shade" aria-hidden="true"></div>
    <div class="hero-inner hero-grid">
      <div class="hero-copy-static">
        <p class="eyebrow">Reconomy · AI returns recovery</p>
        <h1 class="hero-title">Turn returns<br>into revenue.</h1>
        <p class="hero-sub">Manual sorting loses ${num(cents(perDollarBefore), 'Of every returned dollar, from the comparison table below.')} of every returned dollar. Reconomy's AI decisions cut that to ${num(cents(perDollarAfter), 'Of every returned dollar with AI-driven routing, from the comparison table below.')}.</p>
        <div class="hero-cta">
          <a class="btn primary" href="#assess">Assess your returns <span aria-hidden="true">→</span></a>
          <a class="btn link" href="#impact">See the comparison</a>
        </div>
      </div>
      ${valuePanel(num)}
    </div>
  </section>

  <section class="band" id="impact">
    <div class="wrap">
      <p class="eyebrow">Before and after</p>
      <h2>Manual sorting wastes most of every return.</h2>
      <p class="helper">An online retailer with ${num(money(M.sales), 'Example size. The savings scale with sales.')} in sales.</p>
      <div class="card cmp-card">${moneyTable(num)}</div>
      <div class="card cmp-card">${benchTable(num)}</div>
      <p class="fine">Before uses the manual end of each published range, after uses the AI-driven end. Industry and vendor benchmarks, not measured Reconomy results. Hover any number for its source.</p>
      <div class="cta-inline"><a class="btn primary" href="#assess">Assess your returns <span aria-hidden="true">→</span></a></div>
    </div>
  </section>

  <footer class="footer">
    <div class="wrap">
      <span>Reconomy · AWS enables scalable AI-powered inventory recovery.</span>
      <span>Sources: NRF and Happy Returns (2025), ReturnPro, Locus. Photo: Unsplash.</span>
    </div>
  </footer>`;
}

// Solid nav once the page scrolls.
export function bindHome() {
  const nav = document.getElementById('topnav');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  return () => window.removeEventListener('scroll', onScroll);
}
