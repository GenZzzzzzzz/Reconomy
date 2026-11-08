// Home page: our title + only the before/after figures with a clear contrast.
// Every number has a sourced info tip.

const NRF = 'NRF and Happy Returns, 2025 Retail Returns Landscape.';
const LOCUS = 'Locus, "How AI-Optimized Reverse Logistics Is Becoming Retail\'s Hidden Competitive Edge" (vendor benchmark).';
const RP = 'ReturnPro, "What Is Reverse Logistics? The Complete Retailer\'s Guide" (vendor maturity model: Stage 1 manual vs Stage 4 AI-driven routing).';

// ---------- Before/after model: online retailer, $1M in sales ----------
// Before = the manual end of each published range. After = the AI-driven end.
const M = {
  sales: 1_000_000,
  returnRate: 0.193,  // NRF: 19.3% of online sales returned
  recBefore: 0.40,    // ReturnPro Stage 1 (manual): recovery below 40%
  recAfter: 0.70,     // ReturnPro Stage 4 (AI-driven routing): recovery above 70%
  procCost: 0.30,     // Locus: processing costs 15-30% of item price (manual = high end)
  procCut: 0.30,      // ReturnPro: 15-30% lower cost per return at Stage 3-4 (upper end)
  scale: 100_000_000,
};
const returned = M.sales * M.returnRate;
const lostBefore = returned * (1 - M.recBefore);
const lostAfter = returned * (1 - M.recAfter);
const totalBefore = lostBefore + returned * M.procCost;
const totalAfter = lostAfter + returned * M.procCost * (1 - M.procCut);
const saved = totalBefore - totalAfter;

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const cents = (n) => '$' + n.toFixed(2);
const short = (n) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : money(n));
const pctTxt = (n) => `${+(n * 100).toFixed(1)}%`;

// One contrast card. b/a are bar widths (0-1) so the gap is visible at a glance.
const card = (num, c) => `
  <article class="cx">
    <header class="cx-top">
      <h3>${c.label}</h3>
      ${num(c.delta, c.deltaTip, 'cx-delta')}
    </header>
    <div class="cx-vals">
      <div class="cx-v before"><span class="cx-k">Manual</span>${num(c.before, c.beforeTip, 'cx-n')}</div>
      <span class="cx-arrow" aria-hidden="true">→</span>
      <div class="cx-v after"><span class="cx-k">Reconomy</span>${num(c.after, c.afterTip, 'cx-n')}</div>
    </div>
    <div class="cx-bars" aria-hidden="true">
      <span class="bar-b" style="width:${(c.b * 100).toFixed(0)}%"></span>
      <span class="bar-a" style="width:${(c.a * 100).toFixed(0)}%"></span>
    </div>
    <p class="cx-note">${c.note}</p>
  </article>`;

function cards(num) {
  const perM = num('$1M', 'Example: an online retailer with $1M in sales. The figures scale with sales.');
  return [
    {
      label: 'Value recovered', note: 'of each returned item\'s worth',
      before: pctTxt(M.recBefore), beforeTip: `Manual processing recovers below 40% of item value. ${RP}`,
      after: pctTxt(M.recAfter), afterTip: `AI-driven routing recovers above 70% of item value. ${RP}`,
      delta: '+75%', deltaTip: '70% ÷ 40% − 1: three quarters more value from the same returns.',
      b: M.recBefore, a: M.recAfter,
    },
    {
      label: 'Value wasted', note: `per ${perM} in online sales`,
      before: money(lostBefore), beforeTip: `${pctTxt(1 - M.recBefore)} of ${money(returned)} returned (${pctTxt(M.returnRate)} of online sales, ${NRF}) is never recovered.`,
      after: money(lostAfter), afterTip: `${pctTxt(1 - M.recAfter)} of ${money(returned)} returned is never recovered with AI-driven routing.`,
      delta: '−50%', deltaTip: 'Waste cut in half.',
      b: 1, a: lostAfter / lostBefore,
    },
    {
      label: 'Back on the shelf', note: 'from return to resale-ready',
      before: '8–12 days', beforeTip: `Manual processing. ${LOCUS}`,
      after: '3–5 days', afterTip: `AI-powered processing. ${LOCUS}`,
      delta: '~1 week sooner', deltaTip: `Midpoints 10 vs 4 days. Seasonal goods lose 1–3% of value per week. ${LOCUS}`,
      b: 1, a: 0.4,
    },
    {
      label: 'Margin per item', note: 'refurbish and resell instead of liquidating',
      before: '1×', beforeTip: `Wholesale liquidation, the default for many returns. ${RP}`,
      after: '3–5×', afterTip: `Refurbishing and reselling through an open-box channel. ${RP}`,
      delta: 'up to 5×', deltaTip: `The margin gap between a liquidated and a refurbished, resold item. ${RP}`,
      b: 0.2, a: 0.8,
    },
  ].map((c) => card(num, c)).join('');
}

export function homeHTML({ num }) {
  const bar = (cls, label, v, tipTxt) => `
    <div class="lb-row">
      <span class="lb-label">${label}</span>
      <span class="lb-track"><span class="lb-fill ${cls}" style="width:${(v * 100).toFixed(1)}%"></span></span>
      ${num(cents(v), tipTxt, cls === 'bad' ? 'bad lb-val' : 'accent lb-val')}
    </div>`;
  return `
  <section class="hero hero-static" id="hero" aria-label="Reconomy">
    <div class="hero-bg on" style="background-image:url('assets/hero-1.jpg')" aria-hidden="true"></div>
    <div class="hero-shade" aria-hidden="true"></div>
    <div class="hero-inner hero-grid">
      <div class="hero-copy-static">
        <p class="eyebrow">Reconomy · AI returns recovery</p>
        <h1 class="hero-title">Turn returns<br>into revenue.</h1>
        <p class="hero-sub">AI picks the most profitable route for every returned item: resell, refurbish, donate or scrap.</p>
        <div class="hero-cta">
          <a class="btn primary" href="#assess">Assess your returns <span aria-hidden="true">→</span></a>
          <a class="btn link" href="#impact">See the difference</a>
        </div>
      </div>
      <div class="card hero-panel">
        <span class="label">Lost from every returned dollar</span>
        ${bar('bad', 'Manual', totalBefore / returned, `Value wasted plus processing cost (${money(totalBefore)}) ÷ merchandise returned (${money(returned)}).`)}
        ${bar('good', 'Reconomy', totalAfter / returned, `Value wasted plus processing cost with AI-driven decisions (${money(totalAfter)}) ÷ merchandise returned (${money(returned)}).`)}
      </div>
    </div>
  </section>

  <section class="band" id="impact">
    <div class="wrap">
      <p class="eyebrow">Before and after</p>
      <h2>Same returns. Very different results.</h2>
      <p class="helper">Manual sorting compared with AI-driven decisions.</p>
      <div class="cx-grid">${cards(num)}</div>

      <div class="card save-band">
        <div class="sb-main">
          <span class="label">Saved per ${num('$1M', 'Example online retailer size. The savings scale with sales.')} in online sales</span>
          ${num(money(saved), `Total lost on returns falls from ${money(totalBefore)} to ${money(totalAfter)}: value wasted plus processing cost, with processing ${pctTxt(M.procCut)} cheaper at the AI-driven stage (${RP}).`, 'sb-big')}
        </div>
        <div class="sb-side">
          <span class="label">At ${num(short(M.scale), 'Example: an online retailer with $100M in sales.')} in online sales</span>
          ${num(short(saved * (M.scale / M.sales)), `${money(saved)} per $1M × 100, same rates.`, 'sb-mid')}
        </div>
      </div>

      <p class="fine">Manual uses the low end of each published range, Reconomy the AI-driven end. Industry and vendor benchmarks, not measured Reconomy results. Hover any number for its source.</p>
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
