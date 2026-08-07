const form = document.getElementById('signinForm');
const passwordInput = document.getElementById('password');
const passwordToggle = document.getElementById('passwordToggle');
const loginSubmitButton = form?.querySelector('.orbit-submit');

function showAuthToast(message) {
  let toast = document.getElementById('authToast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'authToast';
    toast.style.cssText = 'position:fixed;left:50%;bottom:30px;transform:translate(-50%,80px);z-index:100;min-width:min(360px,calc(100vw - 32px));border:1px solid rgba(115,230,255,0.25);border-radius:10px;background:rgba(8,13,28,0.96);color:#eff6ff;padding:13px 16px;box-shadow:0 22px 70px rgba(0,0,0,0.42);opacity:0;pointer-events:none;transition:opacity .22s ease, transform .22s ease;font-size:13px;font-weight:800;text-align:center;';
    document.body.appendChild(toast);
  }
  toast.textContent = message;
  toast.style.opacity = '1';
  toast.style.transform = 'translate(-50%, 0)';
  clearTimeout(toast._hide);
  toast._hide = setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translate(-50%, 80px)';
  }, 2800);
}

document.querySelectorAll('.social-auth-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    showAuthToast(btn.dataset.provider + ' sign-in is coming soon.');
  });
});

function togglePasswordVisibility() {
  if (!passwordInput || !passwordToggle) return;
  const isVisible = passwordInput.type === 'text';
  passwordInput.type = isVisible ? 'password' : 'text';
  passwordToggle.textContent = isVisible ? '👁' : '🙈';
  passwordToggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
}

passwordToggle?.addEventListener('click', togglePasswordVisibility);

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email')?.value.trim() || '';
  const password = document.getElementById('password')?.value || '';

  if (!email || !password) {
    alert('Please enter your email and password.');
    return;
  }

  loginSubmitButton?.classList.add('animating');

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        role: 'client',
        view: 'client',
      }),
    });

    if (!response.ok) {
      throw new Error('Login failed');
    }

    const data = await response.json();
    const loginUser = {
      ...(data.user || {}),
      firstName: data.user?.firstName || '',
      lastName: data.user?.lastName || '',
      email,
      accountType: data.user?.accountType || 'individual',
      companyName: data.user?.companyName || '',
      role: data.user?.role || 'client',
      view: data.user?.view || 'client',
    };

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(loginUser));
    localStorage.setItem('portalRole', loginUser.role || 'client');
    document.cookie = `session=${encodeURIComponent(data.token)}; path=/`;

    let nextUrl = loginUser.role === 'admin' || loginUser.view === 'admin'
      ? '/clienthub.html'
      : '/featurehub.html';

    if (loginUser.role !== 'admin' && loginUser.view !== 'admin') {
      try {
        const onboardingResponse = await fetch('/api/onboarding');
        if (onboardingResponse.ok) {
          const onboardingData = await onboardingResponse.json();
          if (onboardingData?.onboarding?.started && !onboardingData?.onboarding?.completed) {
            nextUrl = '/onboarding.html';
          }
        }
      } catch (error) {
        // Sign-in should still succeed if onboarding status cannot be checked.
      }
    }

    await new Promise((resolve) => setTimeout(resolve, 850));
    window.location.href = nextUrl;
  } catch (error) {
    loginSubmitButton?.classList.remove('animating');
    alert('Login failed. Please try again.');
  }
});

