// Home page: full-screen hero carousel + problem, decision, solution and AWS sections.
// Every statistic carries an info tip with its source.

const NRF = 'NRF and Happy Returns, 2025 Retail Returns Landscape report.';
const MCK = 'McKinsey, "From cost center to competitive advantage: Modernizing reverse logistics with AI".';
const MCK50 = 'McKinsey estimate, as cited by GSPANN, "Five AI Fixes for a $850B Problem". Recovery comes via resale, liquidation or parts.';

// Each slide's sub line is built with num() so every number gets its info tip.
const SLIDES = [
  {
    tab: 'The problem', eyebrow: 'The returns problem', img: 'assets/hero-1.jpg',
    title: 'Retail returns are<br>a huge, costly problem.',
    sub: (num) => `Retailers expect ${num('15.8%', `Share of annual retail sales expected to be returned in 2025. Source: ${NRF}`)}
      of annual sales, or ${num('$849.9B', `Total US retail returns expected in 2025. Source: ${NRF}`)}, to come back in 2025.`,
  },
  {
    tab: 'Online returns', eyebrow: 'Worse online', img: 'assets/hero-5.jpg',
    title: 'Nearly one in five<br>online orders comes back.',
    sub: (num) => `An estimated ${num('19.3%', `Share of online sales expected to be returned in 2025. Source: ${NRF}`)}
      of online sales will be returned in 2025.`,
  },
  {
    tab: 'The hard part', eyebrow: 'The biggest difficulty', img: 'assets/hero-2.jpg',
    title: 'The hard part starts<br>when the item arrives.',
    sub: () => 'Resell, refurbish, donate or scrap? Deciding what to do with each returned item is where value is won or lost.',
  },
  {
    tab: 'Value left behind', eyebrow: 'Spending more, recovering less', img: 'assets/hero-4.jpg',
    title: '$200 billion spent.<br>Only half recovered.',
    sub: (num) => `US retailers spend an estimated ${num('$200B', `Spent each year by retailers to recover value from returned goods. Source: ${MCK}`)}
      a year recovering value from returns, and still get back only about ${num('50%', `Share of a returned product's worth that is typically recovered. Source: ${MCK50}`)} of a product's worth.`,
  },
  {
    tab: 'Better decisions', eyebrow: 'Reconomy', img: 'assets/hero-3.jpg',
    title: 'Better decisions<br>change the math.',
    sub: () => 'Reconomy compares resell, refurbish, donate and scrap for every item, and recommends the option with the highest profit.',
  },
];

const ROUTES = [
  ['Resell', 'Sell it as-is at a used price. Fast, but only if it works and looks the part.'],
  ['Refurbish', 'Repair and clean it first. Worth it when the higher price beats the repair cost.'],
  ['Donate', 'Give it to charity for a tax benefit. Better than scrap for items that still work.'],
  ['Scrap', 'Recycle it for material value. The last resort, and often a loss after disposal fees.'],
];

const FLOW = [
  ['Upload', 'Drop in photos of returned items. Nothing to type.'],
  ['Assess', 'AI names each product, grades its condition and spots defects.'],
  ['Compare', 'All four routes are priced side by side. The most profitable one is highlighted.'],
  ['Approve', 'A manager confirms the plan or overrides any item.'],
  ['Result', 'See the money recovered versus scrapping, and the next step for every item.'],
];

const AWS = [
  ['Amazon Bedrock', 'Reads the photos, identifies each product and writes the reason for every decision.'],
  ['AWS Lambda', 'Matches each item to your product catalog and applies your business rates.'],
  ['Amazon S3', 'Holds your catalog, rates and return photos in private, encrypted storage.'],
  ['Amazon DynamoDB', 'Stores every assessment and approval in the deployable backend.'],
];

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
        <a class="btn link" href="#problem">Why it matters</a>
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
      <p class="eyebrow">The returns problem</p>
      <h2>Retail returns are a huge and costly problem.</h2>
      <p class="helper">A large share of everything sold comes back, and online sales come back even more often.</p>
      <div class="grid three stats">
        <div class="card stat">${num('$849.9B', `Total US retail returns expected in 2025. Source: ${NRF}`, 'stat-num')}<p>in merchandise retailers expect to be returned in 2025</p></div>
        <div class="card stat">${num('15.8%', `Share of annual retail sales expected to be returned in 2025. Source: ${NRF}`, 'stat-num')}<p>of annual sales coming back to the store</p></div>
        <div class="card stat">${num('19.3%', `Share of online sales expected to be returned in 2025. Source: ${NRF}`, 'stat-num')}<p>of online sales returned, nearly one order in five</p></div>
      </div>
    </div>
  </section>

  <section class="band alt" id="difficulty">
    <div class="wrap">
      <p class="eyebrow">The biggest difficulty</p>
      <h2>Every return needs a decision, and most are made by guesswork.</h2>
      <p class="helper">Once an item arrives, someone has to choose one of four routes. Each one earns a very different amount.</p>
      <div class="grid four">
        ${ROUTES.map(([h, p]) => `<div class="card route"><h3>${h}</h3><p>${p}</p></div>`).join('')}
      </div>
      <div class="card loss">
        <div>${num('$200B', `Spent each year by retailers to recover value from returned goods. Source: ${MCK}`, 'stat-num')}
          <p>spent by US retailers every year recovering value from returns</p></div>
        <div class="loss-div" aria-hidden="true"></div>
        <div>${num('~50%', `Share of a returned product's worth that is typically recovered. Source: ${MCK50}`, 'stat-num')}
          <p>of a product's worth is all they get back on average</p></div>
      </div>
    </div>
  </section>

  <section class="band" id="how">
    <div class="wrap">
      <p class="eyebrow">How Reconomy helps</p>
      <h2>Better decisions can change this.</h2>
      <p class="helper">Reconomy compares resell, refurbish, donate and scrap, and recommends the option with the highest profit.</p>
      <ol class="flow">
        ${FLOW.map(([h, p], i) => `<li class="card flow-step"><span class="flow-n mono">0${i + 1}</span><h3>${h}</h3><p>${p}</p></li>`).join('')}
      </ol>
    </div>
  </section>

  <section class="band alt" id="aws">
    <div class="wrap">
      <p class="eyebrow">Built on AWS</p>
      <h2>AWS enables scalable AI-powered inventory recovery.</h2>
      <p class="helper">Each service does one job, so the same system works for one store or a whole network.</p>
      <div class="grid four">
        ${AWS.map(([h, p]) => `<div class="card aws-card"><h3>${h}</h3><p>${p}</p></div>`).join('')}
      </div>
    </div>
  </section>

  <section class="band cta-band">
    <div class="wrap cta-inner">
      <div>
        <h2>Stop guessing. Start recovering.</h2>
        <p class="helper">Upload a few returns and see the most profitable route for each one.</p>
      </div>
      <a class="btn primary" href="#assess">Assess your returns <span aria-hidden="true">→</span></a>
    </div>
  </section>

  <footer class="footer">
    <div class="wrap">
      <span>Reconomy · AI returns recovery</span>
      <span>Sources: ${NRF} McKinsey reverse logistics research. Photos: Unsplash.</span>
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
