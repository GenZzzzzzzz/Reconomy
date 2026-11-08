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
const short = (n) => (n >= 1e6 ? `$${+(n / 1e6).toFixed(1)}M` : money(n));
const pctTxt = (n) => `${+(n * 100).toFixed(1)}%`;

// Hero slides follow the Reconomy presentation: the hidden cost, why current approaches fall short, our answer.
const GSPANN = 'GSPANN Technologies, "How to Solve the $850B Retail Returns Problem", citing McKinsey.';
const SLIDES = [
  {
    tab: 'Hidden cost', eyebrow: 'The hidden cost of returns', img: 'assets/hero-1.jpg',
    title: 'Returns are retail\'s<br>hidden cost.',
    sub: (num) => `Retailers expect ${num('15.8%', `Share of US retail sales expected to be returned in 2025. ${NRF}`)} of sales, or ${num('$849.9B', `US retail returns expected in 2025. ${NRF}`)}, to come back.`,
  },
  {
    tab: 'Recovery cost', eyebrow: 'Spending to recover', img: 'assets/hero-4.jpg',
    title: 'Getting value back<br>costs billions.',
    sub: (num) => `Retailers spend an estimated ${num('$200B', `Spent each year recovering value from returned items. ${GSPANN}`)} a year recovering returned items.`,
  },
  {
    tab: 'The gap', eyebrow: 'Why current approaches fall short', img: 'assets/hero-2.jpg',
    title: 'Net value is rarely<br>part of the decision.',
    sub: () => 'Every route has different costs, and low-value items are rarely bundled. Money is left on the table.',
  },
  {
    tab: 'Reconomy', eyebrow: 'How Reconomy solves it', img: 'assets/hero-3.jpg',
    title: 'Every route priced.<br>The best one chosen.',
    sub: () => 'AI grades each item, prices every route by net recovery value, and bundles low-value items into lots.',
  },
  {
    tab: 'Our goals', eyebrow: 'Maximize · Repurpose · Reduce', img: 'assets/hero-5.jpg',
    title: 'More profit.<br>Less waste.',
    sub: () => 'Maximize profit, repurpose what still works, and keep usable goods out of landfill.',
  },
];

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
    <p class="cx-explain">${c.explain}</p>
  </article>`;

function cards(num) {
  const perM = num('$1M', 'Example: an online retailer with $1M in sales. The figures scale with sales.');
  return [
    {
      label: 'Value recovered', note: 'of each returned item\'s worth',
      explain: 'Each item goes to the channel that pays the most, so more of its worth comes back.',
      before: pctTxt(M.recBefore), beforeTip: `Manual processing recovers below 40% of item value. ${RP}`,
      after: pctTxt(M.recAfter), afterTip: `AI-driven routing recovers above 70% of item value. ${RP}`,
      delta: '+75%', deltaTip: '70% ÷ 40% − 1: three quarters more value from the same returns.',
      b: M.recBefore, a: M.recAfter,
    },
    {
      label: 'Value wasted', note: `per ${perM} in online sales`,
      explain: 'Fewer usable items get dumped or sold off for almost nothing.',
      before: money(lostBefore), beforeTip: `${pctTxt(1 - M.recBefore)} of ${money(returned)} returned (${pctTxt(M.returnRate)} of online sales, ${NRF}) is never recovered.`,
      after: money(lostAfter), afterTip: `${pctTxt(1 - M.recAfter)} of ${money(returned)} returned is never recovered with AI-driven routing.`,
      delta: '−50%', deltaTip: 'Waste cut in half.',
      b: 1, a: lostAfter / lostBefore,
    },
    {
      label: 'Back on the shelf', note: 'from return to resale-ready',
      explain: 'Quicker decisions put items back on sale before they lose value.',
      before: '8–12 days', beforeTip: `Manual processing. ${LOCUS}`,
      after: '3–5 days', afterTip: `AI-powered processing. ${LOCUS}`,
      delta: '~1 week sooner', deltaTip: `Midpoints 10 vs 4 days. Seasonal goods lose 1–3% of value per week. ${LOCUS}`,
      b: 1, a: 0.4,
    },
    {
      label: 'Margin per item', note: 'refurbish and resell instead of liquidating',
      explain: 'Fixing and reselling an item earns far more than selling it off cheaply in bulk.',
      before: '1×', beforeTip: `Wholesale liquidation, the default for many returns. ${RP}`,
      after: '3–5×', afterTip: `Refurbishing and reselling through an open-box channel. ${RP}`,
      delta: 'up to 5×', deltaTip: `The margin gap between a liquidated and a refurbished, resold item. ${RP}`,
      b: 0.2, a: 0.8,
    },
  ].map((c) => card(num, c)).join('');
}

export function homeHTML({ num }) {
  const n = SLIDES.length;
  const bgs = SLIDES.map((s, i) => `<div class="hero-bg ${i === 0 ? 'on' : ''}" style="background-image:url('${s.img}')" aria-hidden="true"></div>`).join('');
  const panels = SLIDES.map((s, i) => `
    <div class="hero-copy ${i === 0 ? 'on' : ''}" id="slide${i}" role="tabpanel" aria-roledescription="slide"
      aria-label="${i + 1} of ${n}: ${s.tab}" ${i === 0 ? '' : 'hidden'}>
      <p class="eyebrow">${s.eyebrow}</p>
      <h1 class="hero-title">${s.title}</h1>
      <p class="hero-sub">${s.sub(num)}</p>
    </div>`).join('');
  const tabs = SLIDES.map((s, i) => `
    <button class="hero-tab ${i === 0 ? 'on' : ''}" data-slide="${i}" role="tab" aria-controls="slide${i}"
      aria-selected="${i === 0}" tabindex="${i === 0 ? 0 : -1}">
      <span class="hero-count mono">0${i + 1} / 0${n}</span>
      <span class="hero-tab-label">${s.tab}</span>
      <span class="hero-line" aria-hidden="true"><span></span></span>
    </button>`).join('');
  return `
  <section class="hero" id="hero" aria-roledescription="carousel" aria-label="Reconomy">
    ${bgs}
    <div class="hero-shade" aria-hidden="true"></div>
    <div class="hero-inner">
      <div class="hero-panels">${panels}</div>
      <div class="hero-cta">
        <a class="btn primary" href="#assess">Assess your returns <span aria-hidden="true">→</span></a>
        <a class="btn link" href="#impact">See the difference</a>
      </div>
    </div>
    <div class="hero-foot">
      <div class="hero-tabs" role="tablist" aria-label="Slides">${tabs}</div>
      <button class="hero-pause" id="hero-pause" aria-pressed="false" aria-label="Pause slideshow"><span class="ico" aria-hidden="true"></span></button>
      <a class="hero-scroll" href="#impact">Scroll <span aria-hidden="true">↓</span></a>
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

// Carousel: advances when the active tab's progress line finishes (CSS animation).
// Pauses on hover, keyboard focus or the pause button. No auto-advance with reduced motion.
export function bindHome(root) {
  const hero = root.querySelector('#hero');
  if (!hero) return () => {};
  const bgs = [...hero.querySelectorAll('.hero-bg')];
  const panels = [...hero.querySelectorAll('.hero-copy')];
  const tabs = [...hero.querySelectorAll('.hero-tab')];
  const pauseBtn = hero.querySelector('#hero-pause');
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  let current = 0;
  let userPaused = reduced;
  let hover = false;

  const show = (i) => {
    current = (i + SLIDES.length) % SLIDES.length;
    bgs.forEach((b, j) => b.classList.toggle('on', j === current));
    panels.forEach((p, j) => { p.classList.toggle('on', j === current); p.hidden = j !== current; });
    tabs.forEach((t, j) => {
      const on = j === current;
      t.classList.toggle('on', on);
      t.setAttribute('aria-selected', String(on));
      t.tabIndex = on ? 0 : -1;
      const line = t.querySelector('.hero-line span'); // restart the progress animation
      line.style.animation = 'none';
      void line.offsetWidth;
      line.style.animation = '';
    });
  };
  const sync = () => hero.classList.toggle('paused', userPaused || hover);

  tabs.forEach((t, i) => {
    t.addEventListener('click', () => show(i));
    t.querySelector('.hero-line span').addEventListener('animationend', () => { if (i === current) show(current + 1); });
  });
  hero.querySelector('.hero-tabs').addEventListener('keydown', (e) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    e.preventDefault();
    show(current + (e.key === 'ArrowRight' ? 1 : -1));
    tabs[current].focus();
  });
  hero.addEventListener('mouseenter', () => { hover = true; sync(); });
  hero.addEventListener('mouseleave', () => { hover = false; sync(); });
  hero.addEventListener('focusin', () => { hover = true; sync(); });
  hero.addEventListener('focusout', (e) => { if (!hero.contains(e.relatedTarget)) { hover = false; sync(); } });
  pauseBtn.addEventListener('click', () => {
    userPaused = !userPaused;
    pauseBtn.setAttribute('aria-pressed', String(userPaused));
    pauseBtn.setAttribute('aria-label', userPaused ? 'Play slideshow' : 'Pause slideshow');
    sync();
  });
  if (reduced) hero.classList.add('reduced');
  sync();

  const nav = document.getElementById('topnav');
  const onScroll = () => nav.classList.toggle('solid', window.scrollY > 40);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
  return () => window.removeEventListener('scroll', onScroll);
}
