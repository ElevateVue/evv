// State Management
let currentReport = null;
let allReports = [];

// DOM Elements
const form = document.getElementById('positioningForm');
const reportPreview = document.getElementById('reportPreview');
const reportContent = document.getElementById('reportContent');
const saveReportBtn = document.getElementById('saveReportBtn');
const regenerateBtn = document.getElementById('regenerateBtn');
const copyReportBtn = document.getElementById('copyReportBtn');
const generateLoading = document.getElementById('generateLoading');
const successAlert = document.getElementById('successAlert');
const errorAlert = document.getElementById('errorAlert');
const successMessage = document.getElementById('successMessage');
const errorMessage = document.getElementById('errorMessage');
const reportsContainer = document.getElementById('reportsContainer');
const tabButtons = document.querySelectorAll('.tab-button');
const contentAreas = document.querySelectorAll('.content-area');
const confirmModal = document.getElementById('confirmModal');
const confirmMessage = document.getElementById('confirmMessage');
const confirmBtn = document.getElementById('confirmBtn');

// Helper function to show alerts
function showAlert(type, message) {
  if (type === 'success') {
    successMessage.textContent = message;
    successAlert.classList.add('active');
    setTimeout(() => successAlert.classList.remove('active'), 5000);
  } else {
    errorMessage.textContent = message;
    errorAlert.classList.add('active');
    setTimeout(() => errorAlert.classList.remove('active'), 5000);
  }
}

// Check if user is authenticated
async function ensureAuthenticated() {
  const token = localStorage.getItem('token');
  if (!token) {
    window.location.href = '/login.html';
    return null;
  }
  return token;
}

// Form submission handler
form.addEventListener('submit', async (e) => {
  e.preventDefault();

  // Validate form
  const brandName = document.getElementById('brandName').value.trim();
  const industry = document.getElementById('industry').value.trim();
  const usp = document.getElementById('usp').value.trim();
  const brandTone = document.getElementById('brandTone').value;
  
  const brandValues = Array.from(document.querySelectorAll('input[name="brandValues"]:checked'))
    .map(cb => cb.value);

  if (!brandName || !industry || !usp || !brandTone || brandValues.length < 2) {
    showAlert('error', 'Please fill in all required fields. Brand values must have at least 2 selections.');
    return;
  }

  // Show loading
  generateLoading.classList.add('active');
  form.style.display = 'none';

  try {
    const response = await fetch('/api/positioning/generate', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        brandName,
        industry,
        usp,
        brandTone,
        brandValues,
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to generate positioning');
    }

    const data = await response.json();
    currentReport = data.report;
    displayReport(data.report);
    showAlert('success', 'Positioning report generated successfully!');
  } catch (err) {
    console.error('Generation error:', err);
    showAlert('error', err.message || 'Failed to generate positioning report');
  } finally {
    generateLoading.classList.remove('active');
    form.style.display = 'block';
  }
});

// Display generated report
function displayReport(report) {
  reportContent.innerHTML = '';

  const renderTextSection = (title, text) => `
    <div class="card">
      <div class="report-section">
        <h2>${escapeHtml(title)}</h2>
        <div class="report-content">${escapeHtml(text).replace(/\n/g, '<br/>')}</div>
      </div>
    </div>
  `;

  const renderListSection = (title, items, itemLabel) => {
    const itemsHtml = items
      .map((item, index) => `
        <div class="report-content">
          ${escapeHtml(itemLabel)} ${index + 1}: ${escapeHtml(item)}
        </div>
      `)
      .join('');

    return `
      <div class="card">
        <div class="report-section">
          <h2>${escapeHtml(title)}</h2>
          ${itemsHtml}
        </div>
      </div>
    `;
  };

  const renderMessagingSection = (messaging) => {
    let bodyHtml = '';

    if (messaging.coreMessage) {
      bodyHtml += `
        <div class="report-content">
          ${escapeHtml(messaging.coreMessage)}
        </div>
      `;
    }

    if (messaging.targetAudiences && messaging.targetAudiences.length) {
      bodyHtml += messaging.targetAudiences
        .map(audience => `
          <div class="report-item">
            <strong>${escapeHtml(audience.type)}:</strong>
            <span>${escapeHtml(audience.description)}</span>
          </div>
        `)
        .join('');
    }

    if (messaging.supportingMessages && messaging.supportingMessages.length) {
      bodyHtml += messaging.supportingMessages
        .map(message => `
          <div class="report-content">
            ${escapeHtml(message)}
          </div>
        `)
        .join('');
    }

    if (messaging.callToActions && messaging.callToActions.length) {
      bodyHtml += messaging.callToActions
        .map(cta => `
          <div class="report-content">
            ${escapeHtml(cta)}
          </div>
        `)
        .join('');
    }

    return `
      <div class="card">
        <div class="report-section">
          <h2>${escapeHtml('Messaging Framework')}</h2>
          ${bodyHtml}
        </div>
      </div>
    `;
  };

  if (report.positioningStatement) {
    reportContent.innerHTML += renderTextSection('Positioning Statement', report.positioningStatement);
  }

  if (report.taglines && report.taglines.length) {
    reportContent.innerHTML += renderListSection('Brand Tagline Options', report.taglines, 'Option');
  }

  if (report.differentiators && report.differentiators.length) {
    reportContent.innerHTML += renderListSection('Key Differentiators', report.differentiators, 'Differentiator');
  }

  if (report.elevatorPitch) {
    reportContent.innerHTML += renderTextSection('Elevator Pitch', report.elevatorPitch);
  }

  if (report.messaging) {
    reportContent.innerHTML += renderMessagingSection(report.messaging);
  }

  if (report.conclusion) {
    reportContent.innerHTML += renderTextSection('Strategic Conclusion', report.conclusion);
  }

  reportPreview.style.display = 'block';
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Save report
saveReportBtn.addEventListener('click', async () => {
  if (!currentReport) return;

  saveReportBtn.disabled = true;
  saveReportBtn.textContent = '💾 Saving...';

  try {
    const response = await fetch('/api/positioning/save', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        ...currentReport,
        savedAt: new Date().toISOString(),
      }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to save report');
    }

    showAlert('success', 'Report saved successfully! View it in the dashboard.');
    loadReports();
  } catch (err) {
    console.error('Save error:', err);
    showAlert('error', err.message || 'Failed to save report');
  } finally {
    saveReportBtn.disabled = false;
    saveReportBtn.textContent = '💾 Save Report';
  }
});

// Regenerate report
regenerateBtn.addEventListener('click', () => {
  reportPreview.style.display = 'none';
  form.style.display = 'block';
  form.scrollIntoView({ behavior: 'smooth' });
});

// Copy report to clipboard
copyReportBtn.addEventListener('click', async () => {
  if (!reportContent.innerText) return;

  try {
    await navigator.clipboard.writeText(reportContent.innerText);
    showAlert('success', 'Report copied to clipboard!');
  } catch (err) {
    showAlert('error', 'Failed to copy report');
  }
});

// Tab switching
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    const tabName = btn.dataset.tab;
    switchTab(tabName);
  });
});

function switchTab(tabName) {
  // Update active button
  tabButtons.forEach(btn => {
    btn.classList.toggle('active', btn.dataset.tab === tabName);
  });

  // Update visible content
  contentAreas.forEach(area => {
    area.classList.toggle('active', area.id === tabName);
  });

  // Load reports if switching to dashboard
  if (tabName === 'dashboard') {
    loadReports();
  }
}

// Load and display reports
async function loadReports() {
  try {
    const response = await fetch('/api/positioning/reports', {
      method: 'GET',
    });

    if (!response.ok) {
      throw new Error('Failed to load reports');
    }

    const data = await response.json();
    allReports = data.reports || [];

    if (allReports.length === 0) {
      reportsContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📋</div>
          <h3>No Reports Yet</h3>
          <p>Create your first brand positioning report to get started</p>
          <button class="btn-primary" onclick="switchTab('wizard')">
            Create Positioning Report
          </button>
        </div>
      `;
      return;
    }

    const reportsHtml = allReports
      .sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt))
      .map((report, index) => `
        <div class="report-card">
          <div class="report-card-header">
            <div>
              <div class="report-card-title">${escapeHtml(report.brandName)}</div>
              <div class="report-card-meta">
                ${escapeHtml(report.industry)} • ${formatDate(report.savedAt)}
              </div>
            </div>
          </div>
          <div class="report-card-badges">
            <span class="badge">${escapeHtml(report.brandTone)}</span>
            ${report.brandValues.slice(0, 2).map(v => `<span class="badge">${escapeHtml(v)}</span>`).join('')}
          </div>
          <div class="report-card-actions">
            <button class="btn-primary btn-small" onclick="viewReport(${index})">
              👁️ View
            </button>
            <button class="btn-danger btn-small" onclick="deleteReport('${escapeHtml(report.id)}')">
              🗑️ Delete
            </button>
          </div>
        </div>
      `)
      .join('');

    reportsContainer.innerHTML = `<div class="reports-grid">${reportsHtml}</div>`;
  } catch (err) {
    console.error('Load reports error:', err);
    reportsContainer.innerHTML = `
      <div class="alert alert-error active">
        <strong>Error!</strong> Failed to load reports
      </div>
    `;
  }
}

// View report details
function viewReport(index) {
  const report = allReports[index];
  currentReport = report;
  displayReport(report);
  reportPreview.style.display = 'block';
  form.style.display = 'none';
  switchTab('wizard');
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

// Delete report with confirmation
function deleteReport(reportId) {
  confirmMessage.textContent = 'Are you sure you want to delete this positioning report? This action cannot be undone.';
  confirmBtn.onclick = async () => {
    await performDelete(reportId);
    closeModal();
  };
  confirmModal.classList.add('active');
}

async function performDelete(reportId) {
  try {
    const response = await fetch(`/api/positioning/delete/${reportId}`, {
      method: 'DELETE',
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.message || 'Failed to delete report');
    }

    showAlert('success', 'Report deleted successfully!');
    loadReports();
  } catch (err) {
    console.error('Delete error:', err);
    showAlert('error', err.message || 'Failed to delete report');
  }
}

// Modal helpers
function closeModal() {
  confirmModal.classList.remove('active');
}

// Utility functions
function escapeHtml(text) {
  const map = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;'
  };
  return String(text).replace(/[&<>"']/g, m => map[m]);
}

function formatDate(dateString) {
  const date = new Date(dateString);
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric'
  });
}

// Close modal when clicking outside
confirmModal.addEventListener('click', (e) => {
  if (e.target === confirmModal) {
    closeModal();
  }
});

// Load reports on page load
window.addEventListener('DOMContentLoaded', async () => {
  const token = await ensureAuthenticated();
  if (token) {
    loadReports();
  }
});

