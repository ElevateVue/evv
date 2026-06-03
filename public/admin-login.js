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
  window.location.href = 'admin-signin.html';
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const firstName = document.getElementById('firstName')?.value.trim() || '';
  const lastName = document.getElementById('lastName')?.value.trim() || '';
  const email = document.getElementById('email')?.value.trim() || '';
  const password = document.getElementById('password')?.value || '';

  if (!firstName || !lastName) {
    alert('Please enter your first and last name.');
    return;
  }

  if (!email || !password) {
    alert('Please enter your email and create a password.');
    return;
  }

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        firstName,
        lastName,
        accountType: 'admin',
        companyName: '',
        role: 'admin',
        view: 'admin',
      }),
    });

    if (!response.ok) {
      throw new Error('Unable to create admin session');
    }

    const data = await response.json();
    const createdUser = {
      ...(data.user || {}),
      firstName: data.user?.firstName || firstName,
      lastName: data.user?.lastName || lastName,
      email,
      accountType: data.user?.accountType || 'admin',
      companyName: data.user?.companyName || '',
      role: data.user?.role || 'admin',
      view: data.user?.view || 'admin',
    };

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(createdUser));
    localStorage.setItem('portalRole', createdUser.role || 'admin');
    document.cookie = `session=${encodeURIComponent(data.token)}; path=/`;
    window.location.href = '/clienthub.html';
  } catch (error) {
    alert('Unable to create admin account. Please try again.');
  }
});
