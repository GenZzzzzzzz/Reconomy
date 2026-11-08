// Home page: hero carousel, key stats, before/after comparison, workflow, AWS.
// Every number carries an info tip with its source or formula.

const NRF = 'NRF and Happy Returns, 2025 Retail Returns Landscape.';
const MCK = 'McKinsey, "Modernizing reverse logistics with AI".';
const MCK50 = 'McKinsey, as cited by GSPANN, "How to Solve the $850B Retail Returns Problem".';
const LOCUS = 'Locus, "How AI-Optimized Reverse Logistics Is Becoming Retail\'s Hidden Competitive Edge" (vendor benchmark, manual vs AI-powered returns processing).';

// ---------- Before/after model: online retailer, $1M in sales ----------
// Inputs come straight from the sources above; outputs are simple arithmetic on them.
const M = {
  sales: 1_000_000,
  returnRate: 0.193,      // NRF: 19.3% of online sales returned
  recovered: 0.5,         // McKinsey: ~50% of a product's worth recovered
  procCost: 0.225,        // Locus: processing costs 15-30% of item price (midpoint)
  procCut: 0.15,          // Locus: ~15% lower processing cost per unit with AI
  depreciation: 0.02,     // Locus: goods lose 1-3% per week (midpoint), back on shelf ~1 week sooner
};
const returned = M.sales * M.returnRate;
const before = {
  recovered: returned * M.recovered,
  lost: returned * (1 - M.recovered),
  proc: returned * M.procCost,
};
const preserved = returned * M.depreciation;
const after = {
  recovered: before.recovered + preserved,
  lost: before.lost - preserved,
  proc: before.proc * (1 - M.procCut),
};
before.total = before.lost + before.proc;
after.total = after.lost + after.proc;
const saved = before.total - after.total;

const money = (n) => '$' + Math.round(n).toLocaleString('en-US');
const pctTxt = (n) => `${+(n * 100).toFixed(1)}%`;

const SLIDES = [
  {
    tab: 'The problem', eyebrow: 'The returns problem', img: 'assets/hero-1.jpg',
    title: 'Returns are retail\'s<br>costliest leak.',
    sub: (num) => `Retailers expect ${num('15.8%', `Share of US retail sales expected to be returned in 2025. ${NRF}`)} of sales, or ${num('$849.9B', `US retail returns expected in 2025. ${NRF}`)}, to come back in 2025.`,
  },
  {
    tab: 'Online', eyebrow: 'Worse online', img: 'assets/hero-5.jpg',
    title: 'Online, it\'s<br>even worse.',
    sub: (num) => `${num('19.3%', `Share of online sales expected to be returned in 2025. ${NRF}`)} of online sales are returned.`,
  },
  {
    tab: 'The decision', eyebrow: 'The hard part', img: 'assets/hero-2.jpg',
    title: 'Every return needs<br>a decision.',
    sub: () => 'Resell, refurbish, donate or scrap? Most are decided by guesswork.',
  },
  {
    tab: 'Value lost', eyebrow: 'Spending more, recovering less', img: 'assets/hero-4.jpg',
    title: 'Spending more.<br>Recovering less.',
    sub: (num) => `${num('$200B', `Spent each year by US retailers to recover value from returns. ${MCK}`)} a year goes into returns, yet only about ${num('50%', `Share of a returned product's worth typically recovered. ${MCK50}`)} of the value comes back.`,
  },
  {
    tab: 'The fix', eyebrow: 'Reconomy', img: 'assets/hero-3.jpg',
    title: 'Better decisions.<br>Better margins.',
    sub: () => 'Reconomy prices all four routes and recommends the most profitable one.',
  },
];

const FLOW = [
  ['Upload', 'Add photos. No typing.'],
  ['Assess', 'AI identifies and grades each item.'],
  ['Compare', 'Four routes, priced side by side.'],
  ['Approve', 'Confirm the plan or override it.'],
  ['Result', 'See the money recovered.'],
];

const AWS = [
  ['Amazon Bedrock', 'Identifies items and explains each decision.'],
  ['AWS Lambda', 'Matches items to your catalog and rates.'],
  ['Amazon S3', 'Stores catalog, rates and photos.'],
  ['Amazon DynamoDB', 'Saves assessments and approvals.'],
];

function moneyTable(num) {
  const rows = [
    {
      label: 'Merchandise returned',
      b: num(money(returned), `${money(M.sales)} online sales × ${pctTxt(M.returnRate)} online return rate. ${NRF}`),
      a: num(money(returned), 'Same returns. Better decisions do not change how much comes back.'),
      d: '<span class="muted">–</span>',
    },
    {
      label: 'Value recovered',
      b: num(money(before.recovered), `${pctTxt(M.recovered)} of returned value is recovered today. ${MCK50}`),
      a: num(money(after.recovered), `Back on the shelf about 1 week sooner (8–12 days → 3–5 days), avoiding ~${pctTxt(M.depreciation)} weekly depreciation (1–3% range). ${LOCUS}`),
      d: num(`+${money(preserved)}`, 'Value kept by selling items before they lose another week of value.', 'accent'),
    },
    {
      label: 'Value wasted',
      b: num(money(before.lost), 'Returned value that is never recovered: returned merchandise minus value recovered.'),
      a: num(money(after.lost), 'Returned merchandise minus value recovered with faster, AI-routed decisions.'),
      d: num(`−${money(preserved)}`, 'Less value thrown away.', 'accent'),
    },
    {
      label: 'Processing cost',
      b: num(money(before.proc), `Shipping, inspection, repackaging and restocking at ${pctTxt(M.procCost)} of item price (midpoint of 15–30%). ${LOCUS}`),
      a: num(money(after.proc), `About ${pctTxt(M.procCut)} lower processing cost per unit with automated grading and routing. ${LOCUS}`),
      d: num(`−${money(before.proc - after.proc)}`, 'Lower handling cost per returned item.', 'accent'),
    },
  ];
  return `
    <table class="cmp">
      <caption class="sr-only">Returns cost for an online retailer with $1M in sales, before and after AI-driven decisions</caption>
      <thead><tr><th scope="col">Per ${money(M.sales)} of online sales</th><th scope="col" class="r">Before: manual</th><th scope="col" class="r">After: AI decisions</th><th scope="col" class="r">Difference</th></tr></thead>
      <tbody>
        ${rows.map((r) => `<tr><th scope="row">${r.label}</th><td class="r" data-label="Before">${r.b}</td><td class="r" data-label="After">${r.a}</td><td class="r" data-label="Difference">${r.d}</td></tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row">Total lost on returns</th>
          <td class="r" data-label="Before">${num(money(before.total), 'Value wasted + processing cost, before.')}</td>
          <td class="r" data-label="After">${num(money(after.total), 'Value wasted + processing cost, after.')}</td>
          <td class="r" data-label="Saved">${num(money(saved), `Saved per ${money(M.sales)} of online sales: ${pctTxt(saved / M.sales)} of revenue.`, 'accent big-save')}</td>
        </tr>
      </tfoot>
    </table>`;
}

function benchTable(num) {
  const rows = [
    ['Return-to-shelf time', num('8–12 days', `Manual processing. ${LOCUS}`), num('3–5 days', `AI-powered processing. ${LOCUS}`)],
    ['Processing speed', '<span class="muted">Baseline</span>', num('50–60% faster', `Automated sorting and AI returns management. ${LOCUS}`)],
    ['Labor cost', '<span class="muted">Baseline</span>', num('~30% lower', `Automated triage replaces manual inspection and sorting. ${LOCUS}`)],
    ['Value recovered', num('~50%', `Of a product's worth. ${MCK50}`), '<span class="muted">Higher, as items resell before they depreciate</span>'],
  ];
  return `
    <table class="cmp bench">
      <caption class="sr-only">Manual versus AI-powered returns processing benchmarks</caption>
      <thead><tr><th scope="col">Industry benchmark</th><th scope="col" class="r">Manual</th><th scope="col" class="r">AI-powered</th></tr></thead>
      <tbody>${rows.map(([l, b, a]) => `<tr><th scope="row">${l}</th><td class="r" data-label="Manual">${b}</td><td class="r" data-label="AI-powered">${a}</td></tr>`).join('')}</tbody>
    </table>`;
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
  <section class="hero" id="hero" aria-roledescription="carousel" aria-label="The returns problem">
    ${bgs}
    <div class="hero-shade" aria-hidden="true"></div>
    <div class="hero-inner">
      <div class="hero-panels">${panels}</div>
      <div class="hero-cta">
        <a class="btn primary" href="#assess">Assess your returns <span aria-hidden="true">→</span></a>
        <a class="btn link" href="#impact">See the savings</a>
      </div>
    </div>
    <div class="hero-foot">
      <div class="hero-tabs" role="tablist" aria-label="Slides">${tabs}</div>
      <button class="hero-pause" id="hero-pause" aria-pressed="false" aria-label="Pause slideshow"><span class="ico" aria-hidden="true"></span></button>
      <a class="hero-scroll" href="#problem">Scroll <span aria-hidden="true">↓</span></a>
    </div>
  </section>

  <section class="band" id="problem">
    <div class="wrap">
      <p class="eyebrow">The problem</p>
      <h2>Returns cost more every year.</h2>
      <p class="helper">US retail, 2025.</p>
      <div class="grid four stats">
        <div class="card stat">${num('$849.9B', `US retail returns expected in 2025. ${NRF}`, 'stat-num')}<p>returned to US retailers</p></div>
        <div class="card stat">${num('15.8%', `Share of US retail sales expected to be returned in 2025. ${NRF}`, 'stat-num')}<p>of all retail sales</p></div>
        <div class="card stat">${num('19.3%', `Share of online sales expected to be returned in 2025. ${NRF}`, 'stat-num')}<p>of online sales</p></div>
        <div class="card stat">${num('~50%', `Share of a returned product's worth typically recovered. ${MCK50}`, 'stat-num')}<p>of the value recovered</p></div>
      </div>
    </div>
  </section>

  <section class="band alt" id="impact">
    <div class="wrap">
      <p class="eyebrow">Before and after</p>
      <h2>What better decisions save.</h2>
      <p class="helper">An online retailer with ${num(money(M.sales), 'Example size. The savings scale with sales.')} in sales, before and after AI grading and routing.</p>
      <div class="card cmp-card">${moneyTable(num)}</div>
      <div class="card cmp-card">${benchTable(num)}</div>
      <p class="fine">Estimates built from published industry figures, not measured Reconomy results. Hover any number for its source.</p>
    </div>
  </section>

  <section class="band" id="how">
    <div class="wrap">
      <p class="eyebrow">How it works</p>
      <h2>Photos in. A priced plan out.</h2>
      <p class="helper">Five steps, the same every time.</p>
      <ol class="flow">
        ${FLOW.map(([h, p], i) => `<li class="card flow-step"><span class="flow-n mono">0${i + 1}</span><h3>${h}</h3><p>${p}</p></li>`).join('')}
      </ol>
    </div>
  </section>

  <section class="band alt" id="aws">
    <div class="wrap">
      <p class="eyebrow">Built on AWS</p>
      <h2>AWS enables scalable AI-powered inventory recovery.</h2>
      <p class="helper">One service per job, from one store to many.</p>
      <div class="grid four">
        ${AWS.map(([h, p]) => `<div class="card aws-card"><h3>${h}</h3><p>${p}</p></div>`).join('')}
      </div>
    </div>
  </section>

  <section class="band cta-band">
    <div class="wrap cta-inner">
      <div>
        <h2>Stop guessing. Start recovering.</h2>
        <p class="helper">Upload a few returns to see each item's best route.</p>
      </div>
      <a class="btn primary" href="#assess">Assess your returns <span aria-hidden="true">→</span></a>
    </div>
  </section>

  <footer class="footer">
    <div class="wrap">
      <span>Reconomy · AI returns recovery</span>
      <span>Sources: NRF and Happy Returns (2025), McKinsey, Locus. Photos: Unsplash.</span>
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
