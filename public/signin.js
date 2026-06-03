const form = document.getElementById('signinForm');
const passwordInput = document.getElementById('password');
const passwordToggle = document.getElementById('passwordToggle');

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

    if (loginUser.role !== 'admin' && loginUser.view !== 'admin') {
      try {
        const onboardingResponse = await fetch('/api/onboarding');
        if (onboardingResponse.ok) {
          const onboardingData = await onboardingResponse.json();
          if (onboardingData?.onboarding?.started && !onboardingData?.onboarding?.completed) {
            window.location.href = '/onboarding.html';
            return;
          }
        }
      } catch (error) {
        // Sign-in should still succeed if onboarding status cannot be checked.
      }
    }

    window.location.href = loginUser.role === 'admin' || loginUser.view === 'admin'
      ? '/clienthub.html'
      : '/featurehub.html';
  } catch (error) {
    alert('Login failed. Please try again.');
  }
});

