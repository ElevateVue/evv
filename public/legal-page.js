const legalDocumentContent = document.getElementById('legalDocumentContent');
const legalDocType = document.body?.dataset.legalDoc || 'terms';
const params = new URLSearchParams(window.location.search);
const cameFromSignup = params.get('from') === 'signup';

function navigateBack() {
  if (cameFromSignup) {
    window.location.href = 'login.html';
    return;
  }

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  window.location.href = 'login.html';
}

function agreeAndReturn() {
  localStorage.setItem('evvLegalAgreementAccepted', 'true');
  localStorage.setItem('evvLegalAgreementAcceptedAt', new Date().toISOString());
  navigateBack();
}

async function renderLegalDocument() {
  if (!legalDocumentContent) return;

  const legalFile = legalDocType === 'privacy'
    ? 'legal-privacy-content.html'
    : 'legal-terms-content.html';
  const legalLabel = legalDocType === 'privacy' ? 'Privacy Policy' : 'Terms of Service';

  legalDocumentContent.innerHTML = `<p class="legal-loading">Loading ${legalLabel}...</p>`;
  try {
    const response = await fetch(legalFile);
    if (!response.ok) throw new Error(`Unable to load ${legalLabel}`);
    legalDocumentContent.innerHTML = await response.text();
  } catch (error) {
    legalDocumentContent.innerHTML = `
      <div data-custom-class="body" class="legal-generated-copy">
        <div data-custom-class="title"><h1>${legalLabel}</h1></div>
        <div data-custom-class="body_text"><p>We could not load the ${legalLabel} right now. Please go back and try again.</p></div>
      </div>
    `;
  }
}

document.querySelector('[data-legal-back]')?.addEventListener('click', navigateBack);
document.querySelector('[data-legal-agree]')?.addEventListener('click', agreeAndReturn);
renderLegalDocument();
