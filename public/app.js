// Shared behaviour for all pages

// Animated Beams Background Class
class BeamsBackground {
  constructor(options = {}) {
    this.options = {
      intensity: options.intensity || 'strong',
      blur: options.blur || 35,
      minBeams: options.minBeams || 20,
      ...options
    };

    this.canvas = null;
    this.ctx = null;
    this.beams = [];
    this.animationFrame = null;
    this.opacityMap = {
      subtle: 0.7,
      medium: 0.85,
      strong: 1
    };

    this.init();
  }

  init() {
    this.createCanvas();
    this.setupBeams();
    this.bindEvents();
    this.animate();
  }

  createCanvas() {
    // Remove existing canvas if any
    const existingCanvas = document.getElementById('beams-canvas');
    if (existingCanvas) {
      existingCanvas.remove();
    }

    this.canvas = document.createElement('canvas');
    this.canvas.id = 'beams-canvas';
    this.canvas.style.position = 'fixed';
    this.canvas.style.top = '0';
    this.canvas.style.left = '0';
    this.canvas.style.width = '100%';
    this.canvas.style.height = '100%';
    this.canvas.style.pointerEvents = 'none';
    this.canvas.style.zIndex = '-1';
    this.canvas.style.filter = `blur(${this.options.blur}px)`;

    document.body.insertBefore(this.canvas, document.body.firstChild);

    this.ctx = this.canvas.getContext('2d');
    this.resizeCanvas();
  }

  resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    this.canvas.width = window.innerWidth * dpr;
    this.canvas.height = window.innerHeight * dpr;
    this.canvas.style.width = `${window.innerWidth}px`;
    this.canvas.style.height = `${window.innerHeight}px`;
    this.ctx.scale(dpr, dpr);
  }

  createBeam() {
    const angle = -35 + Math.random() * 10;
    return {
      x: Math.random() * this.canvas.width * 1.5 - this.canvas.width * 0.25,
      y: Math.random() * this.canvas.height * 1.5 - this.canvas.height * 0.25,
      width: 30 + Math.random() * 60,
      length: this.canvas.height * 2.5,
      angle: angle,
      speed: 0.6 + Math.random() * 1.2,
      opacity: 0.12 + Math.random() * 0.16,
      hue: 190 + Math.random() * 70,
      pulse: Math.random() * Math.PI * 2,
      pulseSpeed: 0.02 + Math.random() * 0.03,
    };
  }

  setupBeams() {
    const totalBeams = this.options.minBeams * 1.5;
    this.beams = Array.from({ length: totalBeams }, () => this.createBeam());
  }

  resetBeam(beam, index) {
    const column = index % 3;
    const spacing = this.canvas.width / 3;

    beam.y = this.canvas.height + 100;
    beam.x = column * spacing + spacing / 2 + (Math.random() - 0.5) * spacing * 0.5;
    beam.width = 100 + Math.random() * 100;
    beam.speed = 0.5 + Math.random() * 0.4;
    beam.hue = 190 + (index * 70) / this.beams.length;
    beam.opacity = 0.2 + Math.random() * 0.1;
    return beam;
  }

  drawBeam(beam) {
    this.ctx.save();
    this.ctx.translate(beam.x, beam.y);
    this.ctx.rotate((beam.angle * Math.PI) / 180);

    // Calculate pulsing opacity
    const pulsingOpacity = beam.opacity * (0.8 + Math.sin(beam.pulse) * 0.2) * this.opacityMap[this.options.intensity];

    const gradient = this.ctx.createLinearGradient(0, 0, 0, beam.length);

    // Enhanced gradient with multiple color stops
    gradient.addColorStop(0, `hsla(${beam.hue}, 85%, 65%, 0)`);
    gradient.addColorStop(0.1, `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity * 0.5})`);
    gradient.addColorStop(0.4, `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity})`);
    gradient.addColorStop(0.6, `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity})`);
    gradient.addColorStop(0.9, `hsla(${beam.hue}, 85%, 65%, ${pulsingOpacity * 0.5})`);
    gradient.addColorStop(1, `hsla(${beam.hue}, 85%, 65%, 0)`);

    this.ctx.fillStyle = gradient;
    this.ctx.fillRect(-beam.width / 2, 0, beam.width, beam.length);
    this.ctx.restore();
  }

  animate = () => {
    if (!this.canvas || !this.ctx) return;

    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    this.beams.forEach((beam, index) => {
      beam.y -= beam.speed;
      beam.pulse += beam.pulseSpeed;

      // Reset beam when it goes off screen
      if (beam.y + beam.length < -100) {
        this.resetBeam(beam, index);
      }

      this.drawBeam(beam);
    });

    this.animationFrame = requestAnimationFrame(this.animate);
  }

  bindEvents() {
    const handleResize = () => {
      this.resizeCanvas();
      this.setupBeams();
    };

    window.addEventListener('resize', handleResize);
  }

  destroy() {
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
    }
    if (this.canvas) {
      this.canvas.remove();
    }
  }
}

class WavesBackground {
  constructor(options = {}) {
    this.options = {
      strokeColor: options.strokeColor || 'rgba(255,255,255,0.28)',
      backgroundColor: options.backgroundColor || '#000000',
      pointerSize: options.pointerSize || 8,
      xGap: options.xGap || 12,
      yGap: options.yGap || 12,
      ...options
    };
    this.container = null;
    this.svg = null;
    this.paths = [];
    this.lines = [];
    this.raf = null;
    this.bounds = null;
    this.mouse = {
      x: -10,
      y: 0,
      lx: 0,
      ly: 0,
      sx: 0,
      sy: 0,
      v: 0,
      vs: 0,
      a: 0,
      set: false,
    };
    this.init();
  }

  init() {
    document.getElementById('waves-background')?.remove();
    document.getElementById('beams-canvas')?.remove();

    this.container = document.createElement('div');
    this.container.id = 'waves-background';
    this.container.className = 'waves-background';
    this.container.style.setProperty('--x', '-0.5rem');
    this.container.style.setProperty('--y', '50%');
    this.container.style.backgroundColor = this.options.backgroundColor;

    this.svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    this.svg.classList.add('waves-svg');
    this.svg.setAttribute('aria-hidden', 'true');
    this.container.appendChild(this.svg);

    const dot = document.createElement('div');
    dot.className = 'waves-pointer-dot';
    dot.style.width = `${this.options.pointerSize}px`;
    dot.style.height = `${this.options.pointerSize}px`;
    dot.style.background = this.options.strokeColor;
    this.container.appendChild(dot);

    document.body.insertBefore(this.container, document.body.firstChild);
    this.setSize();
    this.setLines();
    this.bindEvents();
    this.raf = requestAnimationFrame((time) => this.tick(time));
  }

  setSize() {
    if (!this.container || !this.svg) return;
    this.bounds = this.container.getBoundingClientRect();
    this.svg.style.width = `${this.bounds.width}px`;
    this.svg.style.height = `${this.bounds.height}px`;
  }

  setLines() {
    if (!this.svg || !this.bounds) return;
    const { width, height } = this.bounds;
    this.lines = [];
    this.paths.forEach((path) => path.remove());
    this.paths = [];

    const xGap = this.options.xGap;
    const yGap = this.options.yGap;
    const totalLines = Math.ceil((width + 200) / xGap);
    const totalPoints = Math.ceil((height + 30) / yGap);
    const xStart = (width - xGap * totalLines) / 2;
    const yStart = (height - yGap * totalPoints) / 2;

    for (let i = 0; i < totalLines; i += 1) {
      const points = [];
      for (let j = 0; j < totalPoints; j += 1) {
        points.push({
          x: xStart + xGap * i,
          y: yStart + yGap * j,
          wave: { x: 0, y: 0 },
          cursor: { x: 0, y: 0, vx: 0, vy: 0 },
        });
      }

      const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      path.setAttribute('fill', 'none');
      path.setAttribute('stroke', this.options.strokeColor);
      path.setAttribute('stroke-width', '1');
      path.setAttribute('vector-effect', 'non-scaling-stroke');
      this.svg.appendChild(path);
      this.paths.push(path);
      this.lines.push(points);
    }
  }

  bindEvents() {
    this.handleResize = () => {
      this.setSize();
      this.setLines();
    };
    this.handleMouseMove = (event) => this.updateMousePosition(event.clientX, event.clientY);
    this.handleTouchMove = (event) => {
      const touch = event.touches?.[0];
      if (touch) this.updateMousePosition(touch.clientX, touch.clientY);
    };
    window.addEventListener('resize', this.handleResize);
    window.addEventListener('mousemove', this.handleMouseMove);
    window.addEventListener('touchmove', this.handleTouchMove, { passive: true });
  }

  updateMousePosition(x, y) {
    if (!this.bounds) return;
    const mouse = this.mouse;
    mouse.x = x - this.bounds.left;
    mouse.y = y - this.bounds.top;
    if (!mouse.set) {
      mouse.sx = mouse.x;
      mouse.sy = mouse.y;
      mouse.lx = mouse.x;
      mouse.ly = mouse.y;
      mouse.set = true;
    }
  }

  noise(x, y, time) {
    return (
      Math.sin(x * 0.028 + time * 0.0008) +
      Math.sin(y * 0.021 + time * 0.00045) +
      Math.sin((x + y) * 0.012 + time * 0.0006)
    ) / 3;
  }

  movePoints(time) {
    const mouse = this.mouse;
    this.lines.forEach((points) => {
      points.forEach((point) => {
        const move = this.noise(point.x, point.y, time) * 8;
        point.wave.x = Math.cos(move) * 12;
        point.wave.y = Math.sin(move) * 6;

        const dx = point.x - mouse.sx;
        const dy = point.y - mouse.sy;
        const distance = Math.hypot(dx, dy);
        const limit = Math.max(175, mouse.vs);

        if (distance < limit) {
          const strength = 1 - distance / limit;
          const force = Math.cos(distance * 0.001) * strength;
          point.cursor.vx += Math.cos(mouse.a) * force * limit * mouse.vs * 0.00035;
          point.cursor.vy += Math.sin(mouse.a) * force * limit * mouse.vs * 0.00035;
        }

        point.cursor.vx += (0 - point.cursor.x) * 0.01;
        point.cursor.vy += (0 - point.cursor.y) * 0.01;
        point.cursor.vx *= 0.95;
        point.cursor.vy *= 0.95;
        point.cursor.x += point.cursor.vx;
        point.cursor.y += point.cursor.vy;
        point.cursor.x = Math.min(50, Math.max(-50, point.cursor.x));
        point.cursor.y = Math.min(50, Math.max(-50, point.cursor.y));
      });
    });
  }

  moved(point, withCursorForce = true) {
    return {
      x: point.x + point.wave.x + (withCursorForce ? point.cursor.x : 0),
      y: point.y + point.wave.y + (withCursorForce ? point.cursor.y : 0),
    };
  }

  drawLines() {
    this.lines.forEach((points, index) => {
      if (points.length < 2 || !this.paths[index]) return;
      const first = this.moved(points[0], false);
      let d = `M ${first.x} ${first.y}`;
      for (let i = 1; i < points.length; i += 1) {
        const current = this.moved(points[i]);
        d += `L ${current.x} ${current.y}`;
      }
      this.paths[index].setAttribute('d', d);
    });
  }

  tick(time) {
    const mouse = this.mouse;
    mouse.sx += (mouse.x - mouse.sx) * 0.1;
    mouse.sy += (mouse.y - mouse.sy) * 0.1;
    const dx = mouse.x - mouse.lx;
    const dy = mouse.y - mouse.ly;
    const distance = Math.hypot(dx, dy);
    mouse.v = distance;
    mouse.vs += (distance - mouse.vs) * 0.1;
    mouse.vs = Math.min(100, mouse.vs);
    mouse.lx = mouse.x;
    mouse.ly = mouse.y;
    mouse.a = Math.atan2(dy, dx);

    if (this.container) {
      this.container.style.setProperty('--x', `${mouse.sx}px`);
      this.container.style.setProperty('--y', `${mouse.sy}px`);
    }

    this.movePoints(time);
    this.drawLines();
    this.raf = requestAnimationFrame((nextTime) => this.tick(nextTime));
  }

  destroy() {
    if (this.raf) cancelAnimationFrame(this.raf);
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('mousemove', this.handleMouseMove);
    window.removeEventListener('touchmove', this.handleTouchMove);
    this.container?.remove();
  }
}

// Animated Dock Effect Class
class AnimatedDock {
  constructor(containerSelector, options = {}) {
    this.container = document.querySelector(containerSelector);
    if (!this.container) return;

    this.options = {
      maxScale: options.maxScale || 1.5,
      minScale: options.minScale || 1.0,
      range: options.range || 150,
      stiffness: options.stiffness || 0.1,
      damping: options.damping || 0.8,
      ...options
    };

    this.mouseX = 0;
    this.mouseY = 0;
    this.items = Array.from(this.container.children).filter(el =>
      el.tagName !== 'SCRIPT' && el.tagName !== 'STYLE'
    );

    this.init();
  }

  init() {
    this.container.addEventListener('mousemove', (e) => {
      const rect = this.container.getBoundingClientRect();
      this.mouseX = e.clientX - rect.left;
      this.mouseY = e.clientY - rect.top;
      this.updateItems();
    });

    this.container.addEventListener('mouseleave', () => {
      this.mouseX = Infinity;
      this.mouseY = Infinity;
      this.updateItems();
    });

    this.updateItems();
  }

  updateItems() {
    this.items.forEach((item) => {
      const rect = item.getBoundingClientRect();
      const containerRect = this.container.getBoundingClientRect();
      const itemCenterX = rect.left + rect.width / 2 - containerRect.left;
      const itemCenterY = rect.top + rect.height / 2 - containerRect.top;
      const distance = Math.sqrt(
        Math.pow(this.mouseX - itemCenterX, 2) +
        Math.pow(this.mouseY - itemCenterY, 2)
      );
      const scale = this.calculateScale(distance);
      item.style.transform = `scale(${scale})`;
      item.style.transition = `transform ${this.options.stiffness * 1000}ms cubic-bezier(0.25, 0.46, 0.45, 0.94)`;
    });
  }

  calculateScale(distance) {
    if (distance === Infinity) return this.options.minScale;
    const normalizedDistance = Math.min(distance / this.options.range, 1);
    const scaleRange = this.options.maxScale - this.options.minScale;
    return Math.max(this.options.maxScale - normalizedDistance * scaleRange, this.options.minScale);
  }
}

// Initialize everything when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Initialize animated waves background
  window.wavesBackground = new WavesBackground({
    strokeColor: 'rgba(255,255,255,0.28)',
    backgroundColor: '#000000',
    pointerSize: 8
  });

  initializeBrandHomeNavigation();

  // Add keyboard shortcut
  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'B') {
      e.preventDefault();
      const canvas = document.getElementById('waves-background');
      const overlay = document.querySelector('.beams-overlay');
      if (canvas) canvas.style.display = canvas.style.display === 'none' ? 'block' : 'none';
      if (overlay) overlay.style.display = overlay.style.display === 'none' ? 'block' : 'none';
    }
  });

  // Initialize animated docks
  new AnimatedDock('.cta-row', { maxScale: 1.15, minScale: 1.0, range: 120 });
  new AnimatedDock('.tab-list', { maxScale: 1.2, minScale: 1.0, range: 100 });
  new AnimatedDock('.feedback-tabs', { maxScale: 1.25, minScale: 1.0, range: 80 });
  new AnimatedDock('.top-nav', { maxScale: 1.1, minScale: 1.0, range: 150 });
  new AnimatedDock('.connect-grid', { maxScale: 1.1, minScale: 1.0, range: 120 });

  // Initialize sidebar
  const sidebar = document.getElementById('sidebar');
  const openSidebarBtn = document.getElementById('openSidebar');
  openSidebarBtn?.addEventListener('click', () => {
    if (!sidebar) return;
    if (window.matchMedia('(max-width: 960px)').matches) {
      sidebar.classList.toggle('open');
      return;
    }
    sidebar.classList.toggle('collapsed');
  });

  initializeSidebarNav();

  // Activate current nav link
  const current = location.pathname.split('/').pop() || 'featurehub.html';
  document.querySelectorAll('.nav-link').forEach((link) => {
    const href = link.getAttribute('href');
    if ((current === '' && href === 'featurehub.html') || href === current) link.classList.add('active');
  });

  // Initialize report modal functionality
  initializeAiModal();

  // Initialize other page-specific functionality
  initializePageSpecific();

  hydrateReportsFromServer();
  initializePageFeedbackBox();
});

function initializeBrandHomeNavigation() {
  const brandSelectors = ['.brand', '.brand-inline'];

  document.querySelectorAll(brandSelectors.join(', ')).forEach((brand) => {
    if (brand.tagName === 'A') return;

    brand.classList.add('brand-clickable');

    const goHome = () => {
      window.location.href = 'landing.html';
    };

    brand.addEventListener('click', (event) => {
      if (event.target.closest('button, a, input, select, textarea')) return;
      goHome();
    });

    brand.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      if (event.target.closest('button, a, input, select, textarea')) return;
      event.preventDefault();
      goHome();
    });

    if (!brand.hasAttribute('tabindex')) {
      brand.setAttribute('tabindex', '0');
    }
    brand.setAttribute('role', 'link');
    brand.setAttribute('aria-label', 'Go to landing page');
  });
}

function initializeSidebarNav() {
  const sidebarRoot = document.getElementById('sidebarNavRoot');
  if (!sidebarRoot) return;

  const icon = (paths) => `<svg class="nav-svg" viewBox="0 0 24 24" fill="none" aria-hidden="true">${paths}</svg>`;
  const icons = {
    home: icon('<path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-5v-6h-4v6H5a1 1 0 0 1-1-1v-9.5Z"/><path d="M9 21h6"/>'),
    dashboard: icon('<rect x="4" y="4" width="7" height="7" rx="1.5"/><rect x="13" y="4" width="7" height="4" rx="1.5"/><rect x="13" y="10" width="7" height="10" rx="1.5"/><rect x="4" y="13" width="7" height="7" rx="1.5"/>'),
    report: icon('<path d="M7 3h7l4 4v14H7a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Z"/><path d="M14 3v5h5"/><path d="M9 12h6M9 16h6"/>'),
    social: icon('<rect x="4" y="5" width="16" height="14" rx="2"/><path d="M8 9h.01M12 9h.01M16 9h.01M8 13h.01M12 13h.01M16 13h.01"/>'),
    strategy: icon('<circle cx="12" cy="12" r="7"/><circle cx="12" cy="12" r="3"/><path d="M16.5 7.5 20 4M18 4h2v2"/>'),
    brand: icon('<path d="m12 3 1.6 5.1L19 10l-5.4 1.9L12 17l-1.6-5.1L5 10l5.4-1.9L12 3Z"/><path d="m19 15 .7 2.3L22 18l-2.3.7L19 21l-.7-2.3L16 18l2.3-.7L19 15Z"/>'),
    campaigns: icon('<path d="M4 14 14 4l6 6-10 10-6-6Z"/><path d="m14 4 1 5 5 1"/><path d="M4 20h4"/>'),
    content: icon('<path d="M6 4h9l3 3v13H6V4Z"/><path d="M15 4v4h4"/><path d="M9 12h6M9 16h4"/>'),
  };

  const categories = [
    {
      label: 'Feature Hub',
      icon: icons.home,
      links: [{ label: 'Feature Hub', href: 'featurehub.html' }],
    },
    {
      label: 'Dashboard',
      icon: icons.dashboard,
      links: [{ label: 'Dashboard', href: 'dashboard-overview.html' }],
    },
    {
      label: 'Report',
      icon: icons.report,
      links: [
        { label: 'Report', href: 'report.html' },
        { label: 'Comparison Metrics', href: 'comparison-metrics.html' },
      ],
    },
    {
      label: 'Social Media Manager',
      icon: icons.social,
      links: [
        { label: 'Connect', href: 'connect.html' },
        { label: 'Scheduling', href: 'upload.html' },
      ],
    },
    {
      label: 'Strategy',
      icon: icons.strategy,
      links: [
        { label: 'Brand Scorecard', href: 'strategy.html' },
        { label: 'ICP Builder', href: 'strategy.html#icp' },
        { label: 'Positioning Wizard', href: 'strategy.html#positioning' },
      ],
    },
    {
      label: 'Brand',
      icon: icons.brand,
      links: [
        { label: 'Brand Voice Builder', href: 'brand.html' },
        { label: 'Tagline Generator', href: 'brand.html#tagline' },
      ],
    },
    {
      label: 'Campaigns',
      icon: icons.campaigns,
      links: [
        { label: 'Ads Copy Grader', href: 'ad-copy-grader.html' },
        { label: 'Creative Brief Builder', href: 'creative-brief-builder.html' },
      ],
    },
    {
      label: 'Content',
      icon: icons.content,
      links: [
        { label: 'Content Calendar', href: 'content-calendar.html' },
        { label: 'Ghost Writer', href: 'ghost-writer.html' },
        { label: 'Hook Library', href: 'hook-library.html' },
        { label: 'Drop Ideas', href: 'drop-ideas.html' },
      ],
    },
  ];

  sidebarRoot.innerHTML = '<div class="nav-label">Navigation</div>' + categories
    .map((category) => {
      if (category.links.length === 1) {
        const link = category.links[0];
        return `<a class="nav-link" href="${link.href}" title="${category.label}"><span class="nav-icon" aria-hidden="true">${category.icon}</span><span class="nav-text">${category.label}</span></a>`;
      }
      const submenu = category.links
        .map((link) => `<a class="nav-link" href="${link.href}"><span class="nav-text">${link.label}</span></a>`)
        .join('');
      return `
        <div class="nav-category">
          <button type="button" class="nav-category-toggle" aria-expanded="false" title="${category.label}"><span class="nav-icon" aria-hidden="true">${category.icon}</span><span class="nav-text">${category.label}</span><span class="nav-chevron">▾</span></button>
          <div class="nav-submenu">${submenu}</div>
        </div>
      `;
    })
    .join('');

  const dropdownCategories = categories.filter((category) => category.links.length > 1);
  sidebarRoot.querySelectorAll('.nav-category-toggle').forEach((button, index) => {
    button.title = dropdownCategories[index]?.label || '';
    button.addEventListener('click', () => {
      const submenu = button.nextElementSibling;
      if (!submenu) return;
      const isOpen = submenu.classList.toggle('open');
      button.classList.toggle('active', isOpen);
      button.setAttribute('aria-expanded', String(isOpen));
    });
  });
}

function trackClientActivity(event = {}) {
  if (typeof window.__trackClientActivity === 'function') {
    window.__trackClientActivity(event);
  }
}

function getScopedStorageKey(baseKey) {
  try {
    const user = JSON.parse(localStorage.getItem('user') || 'null');
    const email = String(user?.email || '').trim().toLowerCase();
    return email ? `evv:${email}:${baseKey}` : baseKey;
  } catch {
    return baseKey;
  }
}

function initializePageFeedbackBox() {
  const page = location.pathname.split('/').pop() || 'featurehub.html';
  const feedbackPages = new Set([
    'report.html',
    'comparison-metrics.html',
    'strategy.html',
    'brand.html',
    'ad-copy-grader.html',
    'creative-brief-builder.html',
    'content-lab.html',
    'content-calendar.html',
    'ghost-writer.html',
    'hook-library.html',
    'drop-ideas.html',
  ]);

  if (!feedbackPages.has(page) || document.querySelector('[data-page-feedback]')) return;

  const main = document.querySelector('.page main, main');
  if (!main) return;

  const storageKey = `page-feedback:${page}`;
  const items = readScopedJson(storageKey, []);
  const card = document.createElement('section');
  card.className = 'page-feedback-card';
  card.dataset.pageFeedback = page;
  card.innerHTML = `
    <div class="page-feedback-head">
      <div>
        <h2>Feedback</h2>
        <p>Share notes, issues, or ideas for this workspace.</p>
      </div>
    </div>
    <textarea class="page-feedback-input" placeholder="Write your feedback here..."></textarea>
    <div class="page-feedback-actions">
      <span class="page-feedback-status"></span>
      <button class="pill-btn small" type="button">Submit</button>
    </div>
    <ul class="page-feedback-list"></ul>
  `;

  main.appendChild(card);

  const input = card.querySelector('.page-feedback-input');
  const status = card.querySelector('.page-feedback-status');
  const button = card.querySelector('button');
  const list = card.querySelector('.page-feedback-list');

  const render = () => {
    const currentItems = readScopedJson(storageKey, []);
    list.innerHTML = '';
    status.textContent = currentItems.length ? `${currentItems.length} saved` : 'No feedback yet';
    currentItems.slice(0, 5).forEach((item, index) => {
      const li = document.createElement('li');
      const date = new Date(item.time || Date.now()).toLocaleDateString();
      li.innerHTML = `<span><strong>${date}</strong>${escapeHtml(item.text || '')}</span><button type="button" data-index="${index}">Delete</button>`;
      list.appendChild(li);
    });
  };

  button.addEventListener('click', () => {
    const text = input.value.trim();
    if (!text) {
      status.textContent = 'Write feedback before submitting.';
      return;
    }
    const currentItems = readScopedJson(storageKey, []);
    currentItems.unshift({ text, time: Date.now() });
    writeScopedJson(storageKey, currentItems.slice(0, 20));
    input.value = '';
    render();
  });

  list.addEventListener('click', (event) => {
    const deleteButton = event.target.closest('[data-index]');
    if (!deleteButton) return;
    const currentItems = readScopedJson(storageKey, []);
    currentItems.splice(Number(deleteButton.dataset.index), 1);
    writeScopedJson(storageKey, currentItems);
    render();
  });

  render();
}

function readScopedJson(baseKey, fallback) {
  try {
    const raw = localStorage.getItem(getScopedStorageKey(baseKey));
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}

function writeScopedJson(baseKey, value) {
  localStorage.setItem(getScopedStorageKey(baseKey), JSON.stringify(value));
}

function readScopedString(baseKey, fallback = '') {
  const value = localStorage.getItem(getScopedStorageKey(baseKey));
  return value == null ? fallback : value;
}

function writeScopedString(baseKey, value) {
  localStorage.setItem(getScopedStorageKey(baseKey), value);
}

function initializeAiModal() {
  // Get modal elements
  const aiModal = document.getElementById('aiModal');
  const aiModalBackdrop = document.getElementById('aiModalBackdrop');
  const aiModalClose = document.getElementById('aiModalClose');
  const aiForm = document.getElementById('aiForm');
  const aiStart = document.getElementById('aiStart');
  const aiEnd = document.getElementById('aiEnd');
  const aiLogo = document.getElementById('aiLogo');
  const aiLogoLabel = document.getElementById('aiLogoLabel');
  const aiCta = document.getElementById('aiCta');
  const calendarToggle = document.getElementById('calendarToggle');
  const calendarPrev = document.getElementById('calendarPrev');
  const calendarNext = document.getElementById('calendarNext');

  if (!aiModal) return; // Exit if modal doesn't exist on this page

  // Set date bounds
  function setDateBounds() {
    if (!aiStart || !aiEnd) return;
    const minDate = '2025-01-01';
    const currentYear = new Date().getFullYear();
    const maxDate = `${currentYear}-12-31`;
    aiStart.min = minDate;
    aiEnd.min = minDate;
    aiStart.max = maxDate;
    aiEnd.max = maxDate;

    if (!selectedStart && !selectedEnd) {
      selectedStart = null;
      selectedEnd = null;
      calendarMonth = new Date();
    }

    updateCalendarLabels();
    renderCalendar();
  }

  // Modal functions
  function openAiModal() {
    setDateBounds();
    setCalendarVisibility(false);
    syncAiPlatformFromLatestUpload();
    if (aiModal) {
      aiModal.classList.add('show');
      aiModal.style.display = 'block';
    }
    if (aiModalBackdrop) {
      aiModalBackdrop.classList.add('show');
      aiModalBackdrop.style.display = 'block';
    }
  }

  function closeAiModal() {
    if (aiModal) {
      aiModal.classList.remove('show');
      aiModal.style.display = 'none';
    }
    if (aiModalBackdrop) {
      aiModalBackdrop.classList.remove('show');
      aiModalBackdrop.style.display = 'none';
    }
  }

  // Bind event listeners
  aiCta?.addEventListener('click', (e) => {
    e.preventDefault();
    openAiModal();
  });

  document.querySelectorAll('.ai-trigger').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      openAiModal();
    });
  });

  aiModalClose?.addEventListener('click', closeAiModal);
  aiModalBackdrop?.addEventListener('click', closeAiModal);

  calendarToggle?.addEventListener('click', toggleCalendar);
  calendarPrev?.addEventListener('click', () => moveCalendar(-1));
  calendarNext?.addEventListener('click', () => moveCalendar(1));

  aiStart?.addEventListener('change', () => {
    if (!aiEnd) return;
    aiEnd.min = aiStart.value;
    if (aiEnd.value < aiStart.value) aiEnd.value = aiStart.value;
  });

  aiEnd?.addEventListener('change', () => {
    if (!aiStart) return;
    if (aiEnd.value && aiEnd.value < aiStart.value) {
      alert('End date cannot be before start date.');
      aiEnd.value = aiStart.value;
    }
  });

  const reportDropZone = document.getElementById('reportDropZone');
  const reportDropInput = document.getElementById('reportDropInput');

  function syncDroppedFile(file) {
    if (!aiLogo || !aiLogoLabel || !file) return;
    const dt = new DataTransfer();
    dt.items.add(file);
    aiLogo.files = dt.files;
    aiLogoLabel.textContent = file.name;
    const detectedPlatform = detectPlatformFromFilename(file.name);
    if (aiPlatform && detectedPlatform) {
      aiPlatform.value = detectedPlatform;
    }
    if (reportDropZone) {
      reportDropZone.querySelector('.drop-label').textContent = `Ready to generate: ${file.name}`;
      reportDropZone.querySelector('.drop-sub').textContent = 'Click to open report options or drop another file.';
    }
    openAiModal();
  }

  reportDropZone?.addEventListener('click', () => reportDropInput?.click());
  reportDropInput?.addEventListener('change', () => {
    const file = reportDropInput.files?.[0];
    if (file) syncDroppedFile(file);
  });

  reportDropZone?.addEventListener('dragenter', (event) => {
    event.preventDefault();
    reportDropZone.classList.add('dragover');
  });
  reportDropZone?.addEventListener('dragover', (event) => {
    event.preventDefault();
    reportDropZone.classList.add('dragover');
  });
  reportDropZone?.addEventListener('dragleave', () => {
    reportDropZone.classList.remove('dragover');
  });
  reportDropZone?.addEventListener('drop', (event) => {
    event.preventDefault();
    reportDropZone.classList.remove('dragover');
    const file = event.dataTransfer?.files?.[0];
    if (file) syncDroppedFile(file);
  });

  aiLogo?.addEventListener('change', () => {
    if (!aiLogoLabel) return;
    const file = aiLogo.files?.[0];
    aiLogoLabel.textContent = file ? file.name : 'Upload logo image';
  });

  aiForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!aiStart || !aiEnd) return;
    if (!aiStart.value || !aiEnd.value) {
      return alert('Please select both a start date and an end date.');
    }

    const submitBtn = aiForm.querySelector('button[type="submit"]');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Generating...';
    }

    try {
      await createReport(aiStart.value, aiEnd.value, aiLogo?.files?.[0]?.name || null, aiPlatform?.value || 'Instagram');
      closeAiModal();
      aiForm.reset();
      setDateBounds();
      alert('Report generated successfully!');
    } catch (error) {
      console.error('Error generating report:', error);
      alert('Error generating report. Please try again.');
    } finally {
      if (submitBtn) {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Generate Report';
      }
    }
  });

  // Initialize
  setCalendarVisibility(false);
  renderCalendar();
  setDateBounds();

  console.log('Report modal initialized');
  window.__openAiModal = openAiModal;
  window.__closeAiModal = closeAiModal;
}

function initializePageSpecific() {
  // Dashboard specific
  const postsTable = document.getElementById('postsTable');
  const statConnected = document.getElementById('statConnected');
  const statReports = document.getElementById('statReports');
  const statPlatforms = document.getElementById('statPlatforms');

  // Upload specific
  const postFile = document.getElementById('postFile');
  const postFileLabel = document.getElementById('postFileLabel');
  const accountSearch = document.getElementById('accountSearch');
  const accountChips = document.getElementById('accountChips');
  const postCaption = document.getElementById('postCaption');
  const generateCaptionBtn = document.getElementById('generateCaption');
  const scheduleForm = document.getElementById('scheduleForm');
  const scheduleDate = document.getElementById('scheduleDate');
  const scheduleTime = document.getElementById('scheduleTime');

  // Connect specific
  const dashUploadBtn = document.getElementById('dashUploadBtn');
  const dashUploadFile = document.getElementById('dashUploadFile');
  const uploadModal = document.getElementById('uploadModal');
  const uploadModalClose = document.getElementById('uploadModalClose');
  const uploadModalBackdrop = document.getElementById('uploadModalBackdrop');
  const uploadModalBrowse = document.getElementById('uploadModalBrowse');
  const uploadModalInput = document.getElementById('uploadModalInput');
  const uploadModalDrop = document.getElementById('uploadModalDrop');
  const uploadModalSubmit = document.getElementById('uploadModalSubmit');

  // Report specific
  const reportDetail = document.getElementById('reportDetail');
  const detailTitle = document.getElementById('detailTitle');
  const detailDates = document.getElementById('detailDates');
  const detailSummary = document.getElementById('detailSummary');
  const detailPlatform = document.getElementById('detailPlatform');
  const detailMetrics = document.getElementById('detailMetrics');
  const detailTakeaways = document.getElementById('detailTakeaways');
  const detailActions = document.getElementById('detailActions');
  const exportPdfBtn = document.getElementById('exportPdf');
  const reportsList = document.getElementById('reportsList');
  const emptyCard = document.querySelector('.empty-card');

  // Add event listeners based on what exists on the page
  if (postsTable) {
    // Dashboard functionality
    renderPosts();
  }

  if (postFile) {
    // Post data page functionality
    ctaPost?.addEventListener('click', () => newPostFile?.click());
    newPostFile?.addEventListener('change', async () => {
      // ... existing code
    });
  }

  if (dashUploadBtn) {
    // Connect page functionality
    dashUploadBtn?.addEventListener('click', openUploadModal);
    dashUploadFile?.addEventListener('change', async () => {
      // ... existing code
    });
  }

  if (reportDetail) {
    // Report page functionality
    exportPdfBtn?.addEventListener('click', () => window.print());
    renderReports();
  }

  console.log('Page-specific functionality initialized');
}

// Posts listing (dashboard)
const postsTable = document.getElementById('postsTable');
const statConnected = document.getElementById('statConnected');
const statReports = document.getElementById('statReports');
const statPlatforms = document.getElementById('statPlatforms');
let perPlatformMetrics = {};
let activeMetric = 'All Metrics';
let lastPostsCache = [];
const periodLabel = document.getElementById('periodLabel');
const profileName = document.getElementById('profileName');
const profileHandle = document.getElementById('profileHandle');
const uploadStatus = document.getElementById('uploadStatus');

async function parseUploadResponse(response) {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || 'Upload failed');
  }
  return payload;
}

function buildUploadStatusMessage(payload, fallbackName) {
  const filesLabel = fallbackName || payload?.files || 'your upload';
  const normalization = payload?.normalization || {};
  const geminiFiles = Number(normalization.geminiFiles || 0);
  const fallbackFiles = Number(normalization.fallbackFiles || 0);

  if (geminiFiles && !fallbackFiles) {
    return `Using ${filesLabel} • normalized ${geminiFiles} file${geminiFiles === 1 ? '' : 's'}`;
  }
  if (geminiFiles && fallbackFiles) {
    return `Using ${filesLabel} • normalized ${geminiFiles}, fallback ${fallbackFiles}`;
  }
  return `Using ${filesLabel} • Fallback parser`;
}

function buildUploadAlertMessage(payload) {
  const normalization = payload?.normalization || {};
  const geminiFiles = Number(normalization.geminiFiles || 0);
  const fallbackFiles = Number(normalization.fallbackFiles || 0);
  const warnings = Array.isArray(normalization.warnings) ? normalization.warnings : [];
  let message = `Processed ${payload?.count ?? 0} rows`;

  if (geminiFiles && !fallbackFiles) {
    message += ` with normalization on ${geminiFiles} file${geminiFiles === 1 ? '' : 's'}.`;
  } else if (geminiFiles && fallbackFiles) {
    message += `. Normalization handled ${geminiFiles} file${geminiFiles === 1 ? '' : 's'} and fallback parsing handled ${fallbackFiles}.`;
  } else {
    message += ' with the fallback parser.';
  }

  if (warnings.length) {
    message += ` ${warnings.length} warning${warnings.length === 1 ? '' : 's'} recorded.`;
  }
  return message;
}

function formatNumber(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return String(value);
  return num.toLocaleString();
}

async function loadMetrics() {
  try {
    const res = await fetch('/api/metrics');
    if (!res.ok) return;
    const data = await res.json();
    const m = data.metrics || {};
    perPlatformMetrics = data.perPlatform || {};
    updateDashboardUploadHero(data.lastUploadName || readScopedString('lastUploadName'));
    if (uploadStatus) uploadStatus.textContent = data.lastUploadName ? `Using ${data.lastUploadName}` : '';
    renderPostizLiveSummary(data);
    renderPostizAgencySummary(data);
    const cards = document.querySelectorAll('.metric-card');
    const map = ['reach', 'interactions', 'clicks', 'reactions', 'views', 'follows', 'engagementRate'];
    cards.forEach((card, idx) => {
      const valEl = card.querySelector('.metric-value');
      const key = map[idx];
      if (!valEl || !key) return;
      valEl.textContent = key === 'engagementRate' ? `${formatNumber(m[key] ?? 0)}%` : formatNumber(m[key]);
    });
    updateChartDisplay(activeMetric);
  } catch (e) {
    console.error(e);
  }
}
async function loadPosts() {
  try {
    const res = await fetch('/api/posts');
    const data = await res.json();
    renderPosts(data.posts || []);
  } catch (err) {
    console.error(err);
  }
}
function renderPosts(posts = []) {
  lastPostsCache = posts;
  if (!postsTable) {
    updatePeriodLabel();
    updateProfile();
    return;
  }
  postsTable.innerHTML = '';
  posts.forEach((p) => {
    const row = document.createElement('div');
    row.className = 'table-row';
    row.innerHTML = `
      <span>${p.platform}</span>
      <span>${p.title}</span>
      <span>${p.status === 'posted' ? '<span class="badge success">Posted</span>' : '<span class="badge pending">Scheduled</span>'}</span>
      <span>${p.engagement.likes}</span>
      <span>${p.engagement.comments}</span>
      <span>${p.engagement.shares}</span>
      <span>${p.postedAt ? new Date(p.postedAt).toLocaleString() : '—'}</span>`;
    postsTable.appendChild(row);
  });
  statConnected && (statConnected.textContent = Math.min(3, posts.length));
  statReports && (statReports.textContent = Math.max(0, Math.floor(posts.length / 2)));
  statPlatforms && (statPlatforms.textContent = 3);
  updatePeriodLabel();
  updateProfile();
}
loadPosts();
loadMetrics();

// New post quick action (dashboard)
const ctaPost = document.getElementById('ctaPost');
const newPostFile = document.getElementById('newPostFile');
ctaPost?.addEventListener('click', () => newPostFile?.click());
newPostFile?.addEventListener('change', async () => {
  const file = newPostFile.files?.[0];
  if (!file) return;
  try {
    const csv = await file.text();
    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, csv }),
    });
    await parseUploadResponse(uploadRes);
    const payload = { platform: 'Upload', title: file.name, transcript: 'Uploaded file' };
    await fetch('/api/posts', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    alert('File uploaded and post created');
    await loadPosts();
    await loadMetrics();
    await renderAIFeedback({ generate: true });
  } catch (err) {
    alert(err.message || 'Upload failed');
  } finally {
    newPostFile.value = '';
  }
});

// Dashboard upload action
const dashUploadBtn = document.getElementById('dashUploadBtn');
const dashUploadFile = document.getElementById('dashUploadFile');
const dashboardUploadHero = document.getElementById('dashboardUploadHero');
const dashboardUploadHeroBtn = document.getElementById('dashboardUploadHeroBtn');
const uploadModal = document.getElementById('uploadModal');
const uploadModalBackdrop = document.getElementById('uploadModalBackdrop');
const uploadModalClose = document.getElementById('uploadModalClose');
const uploadModalInput = document.getElementById('uploadModalInput');
const uploadModalBrowse = document.getElementById('uploadModalBrowse');
const uploadModalDrop = document.getElementById('uploadModalDrop');
const uploadModalSubmit = document.getElementById('uploadModalSubmit');
const uploadList = document.getElementById('uploadList');
let pendingFiles = [];

function updateDashboardUploadHero(uploadName) {
  if (!dashboardUploadHero) return;
  dashboardUploadHero.classList.toggle('hidden', Boolean(uploadName));
}

updateDashboardUploadHero(readScopedString('lastUploadName'));

function openUploadModal() {
  uploadModal?.classList.add('show');
  uploadModalBackdrop?.classList.add('show');
}
function closeUploadModal() {
  uploadModal?.classList.remove('show');
  uploadModalBackdrop?.classList.remove('show');
  pendingFiles = [];
  renderUploadList();
}

dashUploadBtn?.addEventListener('click', openUploadModal);
dashboardUploadHeroBtn?.addEventListener('click', openUploadModal);
dashUploadFile?.addEventListener('change', async () => {
  const file = dashUploadFile.files?.[0];
  if (!file) return;
  try {
    const csv = await file.text();
    const uploadRes = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ filename: file.name, csv }),
    });
    const payload = await parseUploadResponse(uploadRes);
    writeScopedString('lastUploadName', file.name);
    trackClientActivity({
      eventType: 'upload_analytics',
      eventLabel: 'Uploaded analytics file',
      eventDetail: file.name,
      pageName: 'Dashboard',
      pageCategory: 'Analytics',
      eventMeta: { files: 1 }
    });
    updateDashboardUploadHero(file.name);
    alert(buildUploadAlertMessage(payload));
    uploadStatus && (uploadStatus.textContent = buildUploadStatusMessage(payload, file.name));
    updateChartDisplay(activeMetric);
    await loadPosts();
    await loadMetrics();
    await renderAIFeedback({ generate: true });
  } catch (err) {
    alert(err.message || 'Upload failed');
  } finally {
    dashUploadFile.value = '';
  }
});

// Modal upload handlers
uploadModalClose?.addEventListener('click', closeUploadModal);
uploadModalBackdrop?.addEventListener('click', closeUploadModal);
uploadModalBrowse?.addEventListener('click', () => uploadModalInput?.click());

uploadModalInput?.addEventListener('change', () => {
  const files = Array.from(uploadModalInput.files || []).slice(0, 3);
  pendingFiles = pendingFiles.concat(files).slice(0, 3);
  renderUploadList();
});

['dragenter', 'dragover'].forEach((ev) =>
  uploadModalDrop?.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadModalDrop.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  uploadModalDrop?.addEventListener(ev, (e) => {
    e.preventDefault();
    uploadModalDrop.classList.remove('dragover');
  })
);
uploadModalDrop?.addEventListener('drop', (e) => {
  const files = Array.from(e.dataTransfer.files || []).filter((f) => f.name.endsWith('.csv')).slice(0, 3);
  pendingFiles = pendingFiles.concat(files).slice(0, 3);
  renderUploadList();
});

function renderUploadList() {
  if (!uploadList) return;
  uploadList.innerHTML = '';
  if (!pendingFiles.length) return;
  pendingFiles.forEach((f, idx) => {
    const div = document.createElement('div');
    div.className = 'file-item';
    div.innerHTML = `<span>${f.name}</span><button class=\"delete-btn\" data-idx=\"${idx}\">Remove</button>`;
    uploadList.appendChild(div);
  });
  uploadList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const i = Number(btn.dataset.idx);
      pendingFiles.splice(i, 1);
      renderUploadList();
    });
  });
}

uploadModalSubmit?.addEventListener('click', async () => {
  if (!pendingFiles.length) return alert('Add at least one CSV file (up to 3).');
  try {
    const filesPayload = [];
    for (const f of pendingFiles) {
      const csv = await f.text();
      filesPayload.push({ filename: f.name, csv });
    }
    const res = await fetch('/api/upload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(filesPayload),
    });
    const payload = await parseUploadResponse(res);
    const fileNames = pendingFiles.map((f) => f.name).join(', ');
    writeScopedString('lastUploadName', fileNames);
    trackClientActivity({
      eventType: 'upload_analytics',
      eventLabel: 'Uploaded analytics batch',
      eventDetail: fileNames,
      pageName: 'Dashboard',
      pageCategory: 'Analytics',
      eventMeta: { files: pendingFiles.length }
    });
    updateDashboardUploadHero(fileNames);
    uploadStatus && (uploadStatus.textContent = buildUploadStatusMessage(payload, fileNames));
    alert(buildUploadAlertMessage(payload));
    pendingFiles = [];
    renderUploadList();
    closeUploadModal();
    await loadPosts();
    await loadMetrics();
    await renderAIFeedback({ generate: true });
  } catch (err) {
    alert(err.message || 'Upload failed');
  }
});

// Platform connect modal
const modal = document.getElementById('modal');
const modalForm = document.getElementById('modalForm');
const modalPlatform = document.getElementById('modalPlatform');
const modalClose = document.getElementById('modalClose');
const modalBackdrop = document.getElementById('modalBackdrop');
function readConnections() {
  try {
    return readScopedJson('connections', []);
  } catch {
    return [];
  }
}

function writeConnections(list) {
  writeScopedJson('connections', list);
}

function getConnectionButton(platform) {
  return document.querySelector(`.connect-btn[data-platform="${platform}"], .connect-trigger[data-platform="${platform}"]`);
}

function getConnectionDisplayName(connection = {}) {
  return connection.displayName || connection.username || connection.name || connection.email || connection.platform || 'Connected account';
}

function handlePostizPopupReturn() {
  const params = new URLSearchParams(window.location.search);
  const connectedPlatform = params.get('connected');
  if (!connectedPlatform) return;
  try {
    window.opener?.postMessage({ type: 'postiz-connected', platform: connectedPlatform }, window.location.origin);
  } catch {
    // The opener may be unavailable if the page was opened directly.
  }
  if (window.opener && !window.opener.closed) {
    window.close();
  } else {
    window.history.replaceState({}, document.title, window.location.pathname);
  }
}

function renderPostizLiveSummary(data = {}) {
  const container = document.getElementById('postizLiveSummary');
  if (!container) return;
  const postiz = data.postiz || {};
  const analytics = postiz.analytics || {};
  const metrics = data.metrics || {};
  const accounts = Array.isArray(postiz.integrations) ? postiz.integrations : [];
  const followerAccounts = Array.isArray(postiz.followerStats?.accounts) ? postiz.followerStats.accounts : [];
  const postCount = Number(postiz.posts?.posts?.length || data.posts?.length || 0);

  if (postiz.error) {
    container.innerHTML = `<div class="empty-report">${escapeHtml(postiz.error)}</div>`;
    return;
  }

  if (!accounts.length && !postCount && !followerAccounts.length) {
    container.innerHTML = '<div class="empty-report">No Postiz accounts are connected yet. Use Connect Platforms first.</div>';
    return;
  }

  const metricCards = [
    ['Reach', metrics.reach],
    ['Interactions', metrics.interactions],
    ['Clicks', metrics.clicks],
    ['Reactions', metrics.reactions],
    ['Views', metrics.views],
    ['Follows', metrics.follows],
    ['Avg Engagement', `${formatNumber(metrics.engagementRate || 0)}%`],
  ].map(([label, value]) => `
    <div class="postiz-metric">
      <span>${escapeHtml(label)}</span>
      <strong>${typeof value === 'string' ? value : formatNumber(value || 0)}</strong>
    </div>
  `).join('');

  const accountRows = accounts.slice(0, 8).map((account) => {
    const label = account.name || account.profile || getConnectionDisplayName(account);
    const platform = account.identifier || account.providerIdentifier || account.platform || '';
    return `<div class="recent-report-row"><div><div class="recent-report-title">${escapeHtml(label)}</div><div class="recent-report-meta">${escapeHtml(platform)}</div></div><span class="badge">Connected</span></div>`;
  }).join('');
  const followerRows = followerAccounts.slice(0, 4).map((account) => {
    const label = getConnectionDisplayName(account);
    return `<div class="recent-report-row"><div><div class="recent-report-title">${escapeHtml(label)}</div><div class="recent-report-meta">${escapeHtml(account.platform || '')} follows</div></div><strong>${formatNumber(account.currentFollowers || 0)}</strong></div>`;
  }).join('');

  container.innerHTML = `
    <div class="recent-report-row">
      <div>
        <div class="recent-report-title">${formatNumber(postCount)} Postiz posts tracked</div>
        <div class="recent-report-meta">${accounts.length ? `${formatNumber(accounts.length)} connected channel${accounts.length === 1 ? '' : 's'}` : 'Analytics access active'}</div>
      </div>
    </div>
    <div class="postiz-metric-grid">${metricCards}</div>
    ${accountRows}
    ${followerRows}
  `;
}

function renderPostizAgencySummary(data = {}) {
  const container = document.getElementById('postizAgencySummary');
  if (!container) return;
  const postiz = data.postiz || {};
  const groups = Array.isArray(postiz.groups) ? postiz.groups : [];
  const integrations = Array.isArray(postiz.integrations) ? postiz.integrations : [];
  if (postiz.error) {
    container.innerHTML = `<div class="empty-report">${escapeHtml(postiz.error)}</div>`;
    return;
  }
  if (!groups.length && !integrations.length) {
    container.innerHTML = '<div class="empty-report">No Postiz agency customers or channels returned yet.</div>';
    return;
  }
  const groupRows = groups.slice(0, 6).map((group) => {
    const count = integrations.filter((item) => item.customer?.id === group.id).length;
    return `<div class="recent-report-row"><div><div class="recent-report-title">${escapeHtml(group.name || 'Customer')}</div><div class="recent-report-meta">${escapeHtml(group.id || '')}</div></div><strong>${formatNumber(count)}</strong></div>`;
  }).join('');
  const ungrouped = integrations.filter((item) => !item.customer?.id).length;
  container.innerHTML = `
    <div class="postiz-metric-grid">
      <div class="postiz-metric"><span>Customers</span><strong>${formatNumber(groups.length)}</strong></div>
      <div class="postiz-metric"><span>Channels</span><strong>${formatNumber(integrations.length)}</strong></div>
      <div class="postiz-metric"><span>Ungrouped</span><strong>${formatNumber(ungrouped)}</strong></div>
    </div>
    ${groupRows}
  `;
}

handlePostizPopupReturn();

function openModal(platform) {
  const savedConnection = readConnections().find((connection) => connection.platform === platform);
  modalPlatform.textContent = platform;
  modal?.classList.add('show');
  modalBackdrop?.classList.add('show');
  if (modalForm) {
    modalForm.dataset.platform = platform;
    modalForm.reset();
  }
  const modalUser = document.getElementById('modalUser');
  const modalUserId = document.getElementById('modalUserId');
  if (savedConnection) {
    if (modalUser) modalUser.value = savedConnection.username || '';
    if (modalUserId) modalUserId.value = savedConnection.userId || '';
  }
}
function closeModal() {
  modal?.classList.remove('show');
  modalBackdrop?.classList.remove('show');
}
modalClose?.addEventListener('click', closeModal);
modalBackdrop?.addEventListener('click', closeModal);

modalForm?.addEventListener('submit', (e) => {
  e.preventDefault();
  const platform = modalForm.dataset.platform;
  const username = document.getElementById('modalUser')?.value.trim() || '';
  const userId = document.getElementById('modalUserId')?.value.trim() || '';
  if (!platform || !username) {
    alert('Enter an account username or email.');
    return;
  }
  const nextConnection = {
    id: `${platform || 'account'}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    platform,
    username,
    userId,
    displayName: username,
    accountId: userId || username,
    savedAt: Date.now(),
  };
  const nextConnections = [...readConnections(), nextConnection];
  writeConnections(nextConnections);
  trackClientActivity({
    eventType: 'edit_connection',
    eventLabel: 'Saved connection',
    eventDetail: `${platform} account updated`,
    pageName: 'Connect',
    pageCategory: 'Connections',
    eventMeta: { platform }
  });
  closeModal();
  alert(`${platform} account saved for scheduling.`);
  renderConnections();
  renderAvailableAccounts();
});

const META_APP_ID = '1502053464099181';
const META_API_VERSION = 'v25.0';
let facebookSdkReadyPromise = null;

function loadFacebookSdk() {
  if (window.FB) {
    return Promise.resolve(window.FB);
  }
  if (facebookSdkReadyPromise) {
    return facebookSdkReadyPromise;
  }

  facebookSdkReadyPromise = new Promise((resolve, reject) => {
    window.fbAsyncInit = function() {
      window.FB.init({
        appId: META_APP_ID,
        cookie: true,
        xfbml: true,
        version: META_API_VERSION,
      });

      if (window.FB.AppEvents?.logPageView) {
        window.FB.AppEvents.logPageView();
      }
      resolve(window.FB);
    };

    if (document.getElementById('facebook-jssdk')) {
      return;
    }

    const firstScript = document.getElementsByTagName('script')[0];
    const script = document.createElement('script');
    script.id = 'facebook-jssdk';
    script.src = 'https://connect.facebook.net/en_US/sdk.js';
    script.onerror = () => reject(new Error('Failed to load the Facebook SDK.'));
    firstScript?.parentNode?.insertBefore(script, firstScript);
  });

  return facebookSdkReadyPromise;
}

function fbApi(path, params = {}) {
  return new Promise((resolve, reject) => {
    if (!window.FB) {
      reject(new Error('Facebook SDK is not loaded.'));
      return;
    }
    window.FB.api(path, 'get', params, (response) => {
      if (!response || response.error) {
        reject(new Error(response?.error?.message || `Facebook API request failed for ${path}`));
        return;
      }
      resolve(response);
    });
  });
}

async function startFacebookConnection() {
  try {
    const FB = await loadFacebookSdk();
    FB.login(async (loginResponse) => {
      if (!loginResponse?.authResponse) {
        alert('Facebook connection was cancelled or not approved.');
        return;
      }

      try {
        const profile = await fbApi('/me', { fields: 'id,name' });
        const pageResponse = await fbApi('/me/accounts', {
          fields: 'id,name,instagram_business_account{id,username,name}',
        });

        const existingConnections = readConnections().filter((connection) => {
          return !(connection.authProvider === 'meta' && (connection.platform === 'Facebook' || connection.platform === 'Instagram'));
        });

        const nextConnections = [...existingConnections];
        const pages = Array.isArray(pageResponse?.data) ? pageResponse.data : [];

        if (pages.length) {
          pages.forEach((page) => {
            nextConnections.push({
              platform: 'Facebook',
              username: page.name || profile.name || 'Facebook Page',
              userId: page.id || profile.id || '',
              authProvider: 'meta',
              savedAt: Date.now(),
            });

            const instagramAccount = page.instagram_business_account;
            if (instagramAccount?.id) {
              nextConnections.push({
                platform: 'Instagram',
                username: instagramAccount.username || instagramAccount.name || page.name || 'Instagram Business',
                userId: instagramAccount.id,
                authProvider: 'meta',
                savedAt: Date.now(),
              });
            }
          });
        } else {
          nextConnections.push({
            platform: 'Facebook',
            username: profile.name || 'Facebook User',
            userId: profile.id || '',
            authProvider: 'meta',
            savedAt: Date.now(),
          });
        }

        writeConnections(nextConnections);
        trackClientActivity({
          eventType: 'edit_connection',
          eventLabel: 'Saved Meta connection',
          eventDetail: 'Facebook and linked Instagram accounts synced',
          pageName: 'Connect',
          pageCategory: 'Connections',
          eventMeta: { platform: 'Facebook', accounts: nextConnections.length }
        });
        renderConnections();
        renderAvailableAccounts();
        alert('Facebook connection saved. Any available Facebook Pages and linked Instagram business accounts are now available for scheduling.');
      } catch (error) {
        console.error('Meta connection error', error);
        alert(`Facebook connected, but account details could not be loaded: ${error.message}`);
      }
    }, {
      scope: 'public_profile,pages_show_list,instagram_basic',
      return_scopes: true,
    });
  } catch (error) {
    console.error('Facebook SDK load error', error);
    alert(`Unable to start Facebook connection: ${error.message}`);
  }
}

// Platforms handled by our own OAuth (direct, no 3rd party)
const DIRECT_OAUTH_PLATFORMS = {
  'Instagram': '/auth/facebook',
  'Facebook': '/auth/facebook',
};

document.querySelectorAll('.connect-btn, .connect-trigger').forEach((btn) => {
  btn.addEventListener('click', async () => {
    const platform = btn.dataset.platform;

    if (DIRECT_OAUTH_PLATFORMS[platform]) {
      const url = DIRECT_OAUTH_PLATFORMS[platform];
      const w = 720, h = 820;
      const left = Math.round(window.screenX + (window.outerWidth - w) / 2);
      const top = Math.round(window.screenY + (window.outerHeight - h) / 2);
      const popup = window.open(url, `connect-${platform}`, `width=${w},height=${h},left=${left},top=${top},scrollbars=yes`);

      if (!popup) {
        // Popup blocked — fall back to same tab
        window.location.href = url;
        return;
      }

      // When popup closes, reload connected accounts
      const poll = setInterval(() => {
        if (!popup.closed) return;
        clearInterval(poll);
        loadPostizConnections().then(() => renderConnections());
      }, 800);
      return;
    }

    alert(`${platform} connection is coming soon.`);
  });
});

window.addEventListener('message', (event) => {
  if (event.origin !== window.location.origin || event.data?.type !== 'postiz-connected') return;
  renderConnections();
});

// Fetch live integrations from Postiz via server and merge into local connections list
async function loadPostizConnections() {
  try {
    const sessionToken = (function () {
      try { return JSON.parse(localStorage.getItem('user') || 'null')?.token || ''; } catch { return ''; }
    })();
    const res = await fetch(`/api/auth/postiz-integrations?sessionToken=${encodeURIComponent(sessionToken)}`, {
      headers: { 'x-session-token': sessionToken },
    });
    if (!res.ok) return;
    const { integrations } = await res.json().catch(() => ({ integrations: [] }));
    if (!Array.isArray(integrations) || !integrations.length) return;

    const platformMap = {
      instagram: 'Instagram', 'instagram-standalone': 'Instagram',
      facebook: 'Facebook', linkedin: 'LinkedIn', 'linkedin-page': 'LinkedIn',
      tiktok: 'TikTok', x: 'Twitter', twitter: 'Twitter',
      youtube: 'YouTube', threads: 'Threads', pinterest: 'Pinterest',
    };

    const existing = readScopedJson('connections', []);
    integrations.forEach((integration) => {
      const rawPlatform = (integration.identifier || integration.providerIdentifier || '').toLowerCase();
      const platform = platformMap[rawPlatform] || rawPlatform;
      if (!platform) return;
      // Match by integration ID so the same account isn't duplicated on refresh
      const alreadyExists = existing.find((c) => c.integrationId === integration.id);
      if (!alreadyExists) {
        existing.push({
          platform,
          username: integration.name || integration.profile || integration.username || '',
          integrationId: integration.id,
          authProvider: 'postiz',
          connectedAt: new Date().toISOString(),
        });
      }
    });
    writeScopedJson('connections', existing);
  } catch (_) {}
}

function renderConnections() {
  const list = readScopedJson('connections', []);

  // Group accounts by platform (multiple accounts allowed per platform)
  const byPlatform = {};
  list.forEach((c) => {
    const key = (c.platform || 'Unknown').toLowerCase();
    byPlatform[key] = byPlatform[key] || [];
    byPlatform[key].push(c);
  });

  // Update each platform card
  document.querySelectorAll('.connect-user').forEach((el) => {
    const platform = el.dataset.platform;
    const accounts = byPlatform[platform.toLowerCase()] || [];

    if (accounts.length === 0) {
      el.innerHTML = '<span style="font-size:13px;opacity:0.5">Not connected</span>';
      return;
    }

    el.innerHTML = accounts.map((acc, idx) => `
      <div style="display:flex;align-items:center;gap:8px;margin-top:6px;flex-wrap:wrap;">
        <span style="color:#4ade80;font-size:12px;font-weight:500">● Connected</span>
        <span style="font-size:13px;opacity:0.85;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${acc.username || acc.email || 'Account ' + (idx + 1)}</span>
        <button class="disconnect-btn" data-platform="${platform}" data-index="${idx}"
          style="background:transparent;border:1px solid rgba(255,80,80,0.4);color:#ff6b6b;border-radius:6px;padding:2px 8px;font-size:11px;cursor:pointer;flex-shrink:0"
          title="Disconnect this account">✕ Remove</button>
      </div>`).join('');
  });

  // Wire up disconnect buttons
  document.querySelectorAll('.disconnect-btn').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const platform = btn.dataset.platform;
      const idx = parseInt(btn.dataset.index, 10);
      disconnectAccount(platform, idx);
    });
  });

  // Update connect button text — show "+ Add Another" if already has accounts
  document.querySelectorAll('.connect-btn, .connect-trigger').forEach((btn) => {
    const platform = btn.dataset.platform;
    const accounts = byPlatform[(platform || '').toLowerCase()] || [];
    if (accounts.length > 0) {
      btn.textContent = '+ Add Another';
      btn.disabled = false;
      btn.style.opacity = '1';
    } else {
      btn.textContent = '+ Connect';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });

  const statConnected = document.getElementById('statConnected');
  statConnected && (statConnected.textContent = list.length);
  renderAvailableAccounts && renderAvailableAccounts();
}

async function disconnectAccount(platform, idx) {
  const list = readScopedJson('connections', []);
  const platformAccounts = list.filter((c) => (c.platform || '').toLowerCase() === platform.toLowerCase());
  const toRemove = platformAccounts[idx];
  if (!toRemove) return;

  // If it has a Supabase id, delete from server too
  if (toRemove.id) {
    try {
      await fetch(`/api/social/accounts/${toRemove.id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn('Could not delete account from server:', err);
    }
  }

  const updated = list.filter((c) => c !== toRemove);
  writeScopedJson('connections', updated);
  renderConnections();
}

// On page load, pull live integrations then render
if (document.querySelector('.connect-btn, .connect-trigger')) {
  loadPostizConnections().then(() => renderConnections());
}

async function loadPostizConnections() {
  try {
    const response = await fetch('/api/social/accounts');
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) return readConnections();
    const accounts = Array.isArray(payload.accounts) ? payload.accounts : [];
    if (!accounts.length) return readConnections();

    // Keep any manually-added connections that aren't from our OAuth
    const manual = readConnections().filter((c) => c.authProvider === 'manual');

    // Map Supabase snake_case fields to our connection shape
    const oauthConnections = accounts.map((account) => ({
      id: account.id,                          // Supabase row id (for delete)
      platform: platformLabel(account.platform),
      username: account.account_name || account.platform,
      displayName: account.account_name || account.platform,
      accountId: account.account_id,
      authProvider: 'oauth',
      expiresAt: account.expires_at,
      savedAt: Date.now(),
    }));

    const nextConnections = [...manual, ...oauthConnections];
    writeConnections(nextConnections);
    return nextConnections;
  } catch (error) {
    console.warn('Could not load connected accounts:', error);
    return readConnections();
  }
}

function platformLabel(platform) {
  const map = {
    facebook: 'Facebook', facebook_page: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    tiktok: 'TikTok',
    pinterest: 'Pinterest',
    youtube: 'YouTube',
  };
  return map[platform] || (platform ? platform.charAt(0).toUpperCase() + platform.slice(1) : 'Unknown');
}

async function renderConnections() {
  const list = await loadPostizConnections();
  const groupedConnections = list.reduce((groups, connection) => {
    const platform = connection.platform || '';
    if (!platform) return groups;
    if (!groups[platform]) groups[platform] = [];
    groups[platform].push(connection);
    return groups;
  }, {});
  document.querySelectorAll('.connect-user').forEach((el) => {
    const platform = el.dataset.platform;
    const found = groupedConnections[platform] || [];
    const btn = getConnectionButton(platform);
    if (found.length) {
      const preview = found.slice(0, 2).map((connection) => getConnectionDisplayName(connection)).join(', ');
      const suffix = found.length > 2 ? ` +${found.length - 2} more` : '';
      el.innerHTML = `<span class="connected-badge">Connected</span> <span>${escapeHtml(preview)}${escapeHtml(suffix)}</span>`;
      if (btn) {
        btn.textContent = '+ Connect another';
        btn.disabled = false;
        btn.style.opacity = '1';
      }
      return;
    }
    el.innerHTML = '<span class="muted">Not connected</span>';
    if (btn) {
      btn.textContent = '+ Connect';
      btn.disabled = false;
      btn.style.opacity = '1';
    }
  });
  const statConnected = document.getElementById('statConnected');
  statConnected && (statConnected.textContent = list.length);
}

renderConnections();

// Google integrations
async function startGoogleConnection(service) {
  try {
    const res = await fetch(`/api/google/oauth-url?service=${encodeURIComponent(service)}`, { method: 'GET' });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.message || 'Could not get Google auth URL');
    }
    const data = await res.json();
    if (data.url) {
      window.location.href = data.url;
    }
  } catch (error) {
    alert(`Failed to connect ${service}: ${error.message}`);
    console.error(error);
  }
}

async function refreshGoogleStatus() {
  try {
    const resp = await fetch('/api/google/status');
    if (!resp.ok) return;
    const status = await resp.json();
    const gscEl = document.querySelector('.connect-user[data-platform="Google Search Console"]');
    const ga4El = document.querySelector('.connect-user[data-platform="GA4"]');
    if (gscEl) gscEl.innerHTML = status.gsc ? `<span class="connected-badge">● Connected</span> ${status.gsc.email}` : '<span class="muted">Not connected</span>';
    if (ga4El) ga4El.innerHTML = status.ga4 ? `<span class="connected-badge">● Connected</span> ${status.ga4.email}` : '<span class="muted">Not connected</span>';
  } catch (err) {
    console.error('refreshGoogleStatus', err);
  }
}

document.getElementById('connectGSC')?.addEventListener('click', () => startGoogleConnection('gsc'));
document.getElementById('connectGA4')?.addEventListener('click', () => startGoogleConnection('ga4'));

refreshGoogleStatus();

// Google report panel on report page
const gscClicksEl = document.getElementById('gscClicks');
const gscImpressionsEl = document.getElementById('gscImpressions');
const gscCtrEl = document.getElementById('gscCtr');
const ga4ActiveUsersEl = document.getElementById('ga4ActiveUsers');
const ga4NewUsersEl = document.getElementById('ga4NewUsers');
const ga4SessionsEl = document.getElementById('ga4Sessions');
const googleTrendChart = document.getElementById('googleTrendChart');
const googleChartHint = document.getElementById('googleChartHint');
const googleTabBar = document.getElementById('googleTabBar');
let gscRowsCache = [];
let gscCurrentMetric = 'clicks';

function drawGoogleTrendChart(metric, points) {
  if (!googleTrendChart) return;
  const ctx = googleTrendChart.getContext('2d');
  ctx.clearRect(0, 0, googleTrendChart.width, googleTrendChart.height);
  if (!points.length) {
    googleChartHint && (googleChartHint.textContent = 'No time series data available');
    return;
  }
  const values = points.map((p) => Number(p.value || 0));
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const padding = 32;
  const width = googleTrendChart.width - padding * 2;
  const height = googleTrendChart.height - padding * 2;

  ctx.beginPath();
  points.forEach((p, idx) => {
    const x = padding + (idx / (points.length - 1 || 1)) * width;
    const y = padding + height - ((Number(p.value || 0) - min) / (max - min || 1)) * height;
    if (idx === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.strokeStyle = '#6a8bff';
  ctx.lineWidth = 2.5;
  ctx.stroke();

  ctx.lineTo(padding + width, padding + height);
  ctx.lineTo(padding, padding + height);
  ctx.closePath();
  ctx.fillStyle = 'rgba(106, 139, 255, 0.18)';
  ctx.fill();

  points.forEach((p, idx) => {
    const x = padding + (idx / (points.length - 1 || 1)) * width;
    const y = padding + height - ((Number(p.value || 0) - min) / (max - min || 1)) * height;
    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = '#ffffff';
    ctx.fill();
    ctx.strokeStyle = '#6a8bff';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  });

  googleChartHint && (googleChartHint.textContent = `${metric.toUpperCase()} over last ${points.length} days`);
}

googleTabBar?.addEventListener('click', (e) => {
  const button = e.target.closest('button[data-metric]');
  if (!button) return;
  googleTabBar.querySelectorAll('button').forEach((btn) => btn.classList.remove('active'));
  button.classList.add('active');
  gscCurrentMetric = button.dataset.metric;
  if (gscRowsCache.length) {
    drawGoogleTrendChart(gscCurrentMetric, gscRowsCache.map((row) => ({ date: row.keys?.[0] || '-', value: Number(row[gscCurrentMetric] || 0) })));
  }
});
const googleDashboard = document.getElementById('googleDashboard');
const gscStatusEl = document.getElementById('gscStatus');
const ga4StatusEl = document.getElementById('ga4Status');
const gscSummaryEl = document.getElementById('gscSummary');
const ga4SummaryEl = document.getElementById('ga4Summary');
const gscSitesList = document.getElementById('gscSitesList');
const ga4PropertiesList = document.getElementById('ga4PropertiesList');

function isoDate(daysAgo = 0) {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysAgo);
  return d.toISOString().slice(0, 10);
}

async function fetchJson(url, opts) {
  const res = await fetch(url, opts);
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json();
}

async function loadGoogleReport() {
  if (!googleDashboard) return;
  googleDashboard.style.display = 'none';

  try {
    const status = await fetchJson('/api/google/status');
    const gscConnected = status.gsc && status.gsc.connected;
    const ga4Connected = status.ga4 && status.ga4.connected;

    gscStatusEl.textContent = gscConnected ? `Connected (${status.gsc.email || 'unknown'})` : 'Not connected';
    ga4StatusEl.textContent = ga4Connected ? `Connected (${status.ga4.email || 'unknown'})` : 'Not connected';

    if (!gscConnected) {
      gscSummaryEl && (gscSummaryEl.textContent = 'Please connect Search Console via Connect page first.');
      gscSitesList && (gscSitesList.innerHTML = '');
      gscClicksEl && (gscClicksEl.textContent = '—');
      gscImpressionsEl && (gscImpressionsEl.textContent = '—');
      gscCtrEl && (gscCtrEl.textContent = '—');
      gscRowsCache = [];
      drawGoogleTrendChart('clicks', []);
    } else {
      const sites = await fetchJson('/api/google/gsc/sites');
      const entries = (sites.sites || []);
      gscSitesList.innerHTML = entries.length
        ? entries.slice(0, 5).map((s) => `<div>${s.siteUrl} (${s.permissionLevel || '—'})</div>`).join('')
        : '<div>No verified sites found</div>';

      if (entries.length) {
        const siteUrl = entries[0].siteUrl;
        const gscData = await fetchJson('/api/google/gsc/query', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ siteUrl, startDate: isoDate(30), endDate: isoDate(0), dimensions: ['date'], metrics: ['clicks', 'impressions', 'ctr'] }),
        });

        const rows = gscData.rows || [];
        gscRowsCache = rows;

        const totalClicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
        const totalImpressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
        const averageCtr = totalImpressions ? (totalClicks / totalImpressions) * 100 : 0;

        gscSummaryEl && (gscSummaryEl.innerHTML = `<strong>${siteUrl} (30d):</strong> ${totalClicks} clicks, ${totalImpressions} impressions, CTR ${averageCtr.toFixed(2)}%`);
        gscClicksEl && (gscClicksEl.textContent = String(totalClicks));
        gscImpressionsEl && (gscImpressionsEl.textContent = String(totalImpressions));
        gscCtrEl && (gscCtrEl.textContent = `${averageCtr.toFixed(2)}%`);

        drawGoogleTrendChart(gscCurrentMetric, rows.map((row) => ({ date: row.keys?.[0] || '-', value: Number(row[gscCurrentMetric] || 0) })));
      }
    }

    if (!ga4Connected) {
      ga4SummaryEl && (ga4SummaryEl.textContent = 'Please connect GA4 via Connect page first.');
      ga4PropertiesList && (ga4PropertiesList.innerHTML = '');
      ga4ActiveUsersEl && (ga4ActiveUsersEl.textContent = '—');
      ga4NewUsersEl && (ga4NewUsersEl.textContent = '—');
      ga4SessionsEl && (ga4SessionsEl.textContent = '—');
    } else {
      const properties = await fetchJson('/api/google/ga4/properties');
      const props = (properties.properties || []);
      ga4PropertiesList && (ga4PropertiesList.innerHTML = props.length
        ? props.slice(0, 5).map((p) => `<div>${p.displayName || p.name}</div>`).join('')
        : '<div>No GA4 properties found</div>');

      if (props.length) {
        const propertyId = (props[0].name || '').split('/').pop();
        const report = await fetchJson('/api/google/ga4/report', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ propertyId, startDate: isoDate(30), endDate: isoDate(0), dimensions: ['date'], metrics: ['activeUsers', 'newUsers', 'sessions'] }),
        });

        const rows = report.rows || [];
        const totals = rows.reduce((acc, row) => {
          const [active, neu, sess] = row.metricValues.map((m) => Number(m.value || 0));
          return {
            activeUsers: acc.activeUsers + active,
            newUsers: acc.newUsers + neu,
            sessions: acc.sessions + sess,
          };
        }, { activeUsers: 0, newUsers: 0, sessions: 0 });

        ga4SummaryEl && (ga4SummaryEl.innerHTML = `<strong>${propertyId} (30d):</strong> ${totals.activeUsers} active users, ${totals.newUsers} new users, ${totals.sessions} sessions`);
        ga4ActiveUsersEl && (ga4ActiveUsersEl.textContent = String(totals.activeUsers));
        ga4NewUsersEl && (ga4NewUsersEl.textContent = String(totals.newUsers));
        ga4SessionsEl && (ga4SessionsEl.textContent = String(totals.sessions));
      }
    }

    googleDashboard && (googleDashboard.style.display = 'block');
  } catch (err) {
    console.error('loadGoogleReport error', err);
    gscSummaryEl.textContent = 'Unable to load Google Search Console metrics';
    ga4SummaryEl.textContent = 'Unable to load GA4 metrics';
    googleDashboard.style.display = 'block';
  }
}

document.getElementById('refreshGsc')?.addEventListener('click', loadGoogleReport);
document.getElementById('refreshGa4')?.addEventListener('click', loadGoogleReport);
if (location.pathname.endsWith('/report.html')) {
  loadGoogleReport();
}

// Upload handling (upload page)
const uploadInput = document.getElementById('uploadInput');
const uploadLabel = document.getElementById('uploadLabel');
const uploadForm = document.getElementById('uploadForm');
const dropzone = document.getElementById('dropzone');
const browseBtn = document.getElementById('browseBtn');
const clearBtn = document.getElementById('clearBtn');
const fileHint = document.getElementById('fileHint');

uploadInput?.addEventListener('change', () => {
  const file = uploadInput.files?.[0];
  const text = file ? `${file.name} (${Math.round(file.size / 1024)} KB)` : 'Drop a CSV here or click Browse';
  uploadLabel.textContent = text;
  clearBtn && (clearBtn.style.display = file ? 'inline-flex' : 'none');
  fileHint && (fileHint.textContent = file ? 'Ready to upload' : '');
});

uploadForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const file = uploadInput.files?.[0];
  if (!file) return alert('Pick a CSV first');
  const csv = await file.text();
  const response = await fetch('/api/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ filename: file.name, csv }),
  });
  const payload = await parseUploadResponse(response);
  writeScopedString('lastUploadName', file.name);
  trackClientActivity({
    eventType: 'upload_analytics',
    eventLabel: 'Uploaded analytics file',
    eventDetail: file.name,
    pageName: 'Upload',
    pageCategory: 'Publishing',
    eventMeta: { files: 1 }
  });
  alert(buildUploadAlertMessage(payload));
  uploadInput.value = '';
  uploadLabel.textContent = 'Drop a CSV here or click Browse';
  clearBtn && (clearBtn.style.display = 'none');
  fileHint && (fileHint.textContent = '');
  await loadPosts();
  await loadMetrics();
});

browseBtn?.addEventListener('click', () => uploadInput?.click());

clearBtn?.addEventListener('click', () => {
  uploadInput.value = '';
  uploadLabel.textContent = 'Drop a CSV here or click Browse';
  clearBtn.style.display = 'none';
  fileHint.textContent = '';
});

['dragenter', 'dragover'].forEach((ev) =>
  dropzone?.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  dropzone?.addEventListener(ev, (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
  })
);
dropzone?.addEventListener('drop', (e) => {
  const file = e.dataTransfer.files?.[0];
  if (!file) return;
  uploadInput.files = e.dataTransfer.files;
  uploadLabel.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
  clearBtn && (clearBtn.style.display = 'inline-flex');
  fileHint && (fileHint.textContent = 'Ready to upload');
});

// Chart tabs behaviour (dashboard)
const btnRow = document.getElementById('btnRow');
const legend = document.getElementById('legend');
const chartTitle = document.getElementById('chartTitle');
const metricChart = document.getElementById('metricChart');
const isDashboardPage = window.location.pathname.endsWith('/dashboard-overview.html') || window.location.pathname.endsWith('dashboard-overview.html');
let chartInstance = null;
const chartSeriesConfig = [
  { key: 'reach', label: 'Reach' },
  { key: 'interactions', label: 'Interactions' },
  { key: 'clicks', label: 'Clicks' },
  { key: 'reactions', label: 'Reactions' },
  { key: 'views', label: 'Views' },
  { key: 'follows', label: 'Follows' },
  { key: 'engagementRate', label: 'Engagement Rate' }
];
let visibleChartSeries = new Set(['reach', 'interactions', 'clicks', 'reactions', 'views', 'follows', 'engagementRate']);
const PALETTE = [
  '#7cc6ff','#6fe3b2','#ffb86b','#f58ac8','#c5a3ff','#ffe27a'
];

if (isDashboardPage && btnRow && legend && chartTitle && metricChart) {
  buildButtons();
  renderChart();
}

function formatCompactNumber(value) {
  const num = Number(value || 0);
  if (Math.abs(num) >= 1000) {
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(num);
  }
  return String(Math.round(num * 100) / 100);
}

function buildButtons() {
  if (!btnRow) return;
  btnRow.innerHTML = '';
  chartSeriesConfig.forEach((series, i) => {
    const color = PALETTE[i % PALETTE.length];
    const btn = document.createElement('button');
    btn.className = 'metric-btn' + (visibleChartSeries.has(series.key) ? ' active' : '');
    btn.innerHTML = `<span class="dot" style="background:${color}"></span>${series.label}`;
    if (visibleChartSeries.has(series.key)) btn.style.borderColor = color + '60';
    btn.onclick = () => {
      if (visibleChartSeries.has(series.key)) {
        if (visibleChartSeries.size > 1) visibleChartSeries.delete(series.key);
      } else {
        visibleChartSeries.add(series.key);
      }
      buildButtons();
      renderChart();
    };
    btnRow.appendChild(btn);
  });
}

function buildLegend() {
  if (!legend) return;
  legend.innerHTML = '';
  chartSeriesConfig.filter(series => visibleChartSeries.has(series.key)).forEach(series => {
    const i = chartSeriesConfig.indexOf(series);
    const color = PALETTE[i % PALETTE.length];
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.innerHTML = `<span class="legend-swatch" style="background:${color}"></span>${series.label}`;
    legend.appendChild(item);
  });
}

function getDashboardChartTooltip() {
  const parent = metricChart?.parentElement;
  if (!parent) return null;
  let tooltipEl = parent.querySelector('.chart-tooltip');
  if (!tooltipEl) {
    tooltipEl = document.createElement('div');
    tooltipEl.className = 'chart-tooltip';
    parent.appendChild(tooltipEl);
  }
  return tooltipEl;
}

function renderDashboardChartTooltip(context) {
  const { chart, tooltip } = context;
  const tooltipEl = getDashboardChartTooltip();
  const parent = chart.canvas.parentNode;
  if (!tooltipEl || !parent) return;

  if (!tooltip || tooltip.opacity === 0) {
    tooltipEl.classList.remove('show', 'bottom');
    return;
  }

  const title = (tooltip.title || [])[0] || '';
  const point = (tooltip.dataPoints || [])[0];
  const bodyRows = point ? [point].map((item) => {
    const color = item.dataset.borderColor || '#fff';
    const label = item.dataset.label || '';
    const value = Number(item.parsed?.y || 0).toLocaleString();
    return `<div class="metric-row"><span class="metric-name"><span class="metric-dot" style="background:${color}"></span>${label}</span><span class="metric-number">${value}</span></div>`;
  }).join('') : '';

  tooltipEl.innerHTML = `<div class="label">${title}</div><div class="meta">${bodyRows}</div>`;

  const parentRect = parent.getBoundingClientRect();
  const tooltipWidth = Math.max(tooltipEl.offsetWidth || 160, 160);
  const tooltipHeight = Math.max(tooltipEl.offsetHeight || 80, 80);
  const pointX = point?.element?.x ?? tooltip.caretX;
  const pointY = point?.element?.y ?? tooltip.caretY;
  const rightSpace = parentRect.width - pointX - 12;
  const left = rightSpace >= tooltipWidth ? pointX + 12 : Math.max(12, pointX - tooltipWidth - 12);
  const top = Math.max(12, Math.min(pointY - tooltipHeight / 2, parentRect.height - tooltipHeight - 12));

  tooltipEl.style.transform = 'none';
  tooltipEl.style.left = `${left}px`;
  tooltipEl.style.top = `${top}px`;
  tooltipEl.classList.add('show');
}

function renderChart() {
  if (!isDashboardPage) return;
  if (!btnRow || !legend || !chartTitle || !metricChart) {
    return;
  }
  if (typeof Chart === 'undefined') {
    console.error('Chart.js not loaded');
    chartTitle.textContent = 'Chart library not available';
    return;
  }

  buildLegend();

  const dailyData = buildDailyChartData();
  if (!dailyData?.days?.length) {
    if (chartInstance) chartInstance.destroy();
    chartTitle.textContent = 'No data available';
    return;
  }

  const labels = dailyData.days.map((_, i) => `Day ${i + 1}`);
  const datasets = chartSeriesConfig.filter(series => visibleChartSeries.has(series.key)).map(series => {
    const i = chartSeriesConfig.indexOf(series);
    const color = PALETTE[i % PALETTE.length];
    return {
      label: series.label,
      data: dailyData.days.map(day => Number(day.totals[series.key] || 0)),
      borderColor: color,
      backgroundColor: color + '12',
      fill: false,
      tension: 0.38,
      pointRadius: 0,
      pointHoverRadius: 0,
      pointHitRadius: 10,
      pointBackgroundColor: color,
      hoverBorderWidth: 0,
      borderWidth: 2,
      spanGaps: true,
    };
  });

  if (chartInstance) chartInstance.destroy();

  chartInstance = new Chart(metricChart, {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      hover: { mode: 'nearest', intersect: true },
      interaction: { mode: 'nearest', intersect: true },
      animations: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          enabled: false,
          external: renderDashboardChartTooltip,
          callbacks: {
            label: ctx => `${ctx.dataset.label}: ${Math.round(ctx.parsed.y).toLocaleString()}`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          border: { display: false },
          ticks: {
            color: '#7a7a8c',
            font: { family: 'DM Mono', size: 10 },
            maxTicksLimit: 10,
            maxRotation: 0,
          }
        },
        y: {
          grid: { color: 'rgba(255,255,255,0.04)', drawBorder: false },
          border: { display: false },
          ticks: {
            color: '#7a7a8c',
            font: { family: 'DM Mono', size: 10 },
            callback: v => v >= 1000 ? (v / 1000).toFixed(1) + 'k' : v,
          },
          beginAtZero: true,
        }
      }
    }
  });

  chartTitle.textContent = `${dailyData.title} • ${visibleChartSeries.size} metrics`;
}

function updateChartDisplay(metric) {
  renderChart();
}

function formatCompactNumber(value) {
  const num = Number(value || 0);
  if (Math.abs(num) >= 1000) {
    return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(num);
  }
  return String(Math.round(num * 100) / 100);
}



function shortenLabel(label, max = 16) {
  const text = String(label || '').trim();
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}

function formatChartDateLabel(dateValue) {
  if (!dateValue) return 'Date unavailable';
  const date = new Date(dateValue);
  if (Number.isNaN(date.getTime())) return 'Date unavailable';
  return date.toLocaleDateString(undefined, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
}

function getPostInteractionTotal(engagement = {}) {
  const explicitInteractions = Number(engagement.interactions || 0);
  if (explicitInteractions > 0) return explicitInteractions;
  return Number(engagement.comments || 0) + Number(engagement.likes || 0) + Number(engagement.shares || 0);
}

function getPostReactionTotal(engagement = {}) {
  const explicitReactions = Number(engagement.reactions || 0);
  if (explicitReactions > 0) return explicitReactions;
  return Number(engagement.likes || 0);
}

function getMetricValueForPost(post, metricKey) {
  const engagement = post?.engagement || {};
  if (metricKey === 'interactions') {
    return getPostInteractionTotal(engagement);
  }
  if (metricKey === 'reactions') {
    return getPostReactionTotal(engagement);
  }
  if (metricKey === 'engagementRate') {
    const interactions = getPostInteractionTotal(engagement);
    const base = engagement.reach || 0;
    return base ? Number(((interactions / base) * 100).toFixed(2)) : 0;
  }
  return engagement[metricKey] || 0;
}



function getLatestChartDate() {
  const validTimes = lastPostsCache.map((post) => Number(post.postedAt || 0)).filter((value) => Number.isFinite(value) && value > 0);
  if (!validTimes.length) return null;
  return new Date(Math.max(...validTimes));
}

function buildDailyChartData() {
  if (!lastPostsCache.length) return null;
  const latestDate = getLatestChartDate();
  if (!latestDate) return null;

  const targetMonth = latestDate.getMonth();
  const targetYear = latestDate.getFullYear();
  const daysInMonth = new Date(targetYear, targetMonth + 1, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, index) => ({
    day: index + 1,
    date: new Date(targetYear, targetMonth, index + 1),
    totals: Object.fromEntries(chartSeriesConfig.map((series) => [series.key, 0])),
    labels: new Set(),
    platforms: new Set(),
  }));

  lastPostsCache.forEach((post, index) => {
    const date = post.postedAt ? new Date(post.postedAt) : null;
    if (!date || Number.isNaN(date.getTime())) return;
    if (date.getMonth() !== targetMonth || date.getFullYear() !== targetYear) return;

    const bucket = days[date.getDate() - 1];
    if (!bucket) return;
    bucket.totals.reach += Number(getMetricValueForPost(post, 'reach') || 0);
    bucket.totals.interactions += Number(getMetricValueForPost(post, 'interactions') || 0);
    bucket.totals.clicks += Number(getMetricValueForPost(post, 'clicks') || 0);
    bucket.totals.reactions += Number(getMetricValueForPost(post, 'reactions') || 0);
    bucket.totals.views += Number(getMetricValueForPost(post, 'views') || 0);
    bucket.totals.follows += Number(getMetricValueForPost(post, 'follows') || 0);
    bucket.labels.add(post.title || `Entry ${index + 1}`);
    bucket.platforms.add(post.platform || 'Unknown');
  });

  return {
    title: latestDate.toLocaleString(undefined, { month: 'long', year: 'numeric' }),
    days: days.map((entry) => ({
      ...entry,
      dateLabel: formatChartDateLabel(entry.date),
      summaryLabel: entry.labels.size ? Array.from(entry.labels).slice(0, 2).join(', ') : 'No uploaded entries',
      platformLabel: entry.platforms.size ? Array.from(entry.platforms).join(', ') : 'No platform data',
    })),
  };
}

function buildReportChartSnapshot() {
  const dailyData = buildDailyChartData();
  if (!dailyData?.days?.length) return null;

  return {
    title: dailyData.title,
    days: dailyData.days.map((day) => ({
      day: day.day,
      dateLabel: day.dateLabel,
      summaryLabel: day.summaryLabel,
      platformLabel: day.platformLabel,
      totals: {
        reach: Number(day.totals?.reach || 0),
        interactions: Number(day.totals?.interactions || 0),
        clicks: Number(day.totals?.clicks || 0),
        reactions: Number(day.totals?.reactions || 0),
        views: Number(day.totals?.views || 0),
        follows: Number(day.totals?.follows || 0),
      },
    })),
  };
}

const reportChartMetricColors = {
  'Reach / Impressions': '#6bbcff',
  Reach: '#6bbcff',
  Impressions: '#6bbcff',
  Interactions: '#6fe3b2',
  Clicks: '#f58ac8',
  Reactions: '#ff6b6b',
  Views: '#00d9ff',
  Follows: '#ffe27a',
  Followers: '#ffe27a',
  Visits: '#c5a3ff',
  Viewers: '#7cc6ff',
  Unique: '#7c5dfa',
  Comments: '#ffb86b',
  Reports: '#9aa3ff',
  Engagement: '#6fe3b2',
  'Avg. Engagement': '#7c5dfa',
  'Avg Engagement': '#7c5dfa',
};

function buildPlatformReportChartSnapshot(metricsData = {}, platform = 'Instagram') {
  const dashboard = metricsData.platformDashboards?.[platform];
  const rows = [...(dashboard?.rows || []), ...(dashboard?.metricoolRows || [])];
  const definitions = reportMetricDefinitions[platform] || reportMetricDefinitions.Instagram;
  const timeline = buildReportMonthlyTimeline(rows);
  const title = getReportTimelineTitle(rows, platform);

  return {
    title,
    platform,
    days: timeline.map((entry) => ({
      day: entry.day,
      dateLabel: `Day ${entry.day}`,
      summaryLabel: 'Uploaded CSV metrics',
      platformLabel: platform,
      metrics: entry.metrics,
      totals: {
        reach: reportMetricValue(entry.metrics, ['reach', 'impressions', 'reach / impressions']),
        interactions: reportMetricValue(entry.metrics, ['interactions', 'engagement']),
        clicks: reportMetricValue(entry.metrics, ['clicks', 'link clicks']),
        reactions: reportMetricValue(entry.metrics, ['reactions', 'likes']),
        views: reportMetricValue(entry.metrics, ['views']),
        follows: reportMetricValue(entry.metrics, ['follows', 'followers']),
      },
    })),
    series: definitions.map((metric, index) => ({
      name: metric.label,
      color: reportChartMetricColors[metric.label] || ['#6bbcff', '#6fe3b2', '#f58ac8', '#ffb86b'][index % 4],
      values: timeline.map((entry) => (
        typeof metric.formula === 'function'
          ? metric.formula(entry.metrics)
          : reportMetricValue(entry.metrics, metric.aliases || [metric.label])
      )),
      labels: timeline.map((entry) => `Day ${entry.day}`),
    })),
  };
}

function buildReportMonthlyTimeline(rows = []) {
  const dayMap = new Map();
  const sourceRows = rows.length ? rows : [{ metrics: {} }];

  sourceRows.forEach((row, index) => {
    const day = getReportDayNumber(row.date, index);
    if (!dayMap.has(day)) dayMap.set(day, { day, metrics: {} });
    const entry = dayMap.get(day);
    Object.entries(row.metrics || {}).forEach(([label, value]) => {
      entry.metrics[label] = (entry.metrics[label] || 0) + Number(value || 0);
    });
  });

  const timelineLength = getReportTimelineLength(sourceRows);
  return Array.from({ length: timelineLength }, (_, index) => {
    const day = index + 1;
    return dayMap.get(day) || { day, metrics: {} };
  });
}

function getReportTimelineLength(rows = []) {
  const datedRows = rows
    .map((row) => new Date(String(row.date || '').trim()))
    .filter((date) => !Number.isNaN(date.getTime()));

  if (!datedRows.length) return 31;

  const first = datedRows[0];
  const sameMonth = datedRows.every((date) => date.getFullYear() === first.getFullYear() && date.getMonth() === first.getMonth());
  if (!sameMonth) return 31;

  return new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
}

function getReportTimelineTitle(rows = [], platform = 'Platform') {
  const firstDate = rows
    .map((row) => new Date(String(row.date || '').trim()))
    .find((date) => !Number.isNaN(date.getTime()));

  return firstDate
    ? `${platform} ${firstDate.toLocaleString(undefined, { month: 'long', year: 'numeric' })}`
    : `${platform} Monthly Performance`;
}

function getReportDayNumber(value, index) {
  const text = String(value || '').trim();
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return clampReportDay(parsed.getDate());
  const matched = text.match(/\b([1-9]|[12][0-9]|3[01])\b/);
  if (matched) return clampReportDay(Number(matched[1]));
  return clampReportDay(index + 1);
}

function clampReportDay(value) {
  return Math.min(31, Math.max(1, Number(value) || 1));
}





















function updatePeriodLabel() {
  if (!periodLabel) return;
  if (!lastPostsCache.length) {
    periodLabel.textContent = 'Awaiting upload';
    return;
  }
  const latest = Math.max(...lastPostsCache.map((p) => p.postedAt || 0));
  if (!latest || Number.isNaN(latest)) {
    periodLabel.textContent = 'Latest upload';
    return;
  }
  const dt = new Date(latest);
  periodLabel.textContent = dt.toLocaleString(undefined, { month: 'long', year: 'numeric' });
}

function updateProfile() {
  if (!profileName || !profileHandle) return;
  if (!lastPostsCache.length) {
    profileName.textContent = 'Instagram';
    profileHandle.textContent = '@instagram';
    return;
  }
  const top = lastPostsCache[0];
  profileName.textContent = top.platform || 'Platform';
  profileHandle.textContent = `@${(top.platform || 'platform').toLowerCase()}`;
}

// Feedback form
const feedbackCard = document.querySelector('.feedback-card');
const feedbackTabs = document.querySelectorAll('.feedback-card .chip');
const feedbackText = document.getElementById('feedbackText');
const feedbackSubmit = document.getElementById('feedbackSubmit');
const feedbackList = document.getElementById('feedbackList');
const feedbackStatus = document.getElementById('feedbackStatus');
const feedbackToggle = document.getElementById('feedbackToggle');
const feedbackTitle = document.querySelector('.feedback-title');
let feedbackType = 'Suggestion';

function updateFeedbackComposerState() {
  if (!feedbackText || !feedbackSubmit) return;
  const isAiMode = feedbackType === 'Suggestions';
  feedbackText.placeholder = isAiMode
    ? 'Click submit to read your uploaded analytics and generate suggestions.'
    : 'Write your suggestion here...';
  feedbackText.disabled = isAiMode;
  feedbackSubmit.textContent = isAiMode ? 'Generate Suggestions' : 'Submit';
}

feedbackTabs.forEach((chip) => {
  chip.addEventListener('click', () => {
    feedbackTabs.forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
    feedbackType = chip.dataset.type;
    updateFeedbackComposerState();
  });
});

function renderFeedback() {
  if (!feedbackList || !feedbackStatus) return;
  const items = readScopedJson('feedback', []);
  feedbackList.innerHTML = '';
  if (!items.length) {
    feedbackStatus.textContent = 'No feedback yet. Share your suggestions to help improve the dashboard.';
    return;
  }
  feedbackStatus.textContent = `${items.length} item(s) submitted`;
  items.forEach((item, idx) => {
    const li = document.createElement('li');
    li.innerHTML = `<div><div class="meta">${item.type} • ${new Date(item.time).toLocaleString()}</div><div class="text">${item.text}</div></div><button class="delete-btn" data-idx="${idx}">Delete</button>`;
    feedbackList.appendChild(li);
  });
  feedbackList.querySelectorAll('.delete-btn').forEach((btn) => {
    btn.addEventListener('click', () => {
      const index = Number(btn.dataset.idx);
      const current = readScopedJson('feedback', []);
      current.splice(index, 1);
      writeScopedJson('feedback', current);
      renderFeedback();
    });
  });
}

function buildBrowserAiSuggestions() {
  const metricEls = document.querySelectorAll('.metric-card .metric-value');
  const readMetric = (index) => {
    const raw = metricEls[index]?.textContent || '0';
    return Number(String(raw).replace(/[%,$]/g, '').replace(/,/g, '').trim()) || 0;
  };

  const totals = {
    reach: readMetric(0),
    interactions: readMetric(1),
    clicks: readMetric(2),
    reactions: readMetric(3),
    views: readMetric(4),
    follows: readMetric(5),
    engagementRate: readMetric(6),
  };

  const topPlatformEntry =
    Object.entries(perPlatformMetrics || {}).sort((a, b) => {
      const scoreA = Number(a[1]?.interactions || 0) + Number(a[1]?.clicks || 0) + Number(a[1]?.follows || 0);
      const scoreB = Number(b[1]?.interactions || 0) + Number(b[1]?.clicks || 0) + Number(b[1]?.follows || 0);
      return scoreB - scoreA;
    })[0] || [];

  const [topPlatform] = topPlatformEntry;
  const suggestions = [];

  if (topPlatform) {
    suggestions.push(`${topPlatform} is currently the strongest-performing platform. It would be advisable to replicate the content angle, creative structure, and posting approach that produced this result.`);
  } else {
    suggestions.push('Review the days with the strongest performance and convert those topics or formats into a repeatable content series.');
  }

  if (totals.reach > 0 && totals.interactions === 0) {
    suggestions.push('Reach is present, but interaction remains limited. Consider stronger opening hooks, clearer captions, and more explicit prompts for replies or shares.');
  } else if (totals.engagementRate < 2) {
    suggestions.push('The engagement rate remains modest. Priority should be given to content designed to generate conversation, saves, and shares rather than awareness alone.');
  } else {
    suggestions.push('Engagement is performing at a healthy level. It would be beneficial to identify the drivers behind the strongest days and repeat those creative patterns more intentionally.');
  }

  if (totals.clicks > 0) {
    suggestions.push('Clicks are already being generated. Refining the call to action and improving landing-page alignment should help convert more of that interest.');
  } else if (totals.follows > 0) {
    suggestions.push('Follower growth is visible, although clicks remain comparatively soft. Stronger profile and link prompts should help convert attention into traffic.');
  } else {
    suggestions.push('Traffic and follower movement are both limited. A focused conversion campaign with one offer and one clear call to action is recommended.');
  }

  return {
    summary: topPlatform
      ? `${topPlatform} appears to be the clearest near-term opportunity based on the currently loaded dashboard metrics.`
      : 'The current dashboard metrics indicate several practical opportunities for improvement.',
    takeaways: suggestions.slice(0, 3),
    actions: suggestions.slice(0, 3).map((item) => item.replace(/(Consider|Review|Use|Strengthen)/i, (match) => match)),
  };
}

function formatAiSuggestionText(payload = {}) {
  const summary = String(payload.summary || '').trim();
  const takeaways = Array.isArray(payload.takeaways)
    ? payload.takeaways.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const actions = Array.isArray(payload.actions)
    ? payload.actions.map((item) => String(item || '').trim()).filter(Boolean)
    : [];
  const suggestions = Array.isArray(payload.suggestions)
    ? payload.suggestions.map((item) => String(item || '').trim()).filter(Boolean)
    : [];

  const lines = ['Executive Summary', summary || 'No summary available.', ''];
  if (takeaways.length) {
    lines.push('Key Takeaways', ...takeaways.map((item, index) => `${index + 1}. ${item}`), '');
  }
  if (actions.length) {
    lines.push('Recommended Actions', ...actions.map((item, index) => `${index + 1}. ${item}`));
  } else if (suggestions.length) {
    lines.push('Recommended Actions', ...suggestions.map((item, index) => `${index + 1}. ${item}`));
  }
  return lines.join('\n');
}

function collectDashboardMetrics() {
  const cards = document.querySelectorAll('.metric-card');
  const metrics = {};
  cards.forEach((card) => {
    const label = card.querySelector('.metric-title')?.textContent?.trim();
    const value = card.querySelector('.metric-value')?.textContent?.trim();
    if (label && value) metrics[label] = value;
  });
  return metrics;
}

function hasUploadedAnalytics(metricsPayload = {}, recentPosts = [], uploadName = '') {
  const totalMetricValue = Object.values(metricsPayload || {}).reduce((sum, value) => {
    const parsed = Number(value || 0);
    return sum + (Number.isFinite(parsed) ? parsed : 0);
  }, 0);

  return Boolean(uploadName) && (totalMetricValue > 0 || recentPosts.length > 0);
}

feedbackSubmit?.addEventListener('click', async () => {
  if (feedbackType === 'Suggestions') {
    try {
      feedbackSubmit.disabled = true;
      feedbackSubmit.textContent = 'Generating...';
      const response = await fetch('/api/feedback/ai-suggestions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          metrics: collectDashboardMetrics(),
          context: 'Generate a professional metrics-driven feedback summary with clear next steps for the client.',
        }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Failed to generate suggestions');

      const generatedText = formatAiSuggestionText(payload);
      const items = readScopedJson('feedback', []);
      items.unshift({
        type: feedbackType,
        text: generatedText,
        time: Date.now(),
      });
      writeScopedJson('feedback', items);
      trackClientActivity({
        eventType: 'generate_ai_feedback',
        eventLabel: 'Generated suggestions',
        eventDetail: 'Dashboard suggestions created',
        pageName: 'Dashboard',
        pageCategory: 'Analytics'
      });
      renderFeedback();
    } catch (error) {
      const fallback = buildBrowserAiSuggestions();
      const generatedText = formatAiSuggestionText(fallback);
      const items = readScopedJson('feedback', []);
      items.unshift({
        type: `${feedbackType} (Local Fallback)`,
        text: generatedText,
        time: Date.now(),
      });
      writeScopedJson('feedback', items);
      trackClientActivity({
        eventType: 'generate_ai_feedback',
        eventLabel: 'Generated fallback suggestions',
        eventDetail: 'Dashboard fallback suggestions created',
        pageName: 'Dashboard',
        pageCategory: 'Analytics'
      });
      renderFeedback();
    } finally {
      feedbackSubmit.disabled = false;
      updateFeedbackComposerState();
    }
    return;
  }

  const text = feedbackText.value.trim();
  if (!text) return alert('Please write something first.');
  const items = readScopedJson('feedback', []);
  items.unshift({ type: feedbackType, text, time: Date.now() });
  writeScopedJson('feedback', items);
  trackClientActivity({
    eventType: 'edit_feedback',
    eventLabel: 'Submitted feedback',
    eventDetail: feedbackType,
    pageName: 'Dashboard',
    pageCategory: 'Analytics'
  });
  feedbackText.value = '';
  renderFeedback();
});

function toggleFeedbackPanel() {
  if (!feedbackCard || !feedbackToggle || !feedbackText) return;
  const collapsed = feedbackCard.classList.toggle('collapsed');
  feedbackToggle.textContent = collapsed ? '🛈 New' : '+ Cancel';
  if (collapsed) feedbackText.value = '';
}

feedbackToggle?.addEventListener('click', toggleFeedbackPanel);
feedbackTitle?.addEventListener('click', toggleFeedbackPanel);

updateFeedbackComposerState();
renderFeedback();

// Report modal (report page)
const aiModal = document.getElementById('aiModal');
const aiModalBackdrop = document.getElementById('aiModalBackdrop');
const aiModalClose = document.getElementById('aiModalClose');
const aiForm = document.getElementById('aiForm');
const aiStart = document.getElementById('aiStart');
const aiEnd = document.getElementById('aiEnd');
const aiPlatform = document.getElementById('aiPlatform');
const aiLogo = document.getElementById('aiLogo');
const aiLogoLabel = document.getElementById('aiLogoLabel');
const calendarToggle = document.getElementById('calendarToggle');
const calendarPrev = document.getElementById('calendarPrev');
const calendarNext = document.getElementById('calendarNext');
const calendarGrid = document.getElementById('calendarGrid');
const calendarMonthLabel = document.getElementById('calendarMonthLabel');
const calendarStartLabel = document.getElementById('calendarStartLabel');
const calendarEndLabel = document.getElementById('calendarEndLabel');
const calendarRangePicker = document.getElementById('calendarRangePicker');
const aiTriggers = document.querySelectorAll('.ai-trigger');
const aiCta = document.getElementById('aiCta');

let selectedStart = null;
let selectedEnd = null;
let calendarMonth = new Date();
let calendarOpen = false;

function detectPlatformFromFilename(filename = '') {
  const value = String(filename || '').toLowerCase();
  if (!value) return '';
  if (value.includes('instagram') || value.includes('insta') || value.includes('ig_') || value.startsWith('ig')) return 'Instagram';
  if (value.includes('facebook') || value.includes('meta') || value.includes('fb_') || value.startsWith('fb')) return 'Facebook';
  if (value.includes('linkedin') || value.includes('link_') || value.startsWith('linkedin')) return 'LinkedIn';
  if (value.includes('tiktok') || value.includes('tik tok')) return 'TikTok';
  return '';
}

async function syncAiPlatformFromLatestUpload() {
  if (!aiPlatform) return;

  let detectedPlatform = detectPlatformFromFilename(readScopedString('lastUploadName') || '');

  if (!detectedPlatform) {
    try {
      const response = await fetch('/api/metrics');
      if (response.ok) {
        const data = await response.json();
        detectedPlatform = detectPlatformFromFilename(data.lastUploadName || '');
      }
    } catch (error) {
      console.warn('Unable to detect platform from latest upload name', error);
    }
  }

  if (detectedPlatform) {
    aiPlatform.value = detectedPlatform;
  }
}

function normalizeDate(date) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function formatCalendarLabel(date) {
  return date.toLocaleDateString(undefined, { month: 'short', day: '2-digit', year: 'numeric' });
}

function setCalendarVisibility(open) {
  if (!calendarRangePicker || !calendarToggle) return;
  calendarOpen = open;
  calendarRangePicker.classList.toggle('closed', !calendarOpen);
  calendarToggle.textContent = calendarOpen ? 'Hide calendar' : 'Open calendar';
}

function toggleCalendar() {
  setCalendarVisibility(!calendarOpen);
}

function updateCalendarLabels() {
  if (calendarStartLabel) {
    calendarStartLabel.textContent = selectedStart ? `Start: ${formatCalendarLabel(selectedStart)}` : 'Start: —';
  }
  if (calendarEndLabel) {
    calendarEndLabel.textContent = selectedEnd ? `End: ${formatCalendarLabel(selectedEnd)}` : 'End: —';
  }
  if (aiStart && selectedStart) {
    aiStart.value = selectedStart.toISOString().slice(0, 10);
  }
  if (aiEnd && selectedEnd) {
    aiEnd.value = selectedEnd.toISOString().slice(0, 10);
  }
}

function renderCalendar() {
  if (!calendarGrid || !calendarMonthLabel) return;

  calendarMonthLabel.textContent = calendarMonth.toLocaleString(undefined, { month: 'long', year: 'numeric' });
  calendarGrid.innerHTML = '';

  const monthStart = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), 1);
  const monthEnd = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 0);
  const weekdayOffset = monthStart.getDay();
  const minDate = new Date('2025-01-01');
  const maxDate = new Date(new Date().getFullYear(), 11, 31);

  for (let empty = 0; empty < weekdayOffset; empty += 1) {
    const spacer = document.createElement('div');
    spacer.className = 'calendar-empty';
    calendarGrid.appendChild(spacer);
  }

  for (let day = 1; day <= monthEnd.getDate(); day += 1) {
    const date = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth(), day);
    const normalized = normalizeDate(date);
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(day);
    const isDisabled = normalized < minDate || normalized > maxDate;
    if (isDisabled) {
      button.className = 'disabled';
      button.disabled = true;
    }

    const rangeStart = selectedStart ? normalizeDate(selectedStart) : null;
    const rangeEnd = selectedEnd ? normalizeDate(selectedEnd) : null;
    const inRange = rangeStart && rangeEnd && normalized >= rangeStart && normalized <= rangeEnd;
    const isSelectedStart = rangeStart && normalized.getTime() === rangeStart.getTime();
    const isSelectedEnd = rangeEnd && normalized.getTime() === rangeEnd.getTime();

    if (inRange) button.classList.add('in-range');
    if (isSelectedStart || isSelectedEnd) button.classList.add('selected');

    button.addEventListener('click', () => selectCalendarDate(normalized));
    calendarGrid.appendChild(button);
  }
}

function selectCalendarDate(date) {
  if (!selectedStart || (selectedStart && selectedEnd)) {
    selectedStart = date;
    selectedEnd = null;
  } else if (date < selectedStart) {
    selectedEnd = selectedStart;
    selectedStart = date;
  } else {
    selectedEnd = date;
  }

  if (selectedStart && selectedEnd && selectedEnd < selectedStart) {
    [selectedStart, selectedEnd] = [selectedEnd, selectedStart];
  }

  calendarMonth = new Date(selectedStart.getFullYear(), selectedStart.getMonth(), 1);
  updateCalendarLabels();
  renderCalendar();
}

function moveCalendar(monthDelta) {
  calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + monthDelta, 1);
  renderCalendar();
}

function setDateBounds() {
  if (!aiStart || !aiEnd) return;
  const minDate = '2025-01-01';
  const currentYear = new Date().getFullYear();
  const maxDate = `${currentYear}-12-31`;
  aiStart.min = minDate;
  aiEnd.min = minDate;
  aiStart.max = maxDate;
  aiEnd.max = maxDate;

  if (!selectedStart && !selectedEnd) {
    selectedStart = null;
    selectedEnd = null;
    calendarMonth = new Date();
  }

  updateCalendarLabels();
  renderCalendar();
}

function showDetail(report) {
  const reportDetail = document.getElementById('reportDetail');
  const detailTitle = document.getElementById('detailTitle');
  const detailDates = document.getElementById('detailDates');
  const detailSummary = document.getElementById('detailSummary');
  const detailPlatform = document.getElementById('detailPlatform');
  const detailMetrics = document.getElementById('detailMetrics');
  const detailTakeaways = document.getElementById('detailTakeaways');
  const detailActions = document.getElementById('detailActions');
  const clientLogoSpot = document.getElementById('reportClientLogoSpot');
  const elevateLogoSpot = document.getElementById('reportElevateLogoSpot');
  const pdfClientLogoSpot = document.getElementById('pdfClientLogoSpot');
  const pdfElevateLogoSpot = document.getElementById('pdfElevateLogoSpot');
  const pdfClientLogoSpot2 = document.getElementById('pdfClientLogoSpot2');
  const pdfElevateLogoSpot2 = document.getElementById('pdfElevateLogoSpot2');

  if (reportDetail) {
    reportDetail.dataset.id = report.id || '';
    detailTitle && (detailTitle.textContent = report.title || 'Report');
    detailDates && (detailDates.textContent = `${formatDisplayDate(report.start)} — ${formatDisplayDate(report.end)}`);
      detailPlatform && (detailPlatform.textContent = report.platform || 'Platform');
      detailMetrics && (detailMetrics.innerHTML = '');
      const peakReachEl = document.getElementById('peakReach');
      const peakTimeEl = document.getElementById('peakTime');
      peakReachEl && (peakReachEl.textContent = formatReportValue(report.metrics?.find((m) => m.label === 'Reach')?.value || report.peakReach || 0));
      peakTimeEl && (peakTimeEl.textContent = report.peakTime || '18:45');

    const metricColor = {
      'Reach': 'cyan',
      'Reach / Impressions': 'cyan',
      'Impressions': 'cyan',
      'Unique': 'cyan',
      'Interactions': 'purple',
      'Visits': 'purple',
      'Clicks': 'blue',
      'Reactions': 'pink',
      'Comments': 'pink',
      'Reports': 'pink',
      'Views': 'green',
      'Viewers': 'green',
      'Followers': 'yellow',
      'Follows': 'yellow',
      'Avg Engagement Rate': 'orange',
      'Avg. Engagement': 'orange',
      'Avg Engagement': 'orange',
      'Engagement': 'orange',
    };

    (report.metrics || []).forEach((m) => {
      const displayValue = formatReportValue(m.value);
      const colorClass = metricColor[m.label] || 'blue';
      const div = document.createElement('div');
      div.className = `metric-box ${colorClass}`;
      div.innerHTML = `
        <div class="metric-box-label">${m.label}</div>
        <div class="metric-box-value ${colorClass}">${displayValue}${m.sub || ''}</div>
      `;
      detailMetrics.appendChild(div);
    });

    if (clientLogoSpot) {
      clientLogoSpot.innerHTML = report.platform === 'Instagram'
        ? '<img src="/instagram-logo.svg" alt="Instagram logo" />'
        : '<img src="/orbit-logo.svg" alt="Client logo" />';
    }
    if (pdfClientLogoSpot) {
      pdfClientLogoSpot.innerHTML = report.platform === 'Instagram'
        ? '<img src="/instagram-logo.svg" alt="Instagram logo" />'
        : '<img src="/orbit-logo.svg" alt="Client logo" />';
    }
    if (pdfClientLogoSpot2) {
      pdfClientLogoSpot2.innerHTML = report.platform === 'Instagram'
        ? '<img src="/instagram-logo.svg" alt="Instagram logo" />'
        : '<img src="/orbit-logo.svg" alt="Client logo" />';
    }
    if (elevateLogoSpot) {
      elevateLogoSpot.innerHTML = '<img src="/orbit-logo.svg" alt="Orbit logo" />';
    }
    if (pdfElevateLogoSpot) {
      pdfElevateLogoSpot.innerHTML = '<img src="/orbit-logo.svg" alt="Orbit logo" />';
    }
    if (pdfElevateLogoSpot2) {
      pdfElevateLogoSpot2.innerHTML = '<img src="/orbit-logo.svg" alt="Orbit logo" />';
    }

    if (typeof renderPerformanceChart === 'function') {
      setTimeout(() => renderPerformanceChart(report), 100);
    }

    detailTakeaways && (detailTakeaways.innerHTML = '');
    (report.takeaways || []).forEach((t, i) => {
      const div = document.createElement('div');
      div.className = 'bullet-item';
      div.innerHTML = `<div class="bullet-number">${i + 1}</div><div class="bullet-text">${t}</div>`;
      detailTakeaways.appendChild(div);
    });

    detailActions && (detailActions.innerHTML = '');
    (report.actions || []).forEach((a, i) => {
      const div = document.createElement('div');
      div.className = 'bullet-item';
      div.innerHTML = `<div class="bullet-number">${i + 1}</div><div class="bullet-text">${a}</div>`;
      detailActions.appendChild(div);
    });

    reportDetail.style.display = 'flex';
    if (typeof loadGoogleReport === 'function') loadGoogleReport();
    window.scrollTo({ top: reportDetail.offsetTop - 20, behavior: 'smooth' });
  }

  const currentDate = new Date().toLocaleDateString('en-GB');
  const footerDate1 = document.getElementById('footerDate1');
  const footerDate2 = document.getElementById('footerDate2');
  if (footerDate1) footerDate1.textContent = currentDate;
  if (footerDate2) footerDate2.textContent = currentDate;
}

function loadReports() {
  try {
    return readScopedJson('aiReports', []);
  } catch {
    return [];
  }
}

function saveReports(reports) {
  writeScopedJson('aiReports', reports);
  syncReportsToServer(reports);
}

async function syncReportsToServer(reports) {
  try {
    await fetch('/api/reports/sync', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ reports }),
    });
  } catch (error) {
    console.warn('Unable to sync reports to server', error);
  }
}

async function hydrateReportsFromServer() {
  try {
    const response = await fetch('/api/reports', { credentials: 'same-origin' });
    if (!response.ok) return;
    const data = await response.json();
    if (!Array.isArray(data.reports)) return;

    writeScopedJson('aiReports', data.reports);
    renderReports();
    renderDashboardReports();
    renderAIFeedback();

    const requestedId = new URLSearchParams(window.location.search).get('report');
    if (requestedId && window.location.pathname.includes('report.html')) {
      const requestedReport = data.reports.find((report) => report.id === requestedId);
      if (requestedReport) showDetail(requestedReport);
    }
  } catch (error) {
    console.warn('Unable to hydrate reports from server', error);
  }
}

function formatDisplayDate(value) {
  const d = new Date(value);
  const pad = (n) => String(n).padStart(2, '0');
  return `${pad(d.getDate())}/${pad(d.getMonth() + 1)}/${d.getFullYear()}`;
}

function formatReportValue(value) {
  const num = Number(value) || 0;
  if (num >= 1000000) return (num / 1000000).toFixed(1) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return String(value);
}

const reportMetricDefinitions = {
  Instagram: [
    { label: 'Reach / Impressions', aliases: ['reach', 'impressions'] },
    { label: 'Interactions', aliases: ['interactions', 'engagement', 'engagements', 'total interactions'] },
    { label: 'Clicks', aliases: ['clicks', 'link clicks', 'website clicks', 'profile clicks'] },
    { label: 'Reactions', aliases: ['reactions', 'likes', 'reaction'] },
    { label: 'Views', aliases: ['views', 'video views', 'plays'] },
    { label: 'Follows', aliases: ['follows', 'followers', 'new follows'] },
    { label: 'Avg. Engagement', aliases: ['avg engagement', 'average engagement', 'engagement rate'], sub: '%', formula: (totals) => reportPercent(reportMetricValue(totals, ['interactions', 'clicks', 'reactions']), reportMetricValue(totals, ['reach', 'impressions', 'views'])) },
  ],
  Facebook: [
    { label: 'Follows', aliases: ['follows', 'followers', 'new follows'] },
    { label: 'Visits', aliases: ['visits', 'page visits', 'profile visits'] },
    { label: 'Clicks', aliases: ['clicks', 'link clicks', 'website clicks'] },
    { label: 'Interactions', aliases: ['interactions', 'engagement', 'engagements', 'total interactions'] },
    { label: 'Views', aliases: ['views', 'video views', 'total views'] },
    { label: 'Viewers', aliases: ['viewers', 'unique viewers'] },
    { label: 'Avg Engagement', aliases: ['avg engagement', 'average engagement'], formula: (totals) => reportMetricValue(totals, ['link clicks', 'clicks']) + reportMetricValue(totals, ['interactions']) },
  ],
  LinkedIn: [
    { label: 'Impressions', aliases: ['impressions'] },
    { label: 'Unique', aliases: ['unique', 'unique impressions', 'unique visitors', 'unique views'] },
    { label: 'Clicks', aliases: ['clicks', 'link clicks'] },
    { label: 'Reactions', aliases: ['reactions', 'likes'] },
    { label: 'Comments', aliases: ['comments', 'comment count'] },
    { label: 'Reports', aliases: ['reports', 'reposts', 'shares', 'shared reports'] },
    { label: 'Engagement', aliases: ['engagement', 'engagement rate'], sub: '%' },
    { label: 'Avg Engagement', aliases: ['avg engagement', 'average engagement'], formula: (totals) => reportMetricValue(totals, ['clicks']) + reportMetricValue(totals, ['reactions']) + reportMetricValue(totals, ['comments']) + reportMetricValue(totals, ['reports', 'reposts', 'shares']) },
  ],
};

function reportNormalizeKey(value) {
  return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function reportMetricValue(totals, aliases) {
  const aliasKeys = aliases.map(reportNormalizeKey);
  const found = Object.entries(totals || {}).find(([key]) => {
    const normalized = reportNormalizeKey(key);
    return aliasKeys.includes(normalized) || aliasKeys.some((alias) => normalized.includes(alias) || alias.includes(normalized));
  });
  return found ? Number(found[1] || 0) : 0;
}

function reportPercent(value, base) {
  return base ? Number(((value / base) * 100).toFixed(2)) : 0;
}

function buildPlatformReportMetrics(metricsData = {}, platform = 'Instagram') {
  const dashboard = metricsData.platformDashboards?.[platform];
  const rows = [...(dashboard?.rows || []), ...(dashboard?.metricoolRows || [])];
  if (!rows.length) {
    const source = metricsData.metrics || {};
    return [
      { label: 'Reach / Impressions', value: source.reach || 0 },
      { label: 'Interactions', value: source.interactions || 0 },
      { label: 'Clicks', value: source.clicks || 0 },
      { label: 'Reactions', value: source.reactions || 0 },
      { label: 'Views', value: source.views || 0 },
      { label: 'Follows', value: source.follows || 0 },
      { label: 'Avg. Engagement', value: source.engagementRate || 0, sub: '%' },
    ];
  }

  const totals = {};
  rows.forEach((row) => {
    Object.entries(row.metrics || {}).forEach(([label, value]) => {
      totals[label] = (totals[label] || 0) + Number(value || 0);
    });
  });

  return (reportMetricDefinitions[platform] || reportMetricDefinitions.Instagram).map((metric) => ({
    label: metric.label,
    value: typeof metric.formula === 'function' ? metric.formula(totals) : reportMetricValue(totals, metric.aliases),
    ...(metric.sub ? { sub: metric.sub } : {}),
  }));
}

async function createReport(startDate, endDate, logoFile, platform = 'Instagram') {
  let metricsData = { metrics: {} };
  try {
    const res = await fetch('/api/metrics');
    if (res.ok) metricsData = await res.json();
  } catch (err) {
    console.warn('Unable to load metrics for report generation', err);
  }

  const metrics = buildPlatformReportMetrics(metricsData, platform);
  const metricMap = metrics.reduce((acc, metric) => {
    acc[metric.label] = Number(metric.value || 0);
    return acc;
  }, {});
  const aggregated = {
    reach: metricMap['Reach / Impressions'] || metricMap.Impressions || 0,
    interactions: metricMap.Interactions || 0,
    clicks: metricMap.Clicks || 0,
    reactions: metricMap.Reactions || 0,
    views: metricMap.Views || 0,
    followers: metricMap.Follows || 0,
    engagement: metricMap['Avg. Engagement'] || metricMap['Avg Engagement'] || metricMap.Engagement || 0,
  };

  let summary = `Performance report for ${platform}. Reach: ${formatReportValue(aggregated.reach)}, Interactions: ${formatReportValue(aggregated.interactions)}, Clicks: ${formatReportValue(aggregated.clicks)}.`;

  const takeaways = [];
  if (aggregated.reach) {
    takeaways.push(`Reach totaled ${formatReportValue(aggregated.reach)} for the period, confirming strong audience visibility.`);
  }
  if (aggregated.interactions) {
    takeaways.push(`Interactions reached ${formatReportValue(aggregated.interactions)}, showing meaningful engagement with your content.`);
  }
  if (aggregated.clicks) {
    takeaways.push(`Clicks were ${formatReportValue(aggregated.clicks)}, demonstrating the content is prompting action.`);
  }
  if (aggregated.reactions) {
    takeaways.push(`Reaction volume of ${formatReportValue(aggregated.reactions)} reflects positive content resonance.`);
  }
  if (aggregated.followers) {
    takeaways.push(`Follower growth is visible in the report, supporting longer-term audience expansion.`);
  }
  if (!takeaways.length) {
    takeaways.push('No performance metrics were available for the selected period, so this report reflects the current dataset only.');
  }
  while (takeaways.length < 4) {
    takeaways.push('The current performance trend suggests a continued focus on content formats that drive reach and engagement.');
  }

  const actions = [
    `Prioritize the content types that produced the highest reach and keep the publishing cadence consistent.`,
    `Replicate the strongest post formats identified in this period to maintain momentum.`,
    `Use the highest-performing engagement drivers as a framework for the next content cycle.`,
    `Test one new creative variation while preserving the core messaging that performed well.`,
    `Review the timing of your best-performing posts and align future publishing to similar windows.`
  ];

  try {
    const aiResponse = await fetch('/api/feedback/ai-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        start: startDate,
        end: endDate,
        platform,
        metrics: metricsData.metrics || {},
        perPlatform: metricsData.perPlatform || {},
      }),
    });

    if (aiResponse.ok) {
      const aiPayload = await aiResponse.json();
      if (aiPayload.summary) {
        summary = aiPayload.summary;
      }
      if (Array.isArray(aiPayload.takeaways) && aiPayload.takeaways.length) {
        takeaways.splice(0, takeaways.length, ...aiPayload.takeaways);
      }
      if (Array.isArray(aiPayload.actions) && aiPayload.actions.length) {
        actions.splice(0, actions.length, ...aiPayload.actions);
      }
    }
  } catch (error) {
    console.warn('Unable to enrich report with suggestions', error);
  }

  const report = {
    id: 'r' + Date.now(),
    title: `${platform} Report - ${formatDisplayDate(startDate)} to ${formatDisplayDate(endDate)}`,
    start: startDate,
    end: endDate,
    platform,
    logo: logoFile,
    summary,
    metrics,
    takeaways,
    actions,
    chartSnapshot: buildPlatformReportChartSnapshot(metricsData, platform),
  };

  const reports = loadReports();
  reports.unshift(report);
  saveReports(reports);
  trackClientActivity({
    eventType: 'generate_report',
    eventLabel: 'Generated report',
    eventDetail: report.title,
    pageName: 'Report',
    pageCategory: 'Insights',
    eventMeta: { platform }
  });
  renderReports();
  renderDashboardReports();
  renderAIFeedback();
  if (window.location.pathname.includes('report.html')) showDetail(report);
}

function renderReports() {
  const reportListEl = document.getElementById('reportsList');
  const emptyCard = document.querySelector('.empty-card');
  const reports = loadReports();

  if (!reportListEl) return;
  if (!reports.length) {
    reportListEl.style.display = 'none';
    if (emptyCard) emptyCard.style.display = 'block';
    return;
  }

  if (emptyCard) emptyCard.style.display = 'none';
  reportListEl.style.display = 'grid';
  reportListEl.innerHTML = reports.map((report) => `
    <div class="report-card" data-id="${report.id}">
      <div class="report-main">
        <div class="report-title">${report.title}</div>
        <div class="report-dates">${formatDisplayDate(report.start)} — ${formatDisplayDate(report.end)}</div>
      </div>
      <div class="report-actions">
        <button class="btn btn-primary view-report" data-id="${report.id}">View Report</button>
        <button class="delete-report icon" data-id="${report.id}" title="Delete">🗑</button>
      </div>
    </div>
  `).join('');

  reportListEl.querySelectorAll('.view-report').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const id = event.target.dataset.id;
      const report = loadReports().find((r) => r.id === id);
      if (report) showDetail(report);
    });
  });

  reportListEl.querySelectorAll('.delete-report').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      const id = event.target.dataset.id;
      const filtered = loadReports().filter((report) => report.id !== id);
      saveReports(filtered);
      trackClientActivity({
        eventType: 'edit_report',
        eventLabel: 'Deleted report',
        eventDetail: id,
        pageName: 'Report',
        pageCategory: 'Insights'
      });
      renderReports();
      renderDashboardReports();
      renderAIFeedback();
    });
  });
}

function renderDashboardReports() {
  const recentListEl = document.getElementById('recentReportsList');
  const emptyEl = document.getElementById('recentReportsEmpty');
  if (!recentListEl) return;
  
  const reports = loadReports().slice(0, 3);
  if (!reports.length) {
    recentListEl.style.display = 'none';
    if (emptyEl) emptyEl.style.display = 'block';
    return;
  }
  
  if (emptyEl) emptyEl.style.display = 'none';
  recentListEl.style.display = 'flex';
  recentListEl.innerHTML = reports.map((report) => `
    <div class="recent-report-item" data-id="${report.id}">
      <div class="report-meta">
        <div class="report-title">${report.title}</div>
        <div class="report-date">${formatDisplayDate(report.start)}</div>
      </div>
      <button class="btn btn-small" onclick="window.location.href='report.html?report=${encodeURIComponent(report.id)}'">View</button>
    </div>
  `).join('');
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function renderAIFeedback(options = {}) {
  const shouldGenerate = Boolean(options.generate);
  const feedbackCardEl = document.querySelector('.ai-feedback-card');
  const feedbackEl = document.getElementById('aiFeedbackContent');
  const editBtn = document.getElementById('editAIFeedbackBtn');
  const generateBtn = document.getElementById('generateAIFeedbackBtn');
  if (!feedbackEl || !feedbackCardEl) return;

  let metricsPayload = {};
  let perPlatformPayload = {};
  let uploadName = '';
  let recentPosts = [];

  try {
    const [metricsResponse, postsResponse] = await Promise.all([
      fetch('/api/metrics'),
      fetch('/api/posts'),
    ]);

    if (metricsResponse.ok) {
      const metricsData = await metricsResponse.json();
      metricsPayload = metricsData.metrics || {};
      perPlatformPayload = metricsData.perPlatform || {};
      perPlatformMetrics = perPlatformPayload;
      uploadName = metricsData.lastUploadName || '';
    }

    if (postsResponse.ok) {
      const postsData = await postsResponse.json();
      recentPosts = Array.isArray(postsData.posts) ? postsData.posts : [];
    }
  } catch (error) {
    console.error('Error loading uploaded analytics for feedback:', error);
  }

  if (!hasUploadedAnalytics(metricsPayload, recentPosts, uploadName)) {
    feedbackCardEl.hidden = false;
    feedbackEl.textContent = 'Upload analytics data to generate feedback.';
    if (editBtn) editBtn.disabled = true;
    return;
  }

  feedbackCardEl.hidden = false;
  if (editBtn) editBtn.disabled = false;
  if (!shouldGenerate) {
    feedbackEl.textContent = 'Metrics are loaded. Click Generate when you want AI feedback and recommendations.';
    return;
  }
  feedbackEl.textContent = 'Reading uploaded data and generating feedback...';
  if (generateBtn) {
    generateBtn.disabled = true;
    generateBtn.textContent = 'Generating...';
  }

  const sortedPosts = recentPosts
    .slice()
    .sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0))
    .slice(0, 24)
    .map((post) => ({
      platform: post.platform || 'Unknown',
      title: post.title || 'Untitled',
      postedAt: post.postedAt || 0,
      engagement: {
        reach: Number(post.engagement?.reach || 0),
        interactions: Number(post.engagement?.interactions || 0),
        clicks: Number(post.engagement?.clicks || 0),
        reactions: Number(post.engagement?.reactions || 0),
        views: Number(post.engagement?.views || 0),
        follows: Number(post.engagement?.follows || 0),
      },
    }));

  try {
    const response = await fetch('/api/feedback/ai-suggestions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        uploadName,
        metrics: metricsPayload,
        perPlatform: perPlatformPayload,
        recentPosts: sortedPosts,
        context: 'Read the uploaded analytics data and generate a professional metrics-driven feedback summary for the dashboard, including the key insight and the next best actions.',
      }),
    });

    const data = await response.json().catch(() => ({}));
    if (response.ok) {
      const summary = String(data.summary || '').trim();
      const takeaways = Array.isArray(data.takeaways)
        ? data.takeaways.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const actions = Array.isArray(data.actions)
        ? data.actions.map((item) => String(item || '').trim()).filter(Boolean)
        : [];
      const escapedSummary = escapeHtml(summary);
      const escapedTakeaways = takeaways.map((item) => escapeHtml(item));
      const escapedActions = actions.map((item) => escapeHtml(item));

      let contentHtml = '<div class="ai-feedback-text">';
      if (escapedSummary) {
        contentHtml += `<p class="ai-feedback-summary">${escapedSummary}</p>`;
      }
      if (escapedTakeaways.length) {
        contentHtml += '<strong>Top 5 metric insights</strong>';
        contentHtml += `<ul>${escapedTakeaways.map((item) => `<li>${item}</li>`).join('')}</ul>`;
      }
      if (escapedActions.length) {
        contentHtml += '<strong>Recommended next steps</strong>';
        contentHtml += `<ul>${escapedActions.map((item) => `<li>${item}</li>`).join('')}</ul>`;
      }
      contentHtml += '</div>';
      feedbackEl.innerHTML = `${contentHtml}<button class="edit-ai-feedback-btn" onclick="editAIDashFeedback()">Edit</button>`;
    } else {
      const fallback = buildBrowserAiSuggestions();
      const safeFallback = escapeHtml(formatAiSuggestionText(fallback));
      feedbackEl.innerHTML = `<div class="ai-feedback-text">${safeFallback.replace(/\n/g, '<br>')}</div><button class="edit-ai-feedback-btn" onclick="editAIDashFeedback()">Edit</button>`;
    }
  } catch (error) {
    console.error('Error fetching feedback:', error);
    const fallback = buildBrowserAiSuggestions();
    const safeFallback = escapeHtml(formatAiSuggestionText(fallback));
    feedbackEl.innerHTML = `<div class="ai-feedback-text">${safeFallback.replace(/\n/g, '<br>')}</div><button class="edit-ai-feedback-btn" onclick="editAIDashFeedback()">Edit</button>`;
  }
  if (generateBtn) {
    generateBtn.disabled = false;
    generateBtn.textContent = 'Generate';
  }
}

document.getElementById('generateAIFeedbackBtn')?.addEventListener('click', () => {
  renderAIFeedback({ generate: true });
});

window.editAIDashFeedback = function() {
  const feedbackCardEl = document.querySelector('.ai-feedback-card');
  const feedbackEl = document.getElementById('aiFeedbackContent');
  if (!feedbackEl || feedbackCardEl?.hidden) return;
  const textEl = feedbackEl.querySelector('.ai-feedback-text');
  const current = textEl ? textEl.innerText : '';
  const newFeedback = prompt('Edit feedback:', current);
  if (newFeedback) {
    feedbackEl.innerHTML = `<div class="ai-feedback-text">${newFeedback.replace(/\n/g, '<br>')}</div><button class="edit-ai-feedback-btn" onclick="editAIDashFeedback()">Edit</button>`;
  }
};

function renderPerformanceChart(report) {
  const chartSvgContainer = document.getElementById('chartSvgContainer');
  const chartLegend = document.getElementById('chartLegend');
  const reportChartTitle = document.getElementById('reportChartTitle');
  if (!chartSvgContainer || !chartLegend) return;

  const snapshot = report.chartSnapshot;
  const metrics = report.metrics || [];
  const lookupValue = (label) => Number(metrics.find((m) => m.label === label)?.value || 0);
  const reach = lookupValue('Reach');
  const interactions = lookupValue('Interactions');
  const clicks = lookupValue('Clicks');

  const series = snapshot?.series?.length
    ? snapshot.series.map((metric, index) => ({
        name: metric.name,
        color: metric.color || ['#6bbcff', '#6fe3b2', '#f58ac8', '#ffb86b'][index % 4],
        values: (metric.values || []).map((value) => Number(value || 0)),
        labels: metric.labels || snapshot.days?.map((day) => day.dateLabel || `Day ${day.day}`) || [],
      }))
    : snapshot?.days?.length
    ? [
        {
          name: 'Reach',
          color: '#6bbcff',
          values: snapshot.days.map((day) => Number(day.totals?.reach || 0)),
          labels: snapshot.days.map((day) => day.dateLabel || `Day ${day.day}`),
        },
        {
          name: 'Interactions',
          color: '#6fe3b2',
          values: snapshot.days.map((day) => Number(day.totals?.interactions || 0)),
          labels: snapshot.days.map((day) => day.dateLabel || `Day ${day.day}`),
        },
        {
          name: 'Clicks',
          color: '#f58ac8',
          values: snapshot.days.map((day) => Number(day.totals?.clicks || 0)),
          labels: snapshot.days.map((day) => day.dateLabel || `Day ${day.day}`),
        },
      ]
    : [
        { name: 'Reach', color: '#6bbcff', values: [Math.round(reach * 0.28), Math.round(reach * 0.42), Math.round(reach * 0.55), Math.round(reach * 0.7), Math.round(reach * 0.64), Math.round(reach * 0.83), Math.round(reach)], labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'] },
        { name: 'Interactions', color: '#6fe3b2', values: [Math.round(interactions * 0.18), Math.round(interactions * 0.32), Math.round(interactions * 0.4), Math.round(interactions * 0.5), Math.round(interactions * 0.58), Math.round(interactions * 0.7), Math.round(interactions * 0.85)], labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'] },
        { name: 'Clicks', color: '#f58ac8', values: [Math.round(clicks * 0.14), Math.round(clicks * 0.22), Math.round(clicks * 0.3), Math.round(clicks * 0.42), Math.round(clicks * 0.5), Math.round(clicks * 0.63), Math.round(clicks * 0.79)], labels: ['Day 1', 'Day 2', 'Day 3', 'Day 4', 'Day 5', 'Day 6', 'Day 7'] },
      ];

  if (reportChartTitle) {
    reportChartTitle.textContent = snapshot?.title ? `${snapshot.title} Performance` : 'Saved Performance Snapshot';
  }

  chartLegend.innerHTML = series.map((metric) => `
    <span class="legend-item"><span class="legend-swatch" style="background:${metric.color}"></span>${metric.name}</span>
  `).join('');

  const points = Math.max(series[0]?.values?.length || 0, 1);
  const width = 720;
  const height = 320;
  const padding = 28;
  const xStep = points > 1 ? (width - padding * 2) / (points - 1) : 0;
  const maxValue = Math.max(
    ...series.flatMap((metric) => metric.values.map((value) => Number(value || 0))),
    1
  );
  const normalize = (value) => height - padding - (Number(value || 0) / maxValue) * (height - padding * 2);

  const buildLine = (values) => values.map((value, index) => {
    const x = padding + index * xStep;
    const y = normalize(value);
    return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
  }).join(' ');

  const buildArea = (values) => {
    const line = values.map((value, index) => {
      const x = padding + index * xStep;
      const y = normalize(value);
      return `${index === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
    const lastX = padding + (points - 1) * xStep;
    return `${line} L ${lastX.toFixed(1)} ${height - padding} L ${padding} ${height - padding} Z`;
  };

  const xAxisLabels = series[0]?.labels?.length
    ? series[0].labels
    : Array.from({ length: points }, (_, index) => `Day ${index + 1}`);

  const xLabels = xAxisLabels.map((label, index) => {
    const x = padding + index * xStep;
    return `<text x="${x}" y="${height - 8}" class="chart-axis-label">${index % 2 === 0 || points <= 16 ? label : ''}</text>`;
  }).join('');

  const tooltipId = 'reportChartTooltip';
  const colorWithAlpha = (color, alpha = 0.12) => {
    const hex = String(color || '').replace('#', '');
    if (hex.length === 6) {
      const r = parseInt(hex.slice(0, 2), 16);
      const g = parseInt(hex.slice(2, 4), 16);
      const b = parseInt(hex.slice(4, 6), 16);
      return `rgba(${r}, ${g}, ${b}, ${alpha})`;
    }
    return String(color || 'rgba(107,188,255,0.12)').replace(')', `, ${alpha})`).replace('rgb', 'rgba');
  };

  chartSvgContainer.innerHTML = `
    <svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="xMidYMid meet" class="performance-svg">
      <defs>
        <linearGradient id="peakGradient" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stop-color="rgba(77,122,255,0.18)" />
          <stop offset="100%" stop-color="rgba(77,122,255,0)" />
        </linearGradient>
      </defs>
      <rect x="0" y="0" width="100%" height="100%" rx="22" ry="22" fill="rgba(255,255,255,0.02)" />
      <g class="chart-grid">
        ${Array.from({ length: 4 }).map((_, row) => {
          const y = padding + row * ((height - padding * 2) / 3);
          return `<line x1="${padding}" y1="${y}" x2="${width - padding}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1" />`;
        }).join('')}
      </g>
      ${series.map((metric, index) => `
        <path d="${buildArea(metric.values)}" fill="${colorWithAlpha(metric.color, index === 0 ? 0.1 : 0.045)}" opacity="0.8"></path>
        <path d="${buildLine(metric.values)}" fill="none" stroke="${metric.color}" stroke-width="3" stroke-linecap="round" />
      `).join('')}
      ${series.map((metric) => metric.values.map((value, index) => {
        const x = padding + index * xStep;
        const y = normalize(value);
        const actualValue = Math.round(Number(value || 0));
        const dayLabel = metric.labels?.[index] || xAxisLabels[index] || `Day ${index + 1}`;
        return `<circle class="report-chart-point" data-label="${metric.name}" data-day="${dayLabel}" data-value="${actualValue}" cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="4" fill="${metric.color}" stroke="#0b1117" stroke-width="2" />`;
      }).join('')).join('')}
      ${xLabels}
    </svg>
    <div id="${tooltipId}" class="report-chart-tooltip"></div>
  `;

  const tooltipEl = document.getElementById(tooltipId);
  const chartContainer = chartSvgContainer.parentElement;
  const svgEl = chartSvgContainer.querySelector('.performance-svg');
  if (!tooltipEl || !chartContainer || !svgEl) return;

  const placeTooltip = (event, pointEl) => {
    const label = pointEl.dataset.label || 'Metric';
    const day = pointEl.dataset.day || '';
    const value = Number(pointEl.dataset.value || 0).toLocaleString();
    tooltipEl.innerHTML = `<div class="label">${day}</div><div class="value">${label}</div><div class="meta">Value: ${value}</div>`;

    const containerRect = chartContainer.getBoundingClientRect();
    const tooltipWidth = Math.max(tooltipEl.offsetWidth || 220, 180);
    const tooltipHeight = Math.max(tooltipEl.offsetHeight || 120, 100);
    const x = event.clientX - containerRect.left;
    const y = event.clientY - containerRect.top;
    const left = Math.max(tooltipWidth / 2 + 12, Math.min(x, containerRect.width - tooltipWidth / 2 - 12));
    const shouldPlaceBelow = y < tooltipHeight + 20;
    const top = shouldPlaceBelow
      ? Math.max(12, Math.min(y + 14, containerRect.height - tooltipHeight - 12))
      : Math.max(12, y - 14);

    tooltipEl.classList.toggle('bottom', shouldPlaceBelow);
    tooltipEl.style.left = `${left}px`;
    tooltipEl.style.top = `${top}px`;
    tooltipEl.classList.add('show');
  };

  chartSvgContainer.querySelectorAll('.report-chart-point').forEach((pointEl) => {
    pointEl.addEventListener('mousemove', (event) => placeTooltip(event, pointEl));
    pointEl.addEventListener('mouseenter', (event) => placeTooltip(event, pointEl));
    pointEl.addEventListener('mouseleave', () => {
      tooltipEl.classList.remove('show', 'bottom');
    });
  });
}

const backToReports = document.getElementById('backToReports');
const exportPdfBtn = document.getElementById('exportPdf');

backToReports?.addEventListener('click', (e) => {
  e.preventDefault();
  const reportDetail = document.getElementById('reportDetail');
  if (reportDetail) {
    reportDetail.style.display = 'none';
  }
  window.scrollTo({ top: 0, behavior: 'smooth' });
});

exportPdfBtn?.addEventListener('click', () => {
  window.print();
});

exportPdfBtn?.addEventListener('click', () => {
  window.print();
});

renderReports();
renderDashboardReports();
renderAIFeedback();

// Post Data page handlers
const postFile = document.getElementById('postFile');
const postFileLabel = document.getElementById('postFileLabel');
const accountSearch = document.getElementById('accountSearch');
const accountList = document.getElementById('accountList');
const accountChips = document.getElementById('accountChips');
const postDescription = document.getElementById('postDescription');
const postCaption = document.getElementById('postCaption');
const postMediaUrl = document.getElementById('postMediaUrl');
const postHashtags = document.getElementById('postHashtags');
const postType = document.getElementById('postType');
const generateCaptionBtn = document.getElementById('generateCaption');
const scheduleForm = document.getElementById('scheduleForm');
const scheduleDate = document.getElementById('scheduleDate');
const scheduleTime = document.getElementById('scheduleTime');
const approvalEmail = document.getElementById('approvalEmail');
const platformPills = document.querySelectorAll('.platform-pill');
const previewPlatform = document.getElementById('previewPlatform');
const previewCaption = document.getElementById('previewCaption');
const previewHashtags = document.getElementById('previewHashtags');
const previewFile = document.getElementById('previewFile');
const addAccountBtn = document.getElementById('addAccountBtn');
const saveHashtagsBtn = document.getElementById('saveHashtags');
const savedHashtagsList = document.getElementById('savedHashtagsList');
let savedHashtagSets = loadSavedHashtagSets();

function loadSavedHashtagSets() {
  try {
    return readScopedJson('savedHashtagSets', []);
  } catch {
    return [];
  }
}

function persistSavedHashtagSets() {
  writeScopedJson('savedHashtagSets', savedHashtagSets);
  trackClientActivity({
    eventType: 'edit_hashtags',
    eventLabel: 'Saved hashtag set',
    eventDetail: `${savedHashtagSets.length} hashtag set(s) saved`,
    pageName: 'Scheduling',
    pageCategory: 'Publishing'
  });
  renderSavedHashtagSets();
}

const postQueueList = document.getElementById('postQueueList');
const queueCount = document.getElementById('queueCount');
let postQueue = loadPostQueue();

function loadPostQueue() {
  try {
    return readScopedJson('postQueue', []);
  } catch {
    return [];
  }
}

function persistPostQueue() {
  writeScopedJson('postQueue', postQueue);
  trackClientActivity({
    eventType: 'edit_queue',
    eventLabel: 'Updated post queue',
    eventDetail: `${postQueue.length} queued post(s)`,
    pageName: 'Scheduling',
    pageCategory: 'Publishing'
  });
  renderPostQueue();
}

function createQueueItem({ title, accounts, platforms, date, time, caption, hashtags, adminEmail, status = 'scheduled' }) {
  return {
    id: `post-${Date.now()}`,
    title,
    accounts,
    platforms,
    scheduledAt: `${date} ${time}`,
    caption,
    hashtags,
    adminEmail,
    status,
    createdAt: new Date().toISOString(),
  };
}

function renderPostQueue() {
  if (!postQueueList) return;
  postQueueList.innerHTML = '';
  if (!postQueue.length) {
    postQueueList.innerHTML = `<div class="queue-empty"><strong>No queued posts yet.</strong><p>Create a post and submit for approval to see it here.</p></div>`;
    if (queueCount) queueCount.textContent = '0';
    return;
  }

  if (queueCount) queueCount.textContent = String(postQueue.length);
  postQueue.forEach((item) => {
    const card = document.createElement('div');
    card.className = 'queue-item';
    card.innerHTML = `
      <div class="queue-row">
        <div>
          <div class="queue-title">${item.title}</div>
          <div class="queue-meta">${item.platforms.join(', ')} • ${item.accounts.join(', ')} • ${item.scheduledAt}</div>
        </div>
        <div class="queue-status ${item.status}">${item.status === 'approved' ? 'Approved ✅' : 'Pending ⏳'}</div>
      </div>
      <div class="queue-caption">${item.caption}</div>
      <div class="queue-hashtags">${item.hashtags}</div>
      <div class="queue-footer">
        <span>Approval request sent to ${item.adminEmail}</span>
        ${item.status === 'pending' ? '<button class="pill-btn outline small approve-btn">Approve</button>' : ''}
      </div>
    `;

    if (item.status === 'pending') {
      card.querySelector('.approve-btn')?.addEventListener('click', () => {
        item.status = 'approved';
        persistPostQueue();
      });
    }

    postQueueList.appendChild(card);
  });
}

function renderPostQueue() {
  if (!postQueueList) return;

  postQueue = (postQueue || []).map((item) => ({
    ...item,
    status: item.status === 'pending' && !String(item.adminEmail || '').trim() ? 'scheduled' : item.status,
  }));
  writeScopedJson('postQueue', postQueue);

  postQueueList.innerHTML = '';
  if (!postQueue.length) {
    postQueueList.innerHTML = `<div class="queue-empty"><strong>No queued posts yet.</strong><p>Create a post and schedule it to see it here.</p></div>`;
    if (queueCount) queueCount.textContent = '0';
    return;
  }

  if (queueCount) queueCount.textContent = String(postQueue.length);
  postQueue.forEach((item) => {
    const status = item.status || 'scheduled';
    const statusLabel = status === 'approved' ? 'Approved' : status === 'pending' ? 'Pending approval' : 'Scheduled';
    const footerText = item.adminEmail ? `Approval request sent to ${item.adminEmail}` : 'Scheduled directly. No approval email was added.';
    const card = document.createElement('div');
    card.className = 'queue-item';
    card.innerHTML = `
      <div class="queue-row">
        <div>
          <div class="queue-title">${escapeHtml(item.title || 'Scheduled post')}</div>
          <div class="queue-meta">${escapeHtml((item.platforms || []).join(', '))} - ${escapeHtml((item.accounts || []).join(', '))} - ${escapeHtml(item.scheduledAt || '')}</div>
        </div>
        <div class="queue-status ${escapeHtml(status)}">${escapeHtml(statusLabel)}</div>
      </div>
      <div class="queue-caption">${escapeHtml(item.caption || '')}</div>
      <div class="queue-hashtags">${escapeHtml(item.hashtags || '')}</div>
      <div class="queue-footer">
        <span>${escapeHtml(footerText)}</span>
        ${status === 'pending' ? '<button class="pill-btn outline small approve-btn">Approve</button>' : ''}
      </div>
    `;

    if (status === 'pending') {
      card.querySelector('.approve-btn')?.addEventListener('click', () => {
        item.status = 'approved';
        persistPostQueue();
      });
    }

    postQueueList.appendChild(card);
  });
}

async function sendApprovalRequestEmail(queueItem) {
  const response = await fetch('/api/email/approval-request', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      adminEmail: queueItem.adminEmail,
      title: queueItem.title,
      caption: queueItem.caption,
      scheduledAt: queueItem.scheduledAt,
      accounts: queueItem.accounts,
      platforms: queueItem.platforms,
      hashtags: queueItem.hashtags,
    }),
  });

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(result.message || 'Failed to send approval request.');
  }

  return result;
}

renderPostQueue();

const adCopyGraderForm = document.getElementById('adCopyGraderForm');
const adCopyPlatform = document.getElementById('adCopyPlatform');
const adCopyText = document.getElementById('adCopyText');
const creativeBriefForm = document.getElementById('creativeBriefForm');
const campaignResults = document.getElementById('campaignResults');

const briefFields = {
  campaignName: document.getElementById('briefCampaignName'),
  platforms: document.getElementById('briefPlatform'),
  objective: document.getElementById('briefObjective'),
  audience: document.getElementById('briefAudience'),
  tone: document.getElementById('briefTone'),
  budget: document.getElementById('briefBudget'),
  deadline: document.getElementById('briefDeadline'),
  keyMessage: document.getElementById('briefMessage'),
};

const scoreLabels = {
  hookStrength: 'Hook Strength',
  clarity: 'Clarity',
  callToAction: 'Call to Action',
  emotionalPull: 'Emotional Pull',
  platformRelevance: 'Platform Relevance',
};

const briefSectionLabels = {
  campaignOverview: 'Campaign Overview',
  objectivesKpis: 'Objectives & KPIs',
  targetAudienceDeepDive: 'Target Audience Deep Dive',
  creativeDirectionMood: 'Creative Direction & Mood',
  contentFormatRecommendations: 'Content Format Recommendations',
  keyMessagesHooks: 'Key Message & Hooks',
  callToActionOptions: 'Call to Action Options',
  successMetrics: 'Success Metrics',
  conclusion: 'Overall Conclusion',
};

function scoreTone(score) {
  const numeric = Number(score) || 0;
  if (numeric <= 4) return 'low';
  if (numeric <= 7) return 'mid';
  return 'high';
}

function normalizeScore(score) {
  const numeric = Number(score);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(10, Math.round(numeric)));
}

function renderCampaignStatus(message, isError = false) {
  if (!campaignResults) return;
  campaignResults.hidden = false;
  campaignResults.innerHTML = `<div class="campaign-result-panel full"><div class="campaign-status ${isError ? 'error' : ''}">${escapeHtml(message)}</div></div>`;
}

function renderInsightList(items = []) {
  const safeItems = Array.isArray(items) ? items.filter(Boolean) : [];
  if (!safeItems.length) return '<p class="muted">No notes returned.</p>';
  return `<ul class="insight-list">${safeItems.map((item) => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderAdCopyGrade(result = {}) {
  if (!campaignResults) return;
  const scores = result.scores || {};
  const scoreRows = Object.entries(scoreLabels).map(([key, label]) => {
    const score = normalizeScore(scores[key]);
    const tone = scoreTone(score);
    return `
      <div class="score-row">
        <div class="score-label">${label}</div>
        <div class="score-track"><div class="score-fill ${tone}" style="width:${score * 10}%"></div></div>
        <div class="score-number ${tone}">${score}/10</div>
      </div>
    `;
  }).join('');
  const rewritten = Array.isArray(result.rewrittenVersions) ? result.rewrittenVersions : [result.rewrittenVersion].filter(Boolean);

  campaignResults.hidden = false;
  campaignResults.innerHTML = `
    <section class="campaign-result-panel">
      <div class="campaign-result-head">
        <div>
          <h2>Score Breakdown</h2>
          <p>${escapeHtml(result.platform || adCopyPlatform?.value || 'Selected platform')}</p>
        </div>
        <div class="overall-score">${Math.max(0, Math.min(100, Math.round(Number(result.overallScore) || 0)))}<span>/100 overall</span></div>
      </div>
      <div class="score-list">${scoreRows}</div>
    </section>
    <section class="campaign-result-panel">
      <div class="campaign-result-head"><h3>Strengths</h3></div>
      ${renderInsightList(result.strengths)}
    </section>
    <section class="campaign-result-panel improvements">
      <div class="campaign-result-head"><h3>Improvements</h3></div>
      ${renderInsightList(result.improvements)}
    </section>
    <section class="campaign-result-panel">
      <div class="campaign-result-head"><h3>Rewritten Version</h3></div>
      <p class="rewritten-copy">${escapeHtml(rewritten.join('\n\n') || 'No rewritten copy returned.')}</p>
    </section>
  `;
}

function briefToPlainText(brief = {}) {
  return Object.entries(briefSectionLabels)
    .map(([key, label]) => `${label}\n${String(brief[key] || '').trim()}`)
    .join('\n\n');
}

function currentBriefText(brief = {}) {
  const sectionEls = Array.from(document.querySelectorAll('#briefSections .brief-section'));
  if (!sectionEls.length) return briefToPlainText(brief);
  return sectionEls.map((section) => {
    const key = section.dataset.briefKey;
    const label = briefSectionLabels[key] || section.querySelector('h3')?.textContent || 'Brief Section';
    const text = section.querySelector('textarea')?.value || section.querySelector('p')?.textContent || '';
    return `${label}\n${text.trim()}`;
  }).join('\n\n');
}

function renderCreativeBrief(result = {}) {
  if (!campaignResults) return;
  const brief = result.brief || result;
  const sections = Object.entries(briefSectionLabels).map(([key, label]) => `
    <section class="brief-section" data-brief-key="${key}">
      <h3>${label}</h3>
      <p>${escapeHtml(brief[key] || 'Not provided')}</p>
    </section>
  `).join('');

  campaignResults.hidden = false;
  campaignResults.innerHTML = `
    <section class="campaign-result-panel full" id="creativeBriefResult">
      <div class="campaign-result-head">
        <div>
          <h2>Creative Brief</h2>
          <p>${escapeHtml(briefFields.campaignName?.value || 'Campaign brief')}</p>
        </div>
        <div class="brief-actions">
          <button type="button" class="pill-btn outline small" id="copyBriefBtn">Copy</button>
          <button type="button" class="pill-btn outline small" id="editBriefBtn">Edit</button>
        </div>
      </div>
      <div id="briefSections">${sections}</div>
    </section>
  `;

  document.getElementById('copyBriefBtn')?.addEventListener('click', async () => {
    await navigator.clipboard.writeText(currentBriefText(brief));
    const btn = document.getElementById('copyBriefBtn');
    if (btn) {
      btn.textContent = 'Copied';
      setTimeout(() => { btn.textContent = 'Copy'; }, 1400);
    }
  });

  document.getElementById('editBriefBtn')?.addEventListener('click', () => {
    document.querySelectorAll('#briefSections .brief-section').forEach((section) => {
      const text = section.querySelector('p')?.textContent || '';
      section.querySelector('p')?.replaceWith(Object.assign(document.createElement('textarea'), { value: text }));
    });
    const editBtn = document.getElementById('editBriefBtn');
    if (editBtn) editBtn.textContent = 'Editing';
  });
}

adCopyGraderForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitBtn = adCopyGraderForm.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent || 'Grade My Ad Copy';
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Grading...';
    }
    renderCampaignStatus('Grading your ad copy...');
    const response = await fetch('/api/campaign/ad-copy-grade', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        platform: adCopyPlatform?.value,
        adCopy: adCopyText?.value,
      }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Failed to grade ad copy.');
    renderAdCopyGrade(data.result);
  } catch (error) {
    renderCampaignStatus(error.message || 'Failed to grade ad copy.', true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
});

creativeBriefForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const submitBtn = creativeBriefForm.querySelector('button[type="submit"]');
  const originalText = submitBtn?.textContent || 'Build Creative Brief';
  const inputs = Object.fromEntries(Object.entries(briefFields).map(([key, field]) => [key, field?.value || '']));
  try {
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Building...';
    }
    renderCampaignStatus('Building your creative brief...');
    const response = await fetch('/api/campaign/creative-brief', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ inputs }),
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || 'Failed to build creative brief.');
    renderCreativeBrief(data.result);
  } catch (error) {
    renderCampaignStatus(error.message || 'Failed to build creative brief.', true);
  } finally {
    if (submitBtn) {
      submitBtn.disabled = false;
      submitBtn.textContent = originalText;
    }
  }
});

function renderSavedHashtagSets() {
  if (!savedHashtagsList) return;
  savedHashtagsList.innerHTML = '';
  if (!savedHashtagSets.length) {
    const empty = document.createElement('p');
    empty.className = 'saved-empty';
    empty.textContent = 'No saved hashtag sets yet. Save a hashtag set to use it later.';
    savedHashtagsList.appendChild(empty);
    return;
  }

  savedHashtagSets.forEach((hashtags, index) => {
    const item = document.createElement('div');
    item.className = 'saved-hashtag-item';

    const text = document.createElement('div');
    text.className = 'saved-hashtag-text';
    text.textContent = hashtags;

    const actions = document.createElement('div');
    actions.className = 'saved-hashtag-actions';

    const applyButton = document.createElement('button');
    applyButton.type = 'button';
    applyButton.className = 'pill-btn outline small';
    applyButton.textContent = 'Apply';
    applyButton.addEventListener('click', () => applySavedHashtagSet(hashtags));

    const removeButton = document.createElement('button');
    removeButton.type = 'button';
    removeButton.className = 'pill-btn outline small';
    removeButton.textContent = '🗑️';
    removeButton.addEventListener('click', () => {
      savedHashtagSets.splice(index, 1);
      persistSavedHashtagSets();
    });

    actions.appendChild(applyButton);
    actions.appendChild(removeButton);
    item.appendChild(text);
    item.appendChild(actions);
    savedHashtagsList.appendChild(item);
  });
}

function applySavedHashtagSet(hashtags) {
  if (postHashtags) postHashtags.value = hashtags;
  if (previewHashtags) previewHashtags.textContent = hashtags || 'No hashtags yet...';
}

renderSavedHashtagSets();

function addAccountChip(name) {
  if (!name) return;
  const exists = Array.from(accountChips?.children || []).some((c) => c.dataset.name === name);
  if (exists) return;
  const chip = document.createElement('div');
  chip.className = 'chip-pill';
  chip.dataset.name = name;
  chip.innerHTML = `<span>${name}</span><button aria-label="Remove">×</button>`;
  chip.querySelector('button').addEventListener('click', () => chip.remove());
  accountChips?.appendChild(chip);
}

function addAccountEntry() {
  const name = accountSearch?.value.trim();
  if (!name) return alert('Enter an account name before adding.');
  addAccountChip(name);
  if (accountSearch) accountSearch.value = '';
  renderAvailableAccounts();
}

accountSearch?.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    addAccountEntry();
  }
});

addAccountBtn?.addEventListener('click', () => addAccountEntry());

accountSearch?.addEventListener('input', () => {
  renderAvailableAccounts();
});

function renderAvailableAccounts() {
  if (!accountList) return;

  const allConnections = readConnections();
  const selectedPlatforms = new Set(getSelectedPlatforms());
  const query = accountSearch?.value.trim().toLowerCase() || '';
  const matchingConnections = allConnections.filter((connection) => {
    const matchesPlatform = !selectedPlatforms.size || selectedPlatforms.has(connection.platform);
    const haystack = `${connection.platform} ${connection.username || ''} ${connection.userId || ''}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    return matchesPlatform && matchesQuery;
  });

  accountList.innerHTML = '';

  if (!allConnections.length) {
    accountList.innerHTML = '<span class="hint">No connected accounts yet. Save one from the Connect page first.</span>';
    return;
  }

  if (!matchingConnections.length) {
    accountList.innerHTML = '<span class="hint">No saved accounts match the selected platform or search.</span>';
    return;
  }

  matchingConnections.forEach((connection) => {
    const accountButton = document.createElement('button');
    accountButton.type = 'button';
    accountButton.className = 'account-item';
    accountButton.innerHTML = `
      <span class="account-avatar">${(connection.platform || '?').slice(0, 1)}</span>
      <span class="account-meta">
        <span class="account-name">${getConnectionDisplayName(connection)}</span>
        <span class="account-sub">${connection.platform}</span>
      </span>
    `;
    accountButton.addEventListener('click', () => addAccountChip(getConnectionDisplayName(connection)));
    accountList.appendChild(accountButton);
  });
}

function accountDisplayLabel(connection = {}) {
  return getConnectionDisplayName(connection);
}

function addAccountChip(connection) {
  const account = typeof connection === 'string'
    ? { displayName: connection, username: connection, platform: '', accountId: connection }
    : connection || {};
  const label = accountDisplayLabel(account);
  const accountId = account.accountId || account.userId || label;
  if (!label || !accountId) return;
  const exists = Array.from(accountChips?.children || []).some((chip) => chip.dataset.accountId === accountId);
  if (exists) return;
  const chip = document.createElement('div');
  chip.className = 'chip-pill';
  chip.dataset.name = label;
  chip.dataset.accountId = accountId;
  chip.dataset.platform = account.platform || '';
  chip.innerHTML = `<span>${escapeHtml(label)}</span><button aria-label="Remove">x</button>`;
  chip.querySelector('button')?.addEventListener('click', () => chip.remove());
  accountChips?.appendChild(chip);
}

async function getAvailableConnections() {
  try {
    if (typeof loadPostizConnections === 'function') {
      return await loadPostizConnections();
    }
  } catch {
    // Local saved connections keep the selector usable if Postiz is temporarily unavailable.
  }
  return readConnections();
}

async function addAccountEntry() {
  const connections = await getAvailableConnections();
  const query = accountSearch?.value.trim().toLowerCase() || '';
  const match = connections.find((connection) => {
    const label = accountDisplayLabel(connection).toLowerCase();
    return label === query || label.includes(query);
  });
  if (!match) return alert('Choose a connected account from the dropdown.');
  addAccountChip(match);
  if (accountSearch) accountSearch.value = '';
  renderAvailableAccounts();
}

async function renderAvailableAccounts() {
  if (!accountList) return;

  const allConnections = await getAvailableConnections();
  const selectedPlatforms = new Set(getSelectedPlatforms());
  const query = accountSearch?.value.trim().toLowerCase() || '';
  const selectedAccountIds = new Set(Array.from(accountChips?.children || []).map((chip) => chip.dataset.accountId));
  const matchingConnections = allConnections.filter((connection) => {
    const matchesPlatform = !selectedPlatforms.size || selectedPlatforms.has(connection.platform);
    const haystack = `${connection.platform} ${connection.displayName || ''} ${connection.username || ''} ${connection.name || ''}`.toLowerCase();
    const matchesQuery = !query || haystack.includes(query);
    const accountId = connection.accountId || connection.userId || accountDisplayLabel(connection);
    return matchesPlatform && matchesQuery && !selectedAccountIds.has(accountId);
  });

  accountList.innerHTML = '';

  if (!allConnections.length) {
    accountList.innerHTML = '<span class="hint">No connected accounts yet. Connect one from the Connect page first.</span>';
    return;
  }

  if (!matchingConnections.length) {
    accountList.innerHTML = '<span class="hint">No matching connected accounts.</span>';
    return;
  }

  matchingConnections.forEach((connection) => {
    const accountButton = document.createElement('button');
    accountButton.type = 'button';
    accountButton.className = 'account-item';
    accountButton.innerHTML = `
      <span class="account-avatar">${escapeHtml((connection.platform || '?').slice(0, 1))}</span>
      <span class="account-meta">
        <span class="account-name">${escapeHtml(accountDisplayLabel(connection))}</span>
        <span class="account-sub">${escapeHtml(connection.platform || '')}</span>
      </span>
    `;
    accountButton.addEventListener('click', () => {
      addAccountChip(connection);
      if (accountSearch) accountSearch.value = '';
      renderAvailableAccounts();
    });
    accountList.appendChild(accountButton);
  });
}

accountSearch?.addEventListener('focus', () => {
  accountList?.classList.add('show');
  renderAvailableAccounts();
});

accountSearch?.addEventListener('click', () => {
  accountList?.classList.toggle('show');
  renderAvailableAccounts();
});

document.addEventListener('click', (event) => {
  if (!accountList || !accountSearch) return;
  if (event.target === accountSearch || accountList.contains(event.target)) return;
  accountList.classList.remove('show');
});

function getSelectedPlatforms() {
  return Array.from(platformPills || [])
    .filter((pill) => pill.classList.contains('active'))
    .map((pill) => pill.textContent.trim());
}

function updatePreviewPlatforms() {
  const selected = getSelectedPlatforms();
  if (previewPlatform) {
    previewPlatform.textContent = selected.length ? selected.join(', ') : 'Platform';
  }
}

function buildCaptionFromInputs(file, description) {
  const safeDesc = description?.trim();
  const platforms = getSelectedPlatforms();
  const platformHint = platforms.length ? `for ${platforms.join(', ')}` : '';

  if (safeDesc) {
    return generateGeminiCaption(safeDesc, platformHint, file);
  }

  return generateTextFromFile(file, platformHint);
}

function generateGeminiCaption(description, platformHint, file = null) {
  const cleanDesc = description.replace(/\s+/g, ' ').trim();
  const action = inferActionForFile(file);
  const subject = inferFileSubject(file);
  const templates = [
    `${cleanDesc}. ${action} ${subject} ${platformHint ? `${platformHint} ` : ''}with purpose, clarity, and emotional impact.`,
    `${cleanDesc}. ${platformHint ? `${platformHint} ` : ''}This post is created to connect with your audience and spark real conversation.`,
    `${cleanDesc}. ${action} ${subject} now ${platformHint ? `${platformHint} ` : ''}and make it feel confident, clear, and meaningful.`,
    `${cleanDesc}. ${platformHint ? `${platformHint} ` : ''}Share the specific result, moment, or lesson your audience should remember.`,
  ];
  const caption = templates[Math.floor(Math.random() * templates.length)];
  const hashtags = generateHashtagsFromText(cleanDesc, file, platformHint);

  return { caption, hashtags };
}

function generateTextFromFile(file, platformHint = '') {
  if (!file) {
    return {
      caption: 'Add a media file or description to generate a powerful caption and hashtag set.',
      hashtags: '#content #social #elevate',
    };
  }

  const captionOptions = [];
  if (isImage(file)) {
    captionOptions.push(
      `A vibrant image caption that brings your visual story to life with confidence ${platformHint}.`,
      `This visual share is designed to inspire the audience and highlight your message ${platformHint}.`,
      `A strong image post written to spark attention, connection, and action ${platformHint}.`
    );
  } else if (isVideo(file)) {
    captionOptions.push(
      `A compelling video caption that invites viewers to watch, engage, and share the moment ${platformHint}.`,
      `This video is crafted to capture attention and drive meaningful interaction ${platformHint}.`,
      `A bold video post designed to make every second feel memorable and shareable ${platformHint}.`
    );
  } else if (isPDF(file)) {
    captionOptions.push(
      `A polished PDF caption that highlights the key ideas and value clearly ${platformHint}.`,
      `A professional post describing your PDF insights with purpose and clarity ${platformHint}.`,
      `A thoughtful caption that explains the value inside this document ${platformHint}.`
    );
  } else {
    captionOptions.push(
      `A fresh social post ready for audience attention ${platformHint}.`,
      `A strong post that shares your content with clarity and energy ${platformHint}.`
    );
  }

  const caption = captionOptions[Math.floor(Math.random() * captionOptions.length)];
  return {
    caption,
    hashtags: generateHashtagsFromText(caption, file, platformHint),
  };
}

function inferActionForFile(file) {
  if (!file) return 'Share';
  if (isVideo(file)) return 'Watch';
  if (isPDF(file)) return 'Discover';
  return 'Explore';
}

function inferFileSubject(file) {
  if (!file) return 'this post';
  if (isVideo(file)) return 'this video';
  if (isPDF(file)) return 'this resource';
  return 'this visual';
}

function generateHashtagsFromText(text, file, platformHint) {
  const words = text
    .replace(/[^a-zA-Z0-9 ]/g, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 7)
    .map((word) => word.length > 2 ? `#${word.toLowerCase()}` : null)
    .filter(Boolean);

  const typeTags = [];
  if (isImage(file)) typeTags.push('#visualstory', '#creative');
  if (isVideo(file)) typeTags.push('#video', '#motion');
  if (isPDF(file)) typeTags.push('#insights', '#contentstrategy');

  const platformTags = [];
  if (platformHint.includes('Instagram')) platformTags.push('#instagram');
  if (platformHint.includes('Facebook')) platformTags.push('#facebook');
  if (platformHint.includes('LinkedIn')) platformTags.push('#linkedin');
  if (platformHint.includes('Twitter')) platformTags.push('#twitter');
  if (platformHint.includes('TikTok')) platformTags.push('#tiktok');
  if (platformHint.includes('YouTube')) platformTags.push('#youtube');

  const tags = [...new Set([...words, ...typeTags, ...platformTags, '#elevate', '#engagement'])];
  return tags.slice(0, 10).join(' ');
}

function fileExtension(file) {
  return (file?.name.split('.').pop() || '').toLowerCase();
}

function isImage(file) {
  const extension = fileExtension(file);
  return file?.type.startsWith('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(extension);
}

function isVideo(file) {
  const extension = fileExtension(file);
  return file?.type.startsWith('video') || ['mp4', 'mov', 'avi', 'mkv'].includes(extension);
}

function isPDF(file) {
  const extension = fileExtension(file);
  return file?.type === 'application/pdf' || extension === 'pdf';
}

function renderPreviewFile(file) {
  if (!previewFile) return;
  previewFile.innerHTML = '';
  if (!file) {
    previewFile.textContent = 'No media selected';
    return;
  }

  const extension = (file.name.split('.').pop() || '').toLowerCase();
  const type = file.type || '';

  if (type.startsWith('image') || ['jpg', 'jpeg', 'png', 'gif', 'webp', 'heic'].includes(extension)) {
    const img = document.createElement('img');
    img.src = URL.createObjectURL(file);
    img.onload = () => URL.revokeObjectURL(img.src);
    previewFile.appendChild(img);
  } else if (type.startsWith('video') || ['mp4', 'mov', 'avi', 'mkv'].includes(extension)) {
    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.controls = true;
    video.autoplay = false;
    video.muted = true;
    video.playsInline = true;
    previewFile.appendChild(video);
  } else if (type === 'application/pdf' || extension === 'pdf') {
    const badge = document.createElement('div');
    badge.className = 'pdf-badge';
    badge.innerHTML = `<strong>PDF uploaded:</strong><span>${file.name}</span>`;
    previewFile.appendChild(badge);
  } else {
    previewFile.textContent = file.name;
  }
}

function applyGeneratedText(caption, hashtags) {
  if (postCaption) postCaption.value = caption;
  if (postHashtags) postHashtags.value = hashtags;
  if (previewCaption) previewCaption.textContent = caption;
  if (previewHashtags) previewHashtags.textContent = hashtags;
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ''));
    reader.onerror = () => reject(new Error('Unable to read the selected file.'));
    reader.readAsDataURL(file);
  });
}

async function uploadSelectedMediaIfNeeded() {
  const existingUrl = postMediaUrl?.value.trim();
  if (existingUrl) return existingUrl;
  const file = postFile?.files?.[0];
  if (!file) return '';
  const mediaData = await readFileAsDataUrl(file);
  const response = await fetch('/api/media/upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify({
      filename: file.name,
      mediaType: file.type,
      mediaData,
    }),
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message || 'Unable to upload media for publishing.');
  if (postMediaUrl) postMediaUrl.value = payload.url || '';
  return payload.url || '';
}

saveHashtagsBtn?.addEventListener('click', () => {
  const hashtags = postHashtags?.value.trim();
  if (!hashtags) return alert('Enter hashtags to save first.');
  if (!/#\w+/.test(hashtags)) return alert('Please include at least one hashtag.');
  if (savedHashtagSets.includes(hashtags)) return alert('This hashtag set is already saved.');

  savedHashtagSets.unshift(hashtags);
  if (savedHashtagSets.length > 10) savedHashtagSets.pop();
  persistSavedHashtagSets();
});

postFile?.addEventListener('change', () => {
  const f = postFile.files?.[0];
  postFileLabel.textContent = f ? `${f.name} (${Math.round(f.size / 1024)} KB)` : 'Click to upload image, video, or PDF';
  renderPreviewFile(f);
  if (postMediaUrl) postMediaUrl.value = '';
});

generateCaptionBtn?.addEventListener('click', async () => {
  const f = postFile.files?.[0];
  if (!f && !postDescription?.value.trim()) return alert('Upload a media file or enter a description first.');
  const originalText = generateCaptionBtn.textContent;
  try {
    generateCaptionBtn.disabled = true;
    generateCaptionBtn.textContent = 'Generating...';
    const selectedPlatforms = getSelectedPlatforms();
    const response = await fetch('/api/generate/caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        topic: postDescription?.value.trim() || f?.name || 'New post',
        title: f?.name || '',
        mediaName: f?.name || '',
        mediaNotes: f ? `${f.name} ${f.type || ''}` : '',
        platform: selectedPlatforms[0] || 'Instagram',
        postType: postType?.value || 'Feed Post',
        length: 'medium',
      }),
    });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(payload.message || payload.error || 'Caption generation failed.');
    applyGeneratedText(payload.caption || '', Array.isArray(payload.hashtags) ? payload.hashtags.join(' ') : payload.hashtags || '');
    if (payload.notice) console.warn(payload.notice);
  } catch (error) {
    alert(error.message || 'Caption generation failed.');
  } finally {
    generateCaptionBtn.disabled = false;
    generateCaptionBtn.textContent = originalText;
  }
});

postCaption?.addEventListener('input', () => {
  if (previewCaption) previewCaption.textContent = postCaption.value || 'No caption yet...';
});

postHashtags?.addEventListener('input', () => {
  if (previewHashtags) previewHashtags.textContent = postHashtags.value || 'No hashtags yet...';
});

platformPills?.forEach((pill) => {
  pill.addEventListener('click', () => {
    pill.classList.toggle('active');
    updatePreviewPlatforms();
    renderAvailableAccounts();
  });
});

updatePreviewPlatforms();
renderAvailableAccounts();

scheduleForm?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const selectedAccounts = Array.from(accountChips?.children || []).map((chip) => ({
    accountId: chip.dataset.accountId,
    platform: chip.dataset.platform,
    label: chip.dataset.name,
  })).filter((account) => account.accountId && account.platform);
  const accounts = selectedAccounts.map((account) => account.label);
  const selectedPlatforms = getSelectedPlatforms();
  const caption = [postCaption?.value.trim(), postHashtags?.value.trim()].filter(Boolean).join('\n\n');
  const title = postCaption?.value.trim() || postDescription?.value.trim() || postFile?.files?.[0]?.name || 'Scheduled post';
  if (!selectedAccounts.length) return alert('Choose at least one connected account.');
  if (!selectedPlatforms.length) return alert('Pick at least one platform.');
  if (selectedPlatforms.includes('LinkedIn') && postFile?.files?.[0] && !postFile.files[0].name.toLowerCase().endsWith('.pdf')) {
    return alert('LinkedIn requires a PDF upload.');
  }
  if (!caption && !postMediaUrl?.value.trim() && !postFile?.files?.length) return alert('Add a caption, media URL, or media file.');
  if (!scheduleDate?.value || !scheduleTime?.value) return alert('Pick a date and time.');

  const queueItem = createQueueItem({
    title,
    accounts,
    platforms: selectedPlatforms,
    date: scheduleDate.value,
    time: scheduleTime.value,
    caption: postCaption?.value.trim() || 'No caption provided',
    hashtags: postHashtags?.value.trim() || 'No hashtags provided',
    adminEmail: approvalEmail.value.trim(),
    status: approvalEmail?.value.trim() ? 'pending' : 'scheduled',
  });
  try {
    const resolvedMediaUrl = await uploadSelectedMediaIfNeeded();
    const scheduleResponse = await fetch('/api/schedule-post', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({
        title,
        caption: caption || title,
        content: caption || title,
        scheduledFor: `${scheduleDate.value}T${scheduleTime.value}`,
        platforms: selectedAccounts.map((account) => ({
          platform: account.platform,
          accountId: account.accountId,
        })),
        mediaUrl: resolvedMediaUrl,
        mediaType: postFile?.files?.[0]?.type?.startsWith('video') ? 'video' : 'image',
        postType: postType?.value || 'Feed Post',
      }),
    });
    const scheduleResult = await scheduleResponse.json().catch(() => ({}));
    if (!scheduleResponse.ok) throw new Error(scheduleResult.error || scheduleResult.message || 'Unable to schedule this post.');

    if (approvalEmail?.value.trim()) {
      await sendApprovalRequestEmail(queueItem);
    }

    postQueue.unshift(queueItem);
    if (postQueue.length > 20) postQueue = postQueue.slice(0, 20);
    persistPostQueue();

    alert(approvalEmail?.value.trim()
      ? `Post scheduled and approval request sent to ${queueItem.adminEmail}.`
      : 'Post scheduled and added to the content calendar.');

    scheduleForm.reset();
    platformPills?.forEach((pill) => pill.classList.remove('active'));
    updatePreviewPlatforms();
    accountChips.innerHTML = '';
    if (postFile) postFile.value = '';
    if (postFileLabel) postFileLabel.textContent = 'Click to upload image, video, or PDF';
    renderPreviewFile(null);
    if (previewCaption) previewCaption.textContent = 'No caption yet...';
    if (previewHashtags) previewHashtags.textContent = 'No hashtags yet...';
    window.location.href = 'content-calendar.html';
  } catch (error) {
    alert(error.message || 'Unable to schedule the post right now.');
  }
});

