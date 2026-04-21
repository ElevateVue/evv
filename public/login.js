const form = document.getElementById('loginForm');
const roleInput = document.getElementById('loginRole');
const roleTabs = Array.from(document.querySelectorAll('.login-role-tab'));
const loginCard = document.querySelector('.login-card');
const loginTitle = document.getElementById('loginTitle');
const loginSubtitle = document.getElementById('loginSubtitle');
const loginLinkline = document.getElementById('loginLinkline');
const loginSubmit = document.querySelector('.login-submit');
const authProviderTitle = document.getElementById('authProviderTitle');
const providerOne = document.getElementById('providerOne');
const providerTwo = document.getElementById('providerTwo');
const emailInput = document.getElementById('email');
const passwordInput = document.getElementById('password');

const modeCopy = {
  client: {
    title: 'Welcome Back',
    subtitle: 'Sign in to access your dashboard',
    linkline: 'Already have an account? <a href="/login.html">Log in</a>',
    submit: 'Log In',
    providerTitle: 'Auth Providers',
    providerTwo: 'LinkedIn',
    emailPlaceholder: 'Email or Username',
    passwordPlaceholder: 'Enter your password',
  },
  admin: {
    title: 'Admin Access',
    subtitle: 'Sign in to manage client details and platform access',
    linkline: 'Already have an account? <a href="/login.html">Log in</a>',
    submit: 'Log In',
    providerTitle: 'Auth Providers',
    providerTwo: 'LinkedIn',
    emailPlaceholder: 'Email or Username',
    passwordPlaceholder: 'Enter your password',
  },
  signup: {
    title: 'Create an account',
    subtitle: 'Create your account to continue into your workspace',
    linkline: 'Already have an account? <a href="/login.html">Log in</a>',
    submit: 'Create account',
    providerTitle: 'Or register with',
    providerTwo: 'Apple',
    emailPlaceholder: 'Email',
    passwordPlaceholder: 'Enter your password',
  },
};

function setActiveRole(role) {
  if (roleInput) {
    roleInput.value = role === 'signup' ? 'client' : role;
  }

  if (loginCard) {
    loginCard.classList.toggle('signup-mode', role === 'signup');
  }

  if (loginTitle) {
    loginTitle.textContent = modeCopy[role]?.title || modeCopy.client.title;
  }

  if (loginSubtitle) {
    loginSubtitle.textContent = modeCopy[role]?.subtitle || modeCopy.client.subtitle;
  }

  if (loginLinkline) {
    loginLinkline.innerHTML = modeCopy[role]?.linkline || modeCopy.client.linkline;
  }

  if (loginSubmit) {
    loginSubmit.textContent = modeCopy[role]?.submit || modeCopy.client.submit;
  }

  if (authProviderTitle) {
    authProviderTitle.textContent = modeCopy[role]?.providerTitle || modeCopy.client.providerTitle;
  }

  if (providerOne) {
    providerOne.textContent = 'Google';
  }

  if (providerTwo) {
    providerTwo.textContent = modeCopy[role]?.providerTwo || modeCopy.client.providerTwo;
  }

  if (emailInput) {
    emailInput.placeholder = modeCopy[role]?.emailPlaceholder || modeCopy.client.emailPlaceholder;
  }

  if (passwordInput) {
    passwordInput.placeholder = modeCopy[role]?.passwordPlaceholder || modeCopy.client.passwordPlaceholder;
  }

  roleTabs.forEach((tab) => {
    const isActive = tab.dataset.role === role;
    tab.classList.toggle('active', isActive);
    tab.setAttribute('aria-selected', isActive ? 'true' : 'false');
  });
}

roleTabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    setActiveRole(tab.dataset.role || 'client');
  });
});

function inferRoleFromEmail(email, selectedRole) {
  const normalized = String(email || '').trim().toLowerCase();
  if (selectedRole === 'admin') return 'admin';
  if (normalized.includes('admin')) return 'admin';
  return 'client';
}

form?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('password').value;
  const firstName = document.getElementById('firstName')?.value.trim() || '';
  const lastName = document.getElementById('lastName')?.value.trim() || '';
  const signupTerms = document.getElementById('signupTerms');
  const activeRoleTab = document.querySelector('.login-role-tab.active')?.dataset.role || 'client';
  const selectedRole = activeRoleTab === 'signup' ? 'client' : activeRoleTab;
  const resolvedRole = inferRoleFromEmail(email, selectedRole);

  if (activeRoleTab === 'signup') {
    if (!firstName || !lastName) {
      alert('Please enter your first and last name.');
      return;
    }
    if (!signupTerms?.checked) {
      alert('Please agree to the Terms & Conditions.');
      return;
    }

    const createdUser = {
      firstName,
      lastName,
      email,
      role: 'client',
      view: 'client',
    };

    localStorage.setItem('token', `demo-signup-${Date.now()}`);
    localStorage.setItem('user', JSON.stringify(createdUser));
    localStorage.setItem('portalRole', 'client');
    window.location.href = '/dashboard.html';
    return;
  }

  try {
    const res = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password, role: resolvedRole }),
    });
    if (!res.ok) throw new Error('Login failed');

    const data = await res.json();
    const mergedUser = {
      ...(data.user || {}),
      email,
      firstName,
      lastName,
      role: resolvedRole,
      view: resolvedRole === 'admin' ? 'admin' : 'client',
    };

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(mergedUser));
    localStorage.setItem('portalRole', resolvedRole);
    document.cookie = `session=${encodeURIComponent(data.token)}; path=/`;
    window.location.href = '/dashboard.html';
  } catch (err) {
    alert('Login failed');
  }
});

setActiveRole('client');
