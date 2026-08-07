const form = document.getElementById('loginForm');
const accountTypeInput = document.getElementById('accountType');
const individualCheckbox = document.getElementById('accountTypeIndividual');
const companyCheckbox = document.getElementById('accountTypeCompany');
const companyNameField = document.getElementById('companyNameField');
const companyNameInput = document.getElementById('companyName');
const existingAccountLoginLink = document.getElementById('existingAccountLoginLink');
const accountTypeOptions = Array.from(document.querySelectorAll('[data-account-type-option]'));
const passwordInput = document.getElementById('password');
const passwordToggle = document.getElementById('passwordToggle');
const legalAgreementInput = document.getElementById('legalAgreement');
const createAccountButton = document.getElementById('createAccountButton');

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
    showAuthToast(btn.dataset.provider + ' sign-up is coming soon.');
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

function syncCreateAccountAvailability() {
  if (!createAccountButton || !legalAgreementInput) return;
  createAccountButton.disabled = !legalAgreementInput.checked;
  localStorage.setItem('evvLegalAgreementAccepted', legalAgreementInput.checked ? 'true' : 'false');
}

legalAgreementInput?.addEventListener('change', syncCreateAccountAvailability);

function setAccountType(type) {
  const isCompany = type === 'company';

  if (accountTypeInput) {
    accountTypeInput.value = isCompany ? 'company' : 'individual';
  }

  if (individualCheckbox) {
    individualCheckbox.checked = !isCompany;
  }

  if (companyCheckbox) {
    companyCheckbox.checked = isCompany;
  }

  if (companyNameField) {
    companyNameField.hidden = !isCompany;
  }

  if (companyNameInput) {
    companyNameInput.required = isCompany;
    if (!isCompany) companyNameInput.value = '';
  }

  accountTypeOptions.forEach((option) => {
    option.classList.toggle('active', option.dataset.accountTypeOption === type);
  });
}

individualCheckbox?.addEventListener('change', () => {
  setAccountType('individual');
});

companyCheckbox?.addEventListener('change', () => {
  setAccountType('company');
});

existingAccountLoginLink?.addEventListener('click', () => {
  window.location.href = 'signin.html';
});

form?.addEventListener('submit', async (e) => {
  e.preventDefault();

  const firstName = document.getElementById('firstName')?.value.trim() || '';
  const lastName = document.getElementById('lastName')?.value.trim() || '';
  const email = document.getElementById('email')?.value.trim() || '';
  const password = document.getElementById('password')?.value || '';
  const accountType = accountTypeInput?.value || 'individual';
  const companyName = companyNameInput?.value.trim() || '';

  if (!firstName || !lastName) {
    alert('Please enter your first and last name.');
    return;
  }

  if (!email || !password) {
    alert('Please enter your email and create a password.');
    return;
  }

  if (accountType === 'company' && !companyName) {
    alert('Please enter your company name.');
    return;
  }

  if (!legalAgreementInput?.checked) {
    alert('Please agree to the Terms of Service and Privacy Policy before creating your account.');
    return;
  }

  createAccountButton?.classList.add('animating');

  try {
    const response = await fetch('/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email,
        password,
        firstName,
        lastName,
        accountType,
        companyName: accountType === 'company' ? companyName : '',
        legalAccepted: true,
        legalAcceptedAt: new Date().toISOString(),
        role: 'client',
        view: 'client',
      }),
    });

    if (!response.ok) {
      throw new Error('Unable to create session');
    }

    const data = await response.json();
    const createdUser = {
      ...(data.user || {}),
      firstName: data.user?.firstName || firstName,
      lastName: data.user?.lastName || lastName,
      email,
      accountType: data.user?.accountType || accountType,
      companyName: data.user?.companyName || (accountType === 'company' ? companyName : ''),
      role: data.user?.role || 'client',
      view: data.user?.view || 'client',
    };

    localStorage.setItem('token', data.token);
    localStorage.setItem('user', JSON.stringify(createdUser));
    localStorage.setItem('portalRole', createdUser.role || 'client');
    document.cookie = `session=${encodeURIComponent(data.token)}; path=/`;
    await new Promise((resolve) => setTimeout(resolve, 850));
    window.location.href = createdUser.role === 'admin' || createdUser.view === 'admin'
      ? '/clienthub.html'
      : '/onboarding.html';
  } catch (error) {
    createAccountButton?.classList.remove('animating');
    alert('Unable to continue right now. Please try again.');
  }
});

setAccountType('individual');
if (legalAgreementInput && localStorage.getItem('evvLegalAgreementAccepted') === 'true') {
  legalAgreementInput.checked = true;
}
syncCreateAccountAvailability();

