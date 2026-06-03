const form = document.getElementById('loginForm');
const passwordInput = document.getElementById('password');
const passwordToggle = document.getElementById('passwordToggle');
const existingAccountLoginLink = document.getElementById('existingAccountLoginLink');

function togglePasswordVisibility() {
  if (!passwordInput || !passwordToggle) return;
  const isVisible = passwordInput.type === 'text';
  passwordInput.type = isVisible ? 'password' : 'text';
  passwordToggle.textContent = isVisible ? '👁' : '🙈';
  passwordToggle.setAttribute('aria-label', isVisible ? 'Show password' : 'Hide password');
}

passwordToggle?.addEventListener('click', togglePasswordVisibility);

existingAccountLoginLink?.addEventListener('click', () => {
  window.location.href = 'admin-login.html';
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email')?.value.trim() || '';
  const password = document.getElementById('password')?.value || '';

  if (!email || !password) {
    alert('Please enter your admin email and password.');
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        role: 'admin',
        view: 'admin',
      }),
    });

    if (!response.ok) {
      throw new Error('Admin login failed');
    }

    const data = await response.json();
    const loginUser = {
      ...(data.user || {}),
      firstName: data.user?.firstName || '',
      lastName: data.user?.lastName || '',
      email,
      accountType: data.user?.accountType || 'admin',
      companyName: data.user?.companyName || '',
      role: data.user?.role || 'admin',
      view: data.user?.view || 'admin',
    };

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(loginUser));
    localStorage.setItem('portalRole', loginUser.role || 'admin');
    document.cookie = `session=${encodeURIComponent(data.token)}; path=/`;
    window.location.href = '/clienthub.html';
  } catch (error) {
    alert('Admin login failed. Please check your credentials and try again.');
  }
});
