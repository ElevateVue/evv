const form = document.getElementById('loginForm');
const accountTypeInput = document.getElementById('accountType');
const individualCheckbox = document.getElementById('accountTypeIndividual');
const companyCheckbox = document.getElementById('accountTypeCompany');
const companyNameField = document.getElementById('companyNameField');
const companyNameInput = document.getElementById('companyName');
const existingAccountLoginLink = document.getElementById('existingAccountLoginLink');
const accountTypeOptions = Array.from(document.querySelectorAll('[data-account-type-option]'));

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
    localStorage.setItem('portalRole', 'client');
    document.cookie = `session=${encodeURIComponent(data.token)}; path=/`;
    window.location.href = '/featurehub.html';
  } catch (error) {
    alert('Unable to continue right now. Please try again.');
  }
});

setAccountType('individual');
