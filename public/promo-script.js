/* ── ORBIT PROMOTIONAL SITE — INTERACTIONS ── */

// ─────────────────────────────────────────────
// 3D TILT + SPOTLIGHT ON FEATURE CARDS
// ─────────────────────────────────────────────
(function initFeatureTilt() {
  const MAX_TILT = 10; // degrees

  document.querySelectorAll('.feat-tilt').forEach(card => {
    let raf = null;
    let targetRX = 0, targetRY = 0, currentRX = 0, currentRY = 0;
    let isHovered = false;

    function lerp(a, b, t) { return a + (b - a) * t; }

    function tick() {
      currentRX = lerp(currentRX, targetRX, 0.1);
      currentRY = lerp(currentRY, targetRY, 0.1);
      card.style.transform = `perspective(900px) rotateX(${currentRX}deg) rotateY(${currentRY}deg) scale3d(${isHovered ? 1.025 : 1},${isHovered ? 1.025 : 1},1)`;
      if (isHovered || Math.abs(currentRX) > 0.01 || Math.abs(currentRY) > 0.01) {
        raf = requestAnimationFrame(tick);
      } else {
        card.style.transform = '';
        raf = null;
      }
    }

    card.addEventListener('mousemove', e => {
      const r = card.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width;
      const y = (e.clientY - r.top)  / r.height;
      targetRY =  (x - 0.5) * MAX_TILT * 2;
      targetRX = -(y - 0.5) * MAX_TILT * 2;
      card.style.setProperty('--mx', (x * 100) + '%');
      card.style.setProperty('--my', (y * 100) + '%');
      if (!raf) raf = requestAnimationFrame(tick);
    });

    card.addEventListener('mouseenter', () => { isHovered = true; if (!raf) raf = requestAnimationFrame(tick); });
    card.addEventListener('mouseleave', () => {
      isHovered = false;
      targetRX = 0; targetRY = 0;
      if (!raf) raf = requestAnimationFrame(tick);
    });
  });

  // Animate dashboard bars + sparklines + KPI counters when card enters view
  const io = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const card = entry.target;

      // bars
      card.querySelectorAll('.feat-dash-bar').forEach((b, i) => {
        setTimeout(() => b.classList.add('animated'), i * 120);
      });

      // sparkline
      card.querySelectorAll('.feat-spark-line').forEach(l => l.classList.add('animated'));

      // KPI counters
      card.querySelectorAll('.feat-kpi-val').forEach(el => {
        const target = parseFloat(el.dataset.target);
        const dec = (el.dataset.target.includes('.')) ? 1 : 0;
        let start = null;
        const dur = 1400;
        function step(ts) {
          if (!start) start = ts;
          const p = Math.min((ts - start) / dur, 1);
          const eased = 1 - Math.pow(1 - p, 3);
          el.textContent = (target * eased).toFixed(dec);
          if (p < 1) requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
      });

      io.unobserve(card);
    });
  }, { threshold: 0.3 });

  document.querySelectorAll('.feat-tilt').forEach(c => io.observe(c));

  // Tab switcher — show correct panel and animate its bars
  document.querySelectorAll('.feat-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      const visual = tab.closest('.feat-hero-visual');
      const targetPanel = tab.dataset.tab;

      // update active tab
      tab.closest('.feat-tabs').querySelectorAll('.feat-tab').forEach(t => t.classList.remove('feat-tab--active'));
      tab.classList.add('feat-tab--active');

      // swap panels
      visual.querySelectorAll('.feat-tab-panel').forEach(panel => {
        const isTarget = panel.dataset.panel === targetPanel;
        panel.classList.toggle('feat-tab-panel--hidden', !isTarget);

        if (isTarget) {
          // reset then animate bars
          panel.querySelectorAll('.feat-dash-bar').forEach(b => {
            b.classList.remove('animated');
            void b.offsetWidth; // force reflow
          });
          requestAnimationFrame(() => {
            panel.querySelectorAll('.feat-dash-bar').forEach((b, i) => {
              setTimeout(() => b.classList.add('animated'), i * 100);
            });
          });
        }
      });
    });
  });
})();

// ─────────────────────────────────────────────
// 1. CUSTOM CURSOR
// ─────────────────────────────────────────────
const cursorDot  = document.getElementById('cursor-dot');
const cursorRing = document.getElementById('cursor-ring');

document.addEventListener('mousemove', e => {
  const x = e.clientX, y = e.clientY;
  const dotOff  = 3;   // half of 6px dot
  const ringOff = 16;  // half of 32px ring
  cursorDot.style.transform  = `translate(${x - dotOff}px, ${y - dotOff}px)`;
  cursorRing.style.transform = `translate(${x - ringOff}px, ${y - ringOff}px)`;
});

// Hover state
const hoverTargets = 'a, button, .btn-hero-primary, .btn-hero-ghost, .feature-card, .testimonial-card, .pricing-card, .built-for-item, .toggle-switch, .nav-link';
document.querySelectorAll(hoverTargets).forEach(el => {
  el.addEventListener('mouseenter', () => cursorRing.classList.add('hovering'));
  el.addEventListener('mouseleave', () => cursorRing.classList.remove('hovering'));
});

document.addEventListener('mousedown', () => cursorDot.classList.add('clicking'));
document.addEventListener('mouseup',   () => cursorDot.classList.remove('clicking'));

// ─────────────────────────────────────────────
// SCROLL COMET — 3D realistic, screen-blend
// ─────────────────────────────────────────────
(function initScrollComet() {
  const canvas = document.getElementById('comet-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, dpr;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  // Scroll
  let scrollPct = 0;
  function updateScroll() {
    const max = document.body.scrollHeight - window.innerHeight;
    scrollPct = max > 0 ? Math.min(window.scrollY / max, 1) : 0;
  }
  updateScroll();
  window.addEventListener('scroll', updateScroll, { passive: true });

  const navEl    = document.querySelector('nav');
  const footerEl = document.querySelector('footer');

  // Waypoints: sphere stays in outer edge margins.
  // A long sweeping tail streams across the viewport for visual drama.
  const waypoints = [
    [0.00, 0.96],   // start: right edge
    [0.20, 0.04],   // left edge
    [0.40, 0.96],   // right edge
    [0.60, 0.04],   // left edge
    [0.80, 0.96],   // right edge
    [1.00, 0.04],   // left edge
  ];

  function smoothStep(t) { return t * t * (3 - 2 * t); }

  function getPathX(pct) {
    let i = 0;
    while (i < waypoints.length - 2 && waypoints[i + 1][0] <= pct) i++;
    const [p0, x0] = waypoints[i];
    const [p1, x1] = waypoints[i + 1];
    const s = smoothStep((pct - p0) / (p1 - p0));
    return x0 + (x1 - x0) * s;
  }

  function getTarget() {
    const navB = navEl    ? navEl.getBoundingClientRect().bottom    : 80;
    const footT = footerEl ? footerEl.getBoundingClientRect().top   : H;
    const minY = navB + 70;
    const maxY = Math.min(footT - 70, H - 70);
    return {
      x: W * getPathX(scrollPct),
      y: minY + scrollPct * (maxY - minY),
    };
  }

  // Critically-damped spring — smooth glide, no oscillation
  let pos = getTarget();
  let vel = { x: 0, y: 0 };
  const K = 0.032, D = 0.82;

  // Mouse
  let mx = -9999, my = -9999;
  window.addEventListener('mousemove', e => { mx = e.clientX; my = e.clientY; }, { passive: true });

  // Trail history
  const TLEN = 180;
  const trail = Array.from({ length: TLEN }, () => ({ x: pos.x, y: pos.y }));

  // Debris particles seeded along the trail
  const debris = Array.from({ length: 30 }, (_, i) => ({
    trailIdx: Math.floor(5 + (i / 30) * (TLEN * 0.75)),
    perpAngle: (Math.random() - 0.5) * Math.PI * 0.5,
    perpDist:  3 + Math.random() * 22,
    r:         0.6 + Math.random() * 2.2,
    opacity:   0.3 + Math.random() * 0.5,
  }));

  // Draw a smooth bezier path through trail segment
  function trailPath(startI, endI) {
    ctx.beginPath();
    ctx.moveTo(trail[startI].x, trail[startI].y);
    for (let i = startI + 1; i <= endI; i++) {
      if (i + 1 <= endI) {
        const mx2 = (trail[i].x + trail[i + 1].x) * 0.5;
        const my2 = (trail[i].y + trail[i + 1].y) * 0.5;
        ctx.quadraticCurveTo(trail[i].x, trail[i].y, mx2, my2);
      } else {
        ctx.lineTo(trail[i].x, trail[i].y);
      }
    }
  }

  let t = 0;

  function draw() {
    ctx.clearRect(0, 0, W, H);

    // Physics
    const tgt = getTarget();
    const dx = mx - pos.x, dy = my - pos.y;
    const mdist = Math.sqrt(dx * dx + dy * dy);
    const pull = (mdist < 180 && mdist > 0) ? (1 - mdist / 180) * 0.012 : 0;

    vel.x = (vel.x + (tgt.x - pos.x) * K + dx * pull) * D;
    vel.y = (vel.y + (tgt.y - pos.y) * K + dy * pull) * D;
    pos.x += vel.x;
    pos.y += vel.y;

    trail.unshift({ x: pos.x, y: pos.y });
    trail.pop();

    const hovered = mdist < 80;
    const coreR   = hovered ? 26 : 20;
    const pulse   = 1 + Math.sin(t * 0.035) * 0.08;
    const speed   = Math.sqrt(vel.x * vel.x + vel.y * vel.y);

    // ── OUTER ATMOSPHERE GLOW — bright enough to show through semi-transparent section BGs ──
    const atmR = coreR * 14 * pulse;
    const atm  = ctx.createRadialGradient(pos.x, pos.y, coreR, pos.x, pos.y, atmR);
    atm.addColorStop(0,    'rgba(190, 130, 255, 0.80)');
    atm.addColorStop(0.10, 'rgba(160,  95, 255, 0.55)');
    atm.addColorStop(0.25, 'rgba(130,  65, 240, 0.30)');
    atm.addColorStop(0.50, 'rgba( 95,  40, 210, 0.12)');
    atm.addColorStop(0.75, 'rgba( 65,  20, 170, 0.04)');
    atm.addColorStop(1,    'rgba( 40,  10, 130, 0)');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, atmR, 0, Math.PI * 2);
    ctx.fillStyle = atm;
    ctx.fill();

    // ── TAIL — long sweeping passes, sphere stays in margin ──
    if (trail.length > 4) {
      const farI  = TLEN - 1;
      const midI  = Math.floor(TLEN * 0.55);
      const nearI = Math.floor(TLEN * 0.22);

      // Pass 1: wide outer glow — very soft, spans full trail
      trailPath(0, farI);
      const g1 = ctx.createLinearGradient(trail[farI].x, trail[farI].y, pos.x, pos.y);
      g1.addColorStop(0,    'rgba(80,  30, 200, 0)');
      g1.addColorStop(0.45, 'rgba(110, 60, 230, 0.06)');
      g1.addColorStop(0.80, 'rgba(140, 90, 255, 0.14)');
      g1.addColorStop(1,    'rgba(160,110, 255, 0.22)');
      ctx.strokeStyle = g1;
      ctx.lineWidth   = coreR * 4.0;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.stroke();

      // Pass 2: mid tail — medium width, more saturated
      trailPath(0, midI);
      const g2 = ctx.createLinearGradient(trail[midI].x, trail[midI].y, pos.x, pos.y);
      g2.addColorStop(0,    'rgba(100, 50, 240, 0)');
      g2.addColorStop(0.35, 'rgba(140, 90, 255, 0.15)');
      g2.addColorStop(1,    'rgba(200,160, 255, 0.50)');
      ctx.strokeStyle = g2;
      ctx.lineWidth   = coreR * 1.8;
      ctx.lineJoin    = 'round';
      ctx.stroke();

      // Pass 3: bright core streak — narrow, close to head
      trailPath(0, nearI);
      const g3 = ctx.createLinearGradient(trail[nearI].x, trail[nearI].y, pos.x, pos.y);
      g3.addColorStop(0,    'rgba(200,170, 255, 0)');
      g3.addColorStop(0.25, 'rgba(220,195, 255, 0.40)');
      g3.addColorStop(1,    'rgba(250,245, 255, 0.95)');
      ctx.strokeStyle = g3;
      ctx.lineWidth   = coreR * 0.55;
      ctx.stroke();

      // Pass 4: ion tail — offset cyan, long
      const ionI = Math.floor(TLEN * 0.70);
      ctx.save();
      ctx.translate(pos.x < W * 0.5 ? 5 : -5, -6);
      trailPath(0, ionI);
      const g4 = ctx.createLinearGradient(trail[ionI].x, trail[ionI].y, pos.x, pos.y);
      g4.addColorStop(0,    'rgba(40, 160, 255, 0)');
      g4.addColorStop(0.40, 'rgba(70, 190, 255, 0.06)');
      g4.addColorStop(1,    'rgba(110,220, 255, 0.28)');
      ctx.strokeStyle = g4;
      ctx.lineWidth   = coreR * 0.42;
      ctx.stroke();
      ctx.restore();
    }

    // ── DEBRIS PARTICLES along tail ──
    debris.forEach(p => {
      const idx = Math.min(p.trailIdx, TLEN - 2);
      const pt  = trail[idx];
      const nxt = trail[idx + 1];
      // Perpendicular offset
      const ax  = nxt.x - pt.x, ay = nxt.y - pt.y;
      const len = Math.sqrt(ax * ax + ay * ay) || 1;
      const px  = -ay / len, py = ax / len;
      const ox  = pt.x + px * p.perpDist * Math.cos(p.perpAngle + t * 0.008);
      const oy  = pt.y + py * p.perpDist * Math.sin(p.perpAngle + t * 0.008);
      const fade = 1 - idx / (TLEN * 0.75);

      ctx.beginPath();
      ctx.arc(ox, oy, p.r, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(180, 140, 255, ${p.opacity * fade})`;
      ctx.fill();
    });

    // ── SPHERE — deep outer glow ──
    const glowR  = coreR * 3.2 * pulse;
    const glowGrd = ctx.createRadialGradient(pos.x, pos.y, coreR * 0.4, pos.x, pos.y, glowR);
    glowGrd.addColorStop(0,   'rgba(210, 160, 255, 0.90)');
    glowGrd.addColorStop(0.40,'rgba(165, 100, 255, 0.55)');
    glowGrd.addColorStop(1,   'rgba(100,  50, 220, 0)');
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, glowR, 0, Math.PI * 2);
    ctx.fillStyle = glowGrd;
    ctx.fill();

    // ── SPHERE — 3D body ──
    // Light from upper-left → shadow lower-right
    const litX = pos.x - coreR * 0.32;
    const litY = pos.y - coreR * 0.28;

    const bodyGrd = ctx.createRadialGradient(litX, litY, 0, pos.x, pos.y, coreR);
    bodyGrd.addColorStop(0,    'rgba(245, 235, 255, 1.0)');  // lit face — near white
    bodyGrd.addColorStop(0.28, 'rgba(200, 150, 255, 1.0)');  // bright violet
    bodyGrd.addColorStop(0.60, 'rgba(150,  90, 255, 1.0)');  // mid violet
    bodyGrd.addColorStop(1,    'rgba(100,  50, 220, 0.90)'); // shadow edge — still bright

    ctx.beginPath();
    ctx.arc(pos.x, pos.y, coreR, 0, Math.PI * 2);
    ctx.fillStyle = bodyGrd;
    ctx.fill();

    // ── SPHERE — specular highlight (top-left) ──
    const specX = pos.x - coreR * 0.36;
    const specY = pos.y - coreR * 0.34;
    const specGrd = ctx.createRadialGradient(specX, specY, 0, specX, specY, coreR * 0.52);
    specGrd.addColorStop(0,   'rgba(255, 255, 255, 0.95)');
    specGrd.addColorStop(0.4, 'rgba(235, 220, 255, 0.45)');
    specGrd.addColorStop(1,   'rgba(200, 180, 255, 0)');

    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, coreR, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(specX, specY, coreR * 0.52, 0, Math.PI * 2);
    ctx.fillStyle = specGrd;
    ctx.fill();
    ctx.restore();

    // ── SPHERE — rim light (cyan, shadow side — lower-right) ──
    const rimX = pos.x + coreR * 0.55;
    const rimY = pos.y + coreR * 0.50;
    const rimGrd = ctx.createRadialGradient(rimX, rimY, coreR * 0.6, rimX, rimY, coreR * 1.3);
    rimGrd.addColorStop(0,   'rgba(80, 200, 255, 0.28)');
    rimGrd.addColorStop(1,   'rgba(40, 160, 255, 0)');

    ctx.save();
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, coreR, 0, Math.PI * 2);
    ctx.clip();
    ctx.beginPath();
    ctx.arc(rimX, rimY, coreR * 1.3, 0, Math.PI * 2);
    ctx.fillStyle = rimGrd;
    ctx.fill();
    ctx.restore();

    // ── HOVER ORBIT RING ──
    if (hovered) {
      const ringR = coreR * 1.7 + Math.sin(t * 0.05) * 4;
      ctx.beginPath();
      ctx.ellipse(pos.x, pos.y, ringR, ringR * 0.3, -Math.PI * 0.2, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(140, 200, 255, ${0.25 + Math.sin(t * 0.04) * 0.1})`;
      ctx.lineWidth   = 1.2;
      ctx.stroke();
    }

    t++;
    requestAnimationFrame(draw);
  }

  draw();
})();

// ─────────────────────────────────────────────
// 2. SCROLL PROGRESS BAR
// ─────────────────────────────────────────────
const progressBar = document.getElementById('scroll-progress');
window.addEventListener('scroll', () => {
  const pct = (window.scrollY / (document.body.scrollHeight - window.innerHeight)) * 100;
  progressBar.style.width = pct + '%';
}, { passive: true });

// ─────────────────────────────────────────────
// 3. NAV — scroll + active link
// ─────────────────────────────────────────────
const nav = document.getElementById('nav');
const sections = document.querySelectorAll('section[id]');
const navLinks = document.querySelectorAll('.nav-link');

window.addEventListener('scroll', () => {
  nav.classList.toggle('scrolled', window.scrollY > 40);

  // Active nav link
  let current = '';
  sections.forEach(s => {
    if (window.scrollY >= s.offsetTop - 160) current = s.id;
  });
  navLinks.forEach(a => {
    a.classList.toggle('active', a.getAttribute('href') === '#' + current);
  });
}, { passive: true });

// Add active style
const styleActive = document.createElement('style');
styleActive.textContent = `.nav-link.active { color: #fff; background: var(--surface-2); }`;
document.head.appendChild(styleActive);

// ─────────────────────────────────────────────
// 4. MOBILE MENU
// ─────────────────────────────────────────────
const hamburger  = document.getElementById('hamburger');
const mobileMenu = document.getElementById('mobile-menu');
hamburger.addEventListener('click', () => {
  const open = mobileMenu.style.display === 'flex';
  mobileMenu.style.display = open ? 'none' : 'flex';
});
mobileMenu.querySelectorAll('a').forEach(a =>
  a.addEventListener('click', () => { mobileMenu.style.display = 'none'; })
);

// ─────────────────────────────────────────────
// 5. WAVY CONTOUR CANVAS
// ─────────────────────────────────────────────
(function initWaveCanvas() {
  const canvas = document.getElementById('wave-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  let W, H, dpr;
  let mx = 0.5, my = 0.5;
  let tmx = 0.5, tmy = 0.5;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = canvas.offsetWidth;
    H = canvas.offsetHeight;
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    ctx.scale(dpr, dpr);
  }
  resize();
  window.addEventListener('resize', resize, { passive: true });

  window.addEventListener('mousemove', e => {
    tmx = e.clientX / window.innerWidth;
    tmy = e.clientY / window.innerHeight;
  }, { passive: true });

  const LINE_COUNT = 30;
  let t = 0;

  function getY(x, i, t) {
    const f1 = 0.004  + i * 0.00014;
    const f2 = 0.0026 + i * 0.00007;
    const f3 = 0.007;
    const a1 = 26 + i * 1.3 + tmy * 22;
    const a2 = 14 + i * 0.7;
    const a3 = 7;
    const p1 = t * 0.009 + i * 0.34;
    const p2 = t * 0.006 - i * 0.22;
    const p3 = t * 0.013 + i * 0.18 + tmx * 2.5;
    return Math.sin(x * f1 + p1) * a1 + Math.sin(x * f2 + p2) * a2 + Math.sin(x * f3 + p3) * a3;
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    mx += (tmx - mx) * 0.04;
    my += (tmy - my) * 0.04;

    const bandH = H / (LINE_COUNT + 2);

    for (let i = 0; i < LINE_COUNT; i++) {
      const baseY = bandH * (i + 1.5);
      const cf = 1 - Math.abs((i / (LINE_COUNT - 1)) - 0.5) * 2;
      const alpha = 0.045 + cf * 0.10;
      const r = Math.round(110 + cf * 50);
      const g = Math.round(110 + cf * 70);

      ctx.beginPath();
      for (let x = 0; x <= W; x += 3) {
        const y = baseY + getY(x, i, t);
        x === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
      }
      ctx.strokeStyle = `rgba(${r},${g},255,${alpha})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }
    t++;
    requestAnimationFrame(draw);
  }
  draw();
})();

// ─────────────────────────────────────────────
// 6. TYPEWRITER for hero subtitle
// ─────────────────────────────────────────────
(function initTypewriter() {
  const el = document.querySelector('.hero-sub');
  if (!el) return;
  const full = el.textContent.trim();
  el.textContent = '';
  const cur = document.createElement('span');
  cur.className = 'typewriter-cursor';
  el.appendChild(cur);

  let i = 0;
  const interval = setInterval(() => {
    if (i < full.length) {
      el.insertBefore(document.createTextNode(full[i]), cur);
      i++;
    } else {
      clearInterval(interval);
      // blink a few more seconds then stop
      setTimeout(() => cur.style.display = 'none', 3000);
    }
  }, 28);
})();

// ─────────────────────────────────────────────
// 7. SCROLL REVEAL
// ─────────────────────────────────────────────
const revealEls = document.querySelectorAll('.reveal-up');
const revealObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.classList.add('visible');
      revealObs.unobserve(e.target);
    }
  });
}, { threshold: 0.12, rootMargin: '0px 0px -40px 0px' });
revealEls.forEach(el => revealObs.observe(el));

// ─────────────────────────────────────────────
// 8. ANIMATED COUNTERS
// ─────────────────────────────────────────────
function animateCounter(el) {
  const target = parseInt(el.dataset.target, 10);
  const duration = 1800;
  const start = performance.now();
  const easeOut = t => 1 - Math.pow(1 - t, 3);
  function tick(now) {
    const p = Math.min((now - start) / duration, 1);
    el.textContent = Math.round(easeOut(p) * target).toLocaleString();
    if (p < 1) requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);
}
const counterObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { animateCounter(e.target); counterObs.unobserve(e.target); }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.metric-number[data-target]').forEach(el => counterObs.observe(el));

// ─────────────────────────────────────────────
// 9. MINI BARS
// ─────────────────────────────────────────────
const barObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) { e.target.classList.add('animated'); barObs.unobserve(e.target); }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.mini-fill').forEach(b => barObs.observe(b));

// ─────────────────────────────────────────────
// 10. CARD CURSOR SPOTLIGHT
// ─────────────────────────────────────────────
document.querySelectorAll('.feature-card, .testimonial-card, .pricing-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width)  * 100;
    const y = ((e.clientY - rect.top)  / rect.height) * 100;
    card.style.setProperty('--mx', x + '%');
    card.style.setProperty('--my', y + '%');
  });
});

// ─────────────────────────────────────────────
// 11. CARD MAGNETIC TILT
// ─────────────────────────────────────────────
document.querySelectorAll('.feature-card, .testimonial-card, .pricing-card').forEach(card => {
  card.addEventListener('mousemove', e => {
    const rect = card.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width  - 0.5;
    const y = (e.clientY - rect.top)  / rect.height - 0.5;
    card.style.transform = `translateY(-4px) rotateX(${-y * 5}deg) rotateY(${x * 5}deg)`;
    card.style.transition = 'transform 0.08s linear';
  });
  card.addEventListener('mouseleave', () => {
    card.style.transform = '';
    card.style.transition = 'transform 0.5s var(--ease-smooth)';
  });
});

// ─────────────────────────────────────────────
// 12. MAGNETIC BUTTONS
// ─────────────────────────────────────────────
document.querySelectorAll('.btn-hero-primary, .btn-primary').forEach(btn => {
  btn.addEventListener('mousemove', e => {
    const rect = btn.getBoundingClientRect();
    const dx = e.clientX - (rect.left + rect.width  / 2);
    const dy = e.clientY - (rect.top  + rect.height / 2);
    btn.style.transform = `translate(${dx * 0.25}px, ${dy * 0.25}px)`;
    btn.style.transition = 'transform 0.15s ease';
  });
  btn.addEventListener('mouseleave', () => {
    btn.style.transform = '';
    btn.style.transition = 'transform 0.4s var(--ease-spring)';
  });
});

// ─────────────────────────────────────────────
// 13. PRICING TOGGLE
// ─────────────────────────────────────────────
const toggle       = document.getElementById('billing-toggle');
const labelMonthly = document.getElementById('toggle-monthly');
const labelAnnual  = document.getElementById('toggle-annual');
const priceEls     = document.querySelectorAll('.price-amount[data-monthly]');
let isAnnual = false;

function updatePrices() {
  priceEls.forEach(el => {
    const val = isAnnual ? el.dataset.annual : el.dataset.monthly;
    el.style.opacity = '0';
    el.style.transform = 'translateY(-6px)';
    setTimeout(() => {
      el.textContent = val === '0' ? 'Free' : `$${val}`;
      el.style.transition = 'all 0.25s ease';
      el.style.transform = 'translateY(0)';
      el.style.opacity = '1';
    }, 120);
  });
  toggle.classList.toggle('active', isAnnual);
  labelMonthly.classList.toggle('active', !isAnnual);
  labelAnnual.classList.toggle('active',  isAnnual);
}
toggle.addEventListener('click', () => { isAnnual = !isAnnual; updatePrices(); });
labelAnnual.addEventListener('click',  () => { if (!isAnnual) { isAnnual = true;  updatePrices(); } });
labelMonthly.addEventListener('click', () => { if (isAnnual)  { isAnnual = false; updatePrices(); } });

// ─────────────────────────────────────────────
// 14. TESTIMONIALS DRAG CAROUSEL
// ─────────────────────────────────────────────
(function initCarousel() {
  const grid = document.querySelector('.testimonials-grid');
  if (!grid) return;
  let isDragging = false, startX = 0, scrollLeft = 0;

  // Make it scrollable
  grid.style.overflowX = 'auto';
  grid.style.scrollSnapType = 'x mandatory';
  grid.style.scrollBehavior = 'smooth';
  grid.style.webkitOverflowScrolling = 'touch';
  grid.querySelectorAll('.testimonial-card').forEach(c => {
    c.style.scrollSnapAlign = 'start';
    c.style.flexShrink = '0';
  });

  grid.addEventListener('mousedown', e => {
    isDragging = true;
    startX = e.pageX - grid.offsetLeft;
    scrollLeft = grid.scrollLeft;
    grid.classList.add('dragging');
  });
  window.addEventListener('mouseup', () => {
    isDragging = false;
    grid.classList.remove('dragging');
  });
  grid.addEventListener('mousemove', e => {
    if (!isDragging) return;
    e.preventDefault();
    const x = e.pageX - grid.offsetLeft;
    grid.scrollLeft = scrollLeft - (x - startX) * 1.5;
  });
  // Touch
  grid.addEventListener('touchstart', e => {
    startX = e.touches[0].pageX;
    scrollLeft = grid.scrollLeft;
  }, { passive: true });
  grid.addEventListener('touchmove', e => {
    const x = e.touches[0].pageX;
    grid.scrollLeft = scrollLeft - (x - startX);
  }, { passive: true });
})();

// ─────────────────────────────────────────────
// 15. BUTTON RIPPLE
// ─────────────────────────────────────────────
document.querySelectorAll('.btn-primary, .btn-hero-primary').forEach(btn => {
  btn.addEventListener('click', e => {
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height) * 2;
    const ripple = document.createElement('span');
    ripple.style.cssText = `
      position:absolute;
      width:${size}px;height:${size}px;
      left:${e.clientX - rect.left - size/2}px;
      top:${e.clientY - rect.top  - size/2}px;
      border-radius:50%;
      background:rgba(255,255,255,0.18);
      transform:scale(0);
      animation:rippleAnim 0.55s ease-out forwards;
      pointer-events:none;z-index:10;
    `;
    btn.style.position = 'relative';
    btn.style.overflow = 'hidden';
    btn.appendChild(ripple);
    setTimeout(() => ripple.remove(), 560);
  });
});

// ─────────────────────────────────────────────
// 16. PARTICLE BURST on CTA click
// ─────────────────────────────────────────────
function burst(x, y) {
  const count = 18;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    const angle  = (i / count) * Math.PI * 2;
    const radius = 60 + Math.random() * 60;
    const size   = 4 + Math.random() * 4;
    const tx     = Math.cos(angle) * radius;
    const ty     = Math.sin(angle) * radius;
    p.style.cssText = `
      position:fixed;
      left:${x}px;top:${y}px;
      width:${size}px;height:${size}px;
      border-radius:50%;
      background:hsl(${260 + Math.random()*60},80%,75%);
      pointer-events:none;z-index:9999;
      transform:translate(-50%,-50%);
      animation:particleBurst 0.7s ease-out forwards;
      --tx:${tx}px;--ty:${ty}px;
    `;
    document.body.appendChild(p);
    setTimeout(() => p.remove(), 700);
  }
}
const burstStyle = document.createElement('style');
burstStyle.textContent = `
  @keyframes particleBurst {
    0%   { transform: translate(-50%,-50%) scale(1); opacity:1; }
    100% { transform: translate(calc(-50% + var(--tx)), calc(-50% + var(--ty))) scale(0); opacity:0; }
  }
  @keyframes rippleAnim { to { transform:scale(1); opacity:0; } }
`;
document.head.appendChild(burstStyle);

document.querySelectorAll('.btn-hero-primary, .cta-section .btn-primary').forEach(btn => {
  btn.addEventListener('click', e => burst(e.clientX, e.clientY));
});

// ─────────────────────────────────────────────
// 17. SMOOTH NAV SCROLL
// ─────────────────────────────────────────────
document.querySelectorAll('a[href^="#"]').forEach(a => {
  a.addEventListener('click', e => {
    const id = a.getAttribute('href').slice(1);
    const target = document.getElementById(id);
    if (!target) return;
    e.preventDefault();
    window.scrollTo({ top: target.offsetTop - 90, behavior: 'smooth' });
  });
});

// ─────────────────────────────────────────────
// 18. BUILT-FOR ITEM HOVER PULSE
// ─────────────────────────────────────────────
document.querySelectorAll('.built-for-item').forEach(item => {
  item.addEventListener('mouseenter', () => {
    item.querySelector('.bf-icon svg')?.animate(
      [{ transform: 'scale(1)' }, { transform: 'scale(1.25) rotate(-8deg)' }, { transform: 'scale(1)' }],
      { duration: 400, easing: 'ease-out' }
    );
  });
});

// ─────────────────────────────────────────────
// 19. FEATURE CARD ENTRANCE STAGGER
// ─────────────────────────────────────────────
const featureObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.transitionDelay = e.target.dataset.stagger || '0s';
      e.target.classList.add('visible');
      featureObs.unobserve(e.target);
    }
  });
}, { threshold: 0.1 });
document.querySelectorAll('.feature-card').forEach((card, i) => {
  card.dataset.stagger = (i * 0.07) + 's';
  featureObs.observe(card);
});

// ─────────────────────────────────────────────
// 20. STEP COUNTER GLOW ON SCROLL
// ─────────────────────────────────────────────
const stepObs = new IntersectionObserver(entries => {
  entries.forEach(e => {
    if (e.isIntersecting) {
      e.target.style.color = 'rgba(124,58,237,0.25)';
      e.target.style.transition = 'color 0.6s ease, text-shadow 0.6s ease';
      e.target.style.textShadow = '0 0 40px rgba(124,58,237,0.15)';
    }
  });
}, { threshold: 0.5 });
document.querySelectorAll('.step-number').forEach(el => stepObs.observe(el));

// ─────────────────────────────────────────────
// 21. NEWSLETTER FORM interaction
// ─────────────────────────────────────────────
const newsletterForm = document.querySelector('.newsletter-form');
if (newsletterForm) {
  newsletterForm.addEventListener('submit', e => {
    e.preventDefault();
    const btn = newsletterForm.querySelector('button');
    const input = newsletterForm.querySelector('input');
    btn.textContent = '✓';
    btn.style.background = 'linear-gradient(135deg, #059669, #047857)';
    input.value = '';
    input.placeholder = 'You\'re in orbit!';
    setTimeout(() => {
      btn.textContent = '→';
      btn.style.background = '';
      input.placeholder = 'your@email.com';
    }, 3000);
  });
}
