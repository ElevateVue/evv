document.addEventListener('DOMContentLoaded', () => {
  injectSharedFooter();
});

function injectSharedFooter() {
  if (document.body.classList.contains('login-shell')) return;
  if (document.querySelector('.evv-site-footer')) return;

  const legacyLandingFooter = document.querySelector('.footer-wrap');
  if (legacyLandingFooter) {
    legacyLandingFooter.remove();
  }

  const host = document.querySelector('.page') || document.body;
  if (!host) return;

  const footer = document.createElement('footer');
  footer.className = 'evv-site-footer';
  footer.innerHTML = buildFooterMarkup();
  host.appendChild(footer);

  ensureLegalModal();
  bindFooterInteractions(footer);
}

function buildFooterMarkup() {
  const year = new Date().getFullYear();

  return `
    <div class="evv-footer-shell">
      <div class="evv-footer-main">
        <div class="evv-footer-brand">
          <a href="landing.html" class="evv-footer-logo" aria-label="Go to Elevate Vue home">
            <img src="logo.png" alt="Elevate Vue" class="brand-badge" />
            <span>ELEVATE VUE</span>
          </a>
          <p>Elevating social voices through strategy, analytics, and editorial precision.</p>
          <div class="evv-footer-socials" aria-label="Footer quick links">
            <a href="landing.html" class="evv-footer-social" aria-label="Open home page">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M12 4.2 5 9.7v8.1h4.7v-4.5h4.6v4.5H19V9.7l-7-5.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
            </a>
            <a href="mailto:support@elevatevue.com?subject=Elevate%20Vue%20Support" class="evv-footer-social" aria-label="Email support">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <rect x="4" y="6" width="16" height="12" rx="2.4" stroke="currentColor" stroke-width="1.8"/>
                <path d="m5.5 7.5 6.5 5 6.5-5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
            <a href="dashboard.html" class="evv-footer-social" aria-label="Open dashboard">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="M6 18 18 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M9 6h9v9" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>
              </svg>
            </a>
          </div>
        </div>

        <div class="evv-footer-column">
          <h4>Product</h4>
          <a href="dashboard.html">Dashboard</a>
          <a href="connect.html">Connect</a>
          <a href="upload.html">Scheduling</a>
          <a href="report.html">AI Reports</a>
        </div>

        <div class="evv-footer-column">
          <h4>Resources</h4>
          <a href="post-queue.html">Post Queue</a>
          <a href="signin.html">Sign In</a>
          <button type="button" class="evv-footer-linkbtn" data-scroll-top="true">Support Hub</button>
        </div>

        <div class="evv-footer-column evv-footer-connect">
          <h4>Stay Connected</h4>
          <p>Join digital teams receiving weekly strategy notes and platform updates.</p>
          <form class="evv-footer-form" id="evvFooterForm" novalidate>
            <label class="sr-only" for="evvFooterEmail">Email address</label>
            <input id="evvFooterEmail" type="email" placeholder="Email address" autocomplete="email" required />
            <button type="submit" aria-label="Subscribe">
              <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path d="m5 12 14-7-4.2 14-3.3-4.5L5 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
              </svg>
            </button>
          </form>
          <div class="evv-footer-status" id="evvFooterStatus" aria-live="polite"></div>
        </div>
      </div>

      <div class="evv-footer-bottom">
        <div class="evv-footer-copy">© ${year} Elevate Vue Digital Systems. All rights reserved.</div>
        <div class="evv-footer-legal">
          <button type="button" data-legal="privacy">Privacy Policy</button>
          <button type="button" data-legal="terms">Terms of Strategy</button>
          <button type="button" data-legal="cookies">Cookie Settings</button>
        </div>
      </div>
    </div>
  `;
}

function bindFooterInteractions(footer) {
  const form = footer.querySelector('#evvFooterForm');
  const emailInput = footer.querySelector('#evvFooterEmail');
  const status = footer.querySelector('#evvFooterStatus');

  hydrateFooterSubscriber(emailInput, status);

  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    if (!emailInput?.reportValidity()) return;

    const payload = {
      email: emailInput.value.trim(),
      subscribedAt: new Date().toISOString(),
    };

    localStorage.setItem('evvFooterSubscriber', JSON.stringify(payload));
    if (status) {
      status.textContent = `Subscribed with ${payload.email}`;
      status.classList.add('success');
    }
    form.reset();
  });

  footer.querySelectorAll('[data-scroll-top="true"]').forEach((button) => {
    button.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  });

  footer.querySelectorAll('[data-legal]').forEach((button) => {
    button.addEventListener('click', () => {
      openLegalModal(button.getAttribute('data-legal'));
    });
  });
}

function hydrateFooterSubscriber(emailInput, status) {
  try {
    const saved = JSON.parse(localStorage.getItem('evvFooterSubscriber') || 'null');
    if (saved?.email && status) {
      status.textContent = `Subscribed with ${saved.email}`;
      status.classList.add('success');
    }
    if (saved?.email && emailInput) {
      emailInput.value = saved.email;
    }
  } catch (error) {
    console.warn('Unable to restore footer subscription', error);
  }
}

function ensureLegalModal() {
  if (document.getElementById('evvLegalModal')) return;

  const modal = document.createElement('div');
  modal.className = 'evv-legal-modal hidden';
  modal.id = 'evvLegalModal';
  modal.innerHTML = `
    <div class="evv-legal-backdrop" data-close-legal="true"></div>
    <div class="evv-legal-dialog" role="dialog" aria-modal="true" aria-labelledby="evvLegalTitle">
      <button type="button" class="evv-legal-close" data-close-legal="true" aria-label="Close legal dialog">×</button>
      <h3 id="evvLegalTitle">Privacy Policy</h3>
      <div class="evv-legal-content" id="evvLegalContent"></div>
      <div class="evv-cookie-actions hidden" id="evvCookieActions">
        <button type="button" data-cookie-mode="essential">Allow Essential Only</button>
        <button type="button" data-cookie-mode="analytics">Allow Analytics</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  modal.querySelectorAll('[data-close-legal="true"]').forEach((button) => {
    button.addEventListener('click', closeLegalModal);
  });

  modal.querySelectorAll('[data-cookie-mode]').forEach((button) => {
    button.addEventListener('click', () => {
      const mode = button.getAttribute('data-cookie-mode');
      localStorage.setItem('evvCookiePreference', mode);
      closeLegalModal();
      const status = document.getElementById('evvFooterStatus');
      if (status) {
        status.textContent = `Cookie preference saved: ${mode === 'analytics' ? 'Analytics enabled' : 'Essential only'}`;
        status.classList.add('success');
      }
    });
  });
}

function openLegalModal(type) {
  const modal = document.getElementById('evvLegalModal');
  const title = document.getElementById('evvLegalTitle');
  const content = document.getElementById('evvLegalContent');
  const cookieActions = document.getElementById('evvCookieActions');
  if (!modal || !title || !content || !cookieActions) return;

  const copy = {
    privacy: {
      title: 'Privacy Policy',
      body: `
        <p>Elevate Vue stores only the information needed to support sign-in, saved reports, queued posts, and newsletter preferences in this demo workspace.</p>
        <p>No payment details are collected inside this interface, and you can clear locally saved preferences at any time from cookie settings.</p>
      `,
    },
    terms: {
      title: 'Terms of Strategy',
      body: `
        <p>Platform insights, generated captions, and AI reports are designed to support editorial decisions, not replace final human review.</p>
        <p>Teams should validate campaign, legal, and brand-sensitive content before publishing or sharing exported reports externally.</p>
      `,
    },
    cookies: {
      title: 'Cookie Settings',
      body: `
        <p>Choose how Elevate Vue saves local preferences on this device. Essential storage keeps sign-in and basic workflow state. Analytics storage also keeps experience preferences like newsletter and cookie choices.</p>
      `,
    },
  };

  const selected = copy[type] || copy.privacy;
  title.textContent = selected.title;
  content.innerHTML = selected.body;
  cookieActions.classList.toggle('hidden', type !== 'cookies');
  modal.classList.remove('hidden');
  document.body.classList.add('evv-modal-open');
}

function closeLegalModal() {
  const modal = document.getElementById('evvLegalModal');
  modal?.classList.add('hidden');
  document.body.classList.remove('evv-modal-open');
}
