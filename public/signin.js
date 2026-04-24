const form = document.getElementById('signinForm');

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
    localStorage.setItem('portalRole', 'client');
    document.cookie = `session=${encodeURIComponent(data.token)}; path=/`;
    window.location.href = '/featurehub.html';
  } catch (error) {
    alert('Login failed. Please try again.');
  }
});
