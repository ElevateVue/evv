const strategyStateKeys = {
  scorecard: 'strategy:scorecard',
  icp: 'strategy:icp',
  positioning: 'strategy:positioning',
};

const scorecardChoices = [
  { key: 'A', label: 'Strongly Agree', score: 5 },
  { key: 'B', label: 'Agree', score: 4 },
  { key: 'C', label: 'Neutral', score: 3 },
  { key: 'D', label: 'Disagree', score: 2 },
  { key: 'E', label: 'Strongly Disagree', score: 1 },
];

const scorecardSections = [
  {
    key: 'clarity',
    title: 'Brand Clarity',
    icon: 'C',
    subtitle: 'Can your audience quickly understand what you offer?',
    questions: [
      'I can clearly explain what my brand does in one sentence.',
      'My audience immediately understands my offer.',
      'My target audience is clearly defined.',
      'My messaging is consistent across all platforms.',
      'I am confident in my brand positioning.',
    ],
  },
  {
    key: 'voice',
    title: 'Brand Voice',
    icon: 'V',
    subtitle: 'Does your brand sound recognizable and emotionally clear?',
    questions: [
      'My brand has a clear and recognizable tone of voice.',
      'My content reflects my brand personality consistently.',
      'My messaging creates emotional connection with my audience.',
      'My communication style is consistent across channels.',
      'My audience can recognize my brand through the way I communicate.',
    ],
  },
  {
    key: 'trust',
    title: 'Brand Trust',
    icon: 'T',
    subtitle: 'Does your audience feel confident choosing your brand?',
    questions: [
      'My brand has a clear and recognizable tone of voice.',
      'My content reflects my brand personality consistently.',
      'My messaging creates emotional connection with my audience.',
      'My communication style is consistent across channels.',
      'My audience can recognize my brand through the way I communicate.',
    ],
  },
  {
    key: 'reach',
    title: 'Brand Reach',
    icon: 'R',
    subtitle: 'Is your brand visible to the people you want to reach?',
    questions: [
      'My brand is consistently active online.',
      'My audience is growing steadily.',
      'My social media engagement is strong.',
      'My brand is visible within my industry or niche.',
      'My marketing efforts effectively reach my target audience.',
    ],
  },
  {
    key: 'differentiation',
    title: 'Differentiation',
    icon: 'D',
    subtitle: 'Does your brand clearly stand apart from alternatives?',
    questions: [
      'My brand stands out from competitors.',
      'Customers clearly understand what makes my brand unique.',
      'My brand has a strong unique value proposition.',
      'My brand identity is memorable.',
      'My business offers something different from competitors.',
    ],
  },
  {
    key: 'consistency',
    title: 'Brand Consistency',
    icon: 'S',
    subtitle: 'Does your brand feel aligned everywhere it appears?',
    questions: [
      'My visual branding is consistent across all platforms.',
      'My audience receives a consistent brand experience.',
      'My team communicates the brand consistently.',
      'My branding guidelines are followed regularly.',
      'My content and messaging stay aligned over time.',
    ],
  },
];

const scorecardState = {
  currentSection: 0,
  answers: {},
};

function getStrategyState(kind) {
  return readScopedJson(strategyStateKeys[kind], null) || null;
}

function setStrategyState(kind, value) {
  writeScopedJson(strategyStateKeys[kind], value);
}

function showStrategySection(sectionKey) {
  const safeSection = ['scorecard', 'icp', 'positioning'].includes(sectionKey) ? sectionKey : 'scorecard';
  document.querySelectorAll('.strategy-section').forEach((section) => {
    section.classList.toggle('active', section.dataset.section === safeSection);
  });
  document.querySelectorAll('.strategy-tab-button').forEach((tab) => {
    tab.classList.toggle('active', tab.dataset.tab === safeSection);
  });
  if (window.location.hash !== `#${safeSection}` && safeSection !== 'scorecard') {
    history.replaceState(null, '', `#${safeSection}`);
  }
  if (safeSection === 'scorecard' && window.location.hash) {
    history.replaceState(null, '', window.location.pathname);
  }
}

function formatJsonOutput(data) {
  try {
    return JSON.stringify(data, null, 2);
  } catch (err) {
    return String(data);
  }
}

function formatPositioningOutput(data) {
  if (!data || !data.result) return 'No positioning data available';
  
  const result = data.result;
  const lines = [];
  
  // Add sections in order
  if (result.positioningStatement) {
    lines.push('POSITIONING STATEMENT');
    lines.push(result.positioningStatement);
    lines.push('');
  }
  
  if (result.taglines && Array.isArray(result.taglines)) {
    lines.push('BRAND TAGLINE OPTIONS');
    result.taglines.forEach((tagline, i) => {
      lines.push(`Option ${i + 1}: ${tagline}`);
    });
    lines.push('');
  }
  
  if (result.differentiators && Array.isArray(result.differentiators)) {
    lines.push('KEY DIFFERENTIATORS');
    result.differentiators.forEach((diff, i) => {
      lines.push(`Differentiator ${i + 1}: ${diff}`);
    });
    lines.push('');
  }
  
  if (result.elevatorPitch) {
    lines.push('ELEVATOR PITCH');
    lines.push(result.elevatorPitch);
    lines.push('');
  }
  
  if (result.messaging) {
    lines.push('MESSAGING FRAMEWORK');
    if (result.messaging.coreMessage) {
      lines.push(`Core Message: ${result.messaging.coreMessage}`);
    }
    if (result.messaging.targetAudiences && Array.isArray(result.messaging.targetAudiences)) {
      lines.push('');
      lines.push('Target Audiences:');
      result.messaging.targetAudiences.forEach((aud, i) => {
        lines.push(`  ${i + 1}. ${aud.type}: ${aud.description}`);
      });
    }
    if (result.messaging.supportingMessages && Array.isArray(result.messaging.supportingMessages)) {
      lines.push('');
      lines.push('Supporting Messages:');
      result.messaging.supportingMessages.forEach((msg, i) => {
        lines.push(`  ${i + 1}. ${msg}`);
      });
    }
    if (result.messaging.callToActions && Array.isArray(result.messaging.callToActions)) {
      lines.push('');
      lines.push('Call to Actions:');
      result.messaging.callToActions.forEach((cta, i) => {
        lines.push(`  ${i + 1}. ${cta}`);
      });
    }
    lines.push('');
  }
  
  if (result.conclusion) {
    lines.push('STRATEGIC CONCLUSION');
    lines.push(result.conclusion);
  }
  
  return lines.join('\n');
}

function splitBrandValues(value) {
  if (Array.isArray(value)) return value.map((item) => String(item || '').trim()).filter(Boolean);
  return String(value || '')
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

function buildPositioningReportPayload(saved) {
  if (!saved?.result) return null;
  const createdAt = saved.createdAt || new Date().toISOString();
  return {
    id: saved.id || `pos-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    brandName: saved.brandName || '',
    industry: saved.industry || '',
    usp: saved.usp || '',
    brandTone: saved.tone || saved.brandTone || 'Professional',
    brandValues: splitBrandValues(saved.values || saved.brandValues),
    positioningStatement: saved.result.positioningStatement || '',
    taglines: saved.result.taglines || [],
    differentiators: saved.result.differentiators || [],
    elevatorPitch: saved.result.elevatorPitch || '',
    messaging: saved.result.messaging || {},
    conclusion: saved.result.conclusion || '',
    createdAt,
    savedAt: saved.savedAt || createdAt,
  };
}

function reportToStrategyState(report) {
  if (!report) return null;
  return {
    id: report.id,
    brandName: report.brandName || '',
    industry: report.industry || '',
    usp: report.usp || '',
    tone: report.brandTone || report.tone || 'Professional',
    values: Array.isArray(report.brandValues) ? report.brandValues.join(', ') : report.values || '',
    createdAt: report.createdAt || report.savedAt || new Date().toISOString(),
    savedAt: report.savedAt || report.createdAt || new Date().toISOString(),
    result: {
      positioningStatement: report.positioningStatement || '',
      taglines: report.taglines || [],
      differentiators: report.differentiators || [],
      elevatorPitch: report.elevatorPitch || '',
      messaging: report.messaging || {},
      conclusion: report.conclusion || '',
    },
  };
}

function buildIcpReportPayload(saved) {
  if (!saved?.result) return null;
  const createdAt = saved.createdAt || new Date().toISOString();
  return {
    id: saved.id || `icp-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
    type: 'icp',
    inputs: {
      industry: saved.industry || '',
      audience: saved.audience || '',
      details: saved.details || '',
    },
    result: saved.result || {},
    createdAt,
    savedAt: saved.savedAt || createdAt,
  };
}

function savedIcpReportToState(report) {
  if (!report) return null;
  return {
    id: report.id,
    ...(report.inputs || {}),
    result: report.result || {},
    createdAt: report.createdAt || report.savedAt || new Date().toISOString(),
    savedAt: report.savedAt || report.createdAt || new Date().toISOString(),
  };
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function isScorecardResult(value) {
  return Boolean(value && Array.isArray(value.breakdown) && Number.isFinite(Number(value.overallScore)));
}

function updateSavedDisplay(kind) {
  const saved = getStrategyState(kind);
  const display = document.getElementById(`${kind}SavedDisplay`);
  const text = document.getElementById(`${kind}SavedText`);
  const status = document.getElementById(`${kind}Status`);
  if (!display || !text || !status) return;
  if (saved) {
    display.hidden = false;
    if (kind === 'scorecard') {
      const result = saved.result || saved;
      if (!isScorecardResult(result)) {
        display.hidden = true;
        text.innerHTML = '';
        status.textContent = '';
        return;
      }
      text.innerHTML = renderScorecardReport(result);
    } else if (kind === 'positioning') {
      text.textContent = formatPositioningOutput(saved);
      document.getElementById('positioningSaveBtn')?.toggleAttribute('hidden', false);
      document.getElementById('positioningDeleteBtn')?.toggleAttribute('hidden', !saved.id);
    } else if (kind === 'icp') {
      text.textContent = formatJsonOutput(saved);
      document.getElementById('icpSaveBtn')?.toggleAttribute('hidden', false);
      document.getElementById('icpDeleteBtn')?.toggleAttribute('hidden', !saved.id);
    } else {
      text.textContent = formatJsonOutput(saved);
    }
    status.textContent = 'Saved result available. Use edit to refresh.';
  } else {
    display.hidden = true;
    if (kind === 'scorecard') text.innerHTML = '';
    else text.textContent = '';
    if (kind === 'positioning') {
      document.getElementById('positioningSaveBtn')?.toggleAttribute('hidden', true);
      document.getElementById('positioningDeleteBtn')?.toggleAttribute('hidden', true);
    }
    if (kind === 'icp') {
      document.getElementById('icpSaveBtn')?.toggleAttribute('hidden', true);
      document.getElementById('icpDeleteBtn')?.toggleAttribute('hidden', true);
    }
    status.textContent = '';
  }
}

function wireTabButtons() {
  document.querySelectorAll('.strategy-tab-button').forEach((button) => {
    button.addEventListener('click', () => showStrategySection(button.dataset.tab));
  });
}

function getInputValues(kind) {
  if (kind === 'scorecard') {
    return { answers: { ...scorecardState.answers } };
  }
  if (kind === 'icp') {
    return {
      industry: document.getElementById('icpIndustry')?.value.trim() || '',
      audience: document.getElementById('icpAudience')?.value.trim() || '',
      details: document.getElementById('icpDetails')?.value.trim() || '',
    };
  }
  if (kind === 'positioning') {
    return {
      brandName: document.getElementById('brandName')?.value.trim() || '',
      industry: document.getElementById('brandIndustry')?.value.trim() || '',
      usp: document.getElementById('brandUSP')?.value.trim() || '',
      tone: document.getElementById('brandTone')?.value || 'Professional',
      values: document.getElementById('brandValues')?.value.trim() || '',
    };
  }
  return {};
}

function populateForm(kind, saved) {
  if (!saved) return;
  if (kind === 'scorecard') {
    scorecardState.answers = { ...(saved.answers || {}) };
    scorecardState.currentSection = 0;
    renderScorecardQuiz();
  }
  if (kind === 'icp') {
    document.getElementById('icpIndustry').value = saved.industry || '';
    document.getElementById('icpAudience').value = saved.audience || '';
    document.getElementById('icpDetails').value = saved.details || '';
  }
  if (kind === 'positioning') {
    document.getElementById('brandName').value = saved.brandName || '';
    document.getElementById('brandIndustry').value = saved.industry || '';
    document.getElementById('brandUSP').value = saved.usp || '';
    document.getElementById('brandTone').value = saved.tone || 'Professional';
    document.getElementById('brandValues').value = saved.values || '';
  }
}

function setLoading(kind, isLoading, label) {
  const status = document.getElementById(`${kind}Status`);
  if (!status) return;
  status.textContent = isLoading ? label : '';
}

function getQuestionId(sectionIndex, questionIndex) {
  return `${scorecardSections[sectionIndex].key}-${questionIndex}`;
}

function getChoiceScore(choiceKey) {
  return scorecardChoices.find((choice) => choice.key === choiceKey)?.score || 0;
}

function getAnsweredCount() {
  return Object.keys(scorecardState.answers).filter((key) => scorecardState.answers[key]).length;
}

function getSectionAnsweredCount(sectionIndex) {
  return scorecardSections[sectionIndex].questions.filter((_, questionIndex) => {
    return Boolean(scorecardState.answers[getQuestionId(sectionIndex, questionIndex)]);
  }).length;
}

function isSectionComplete(sectionIndex) {
  return getSectionAnsweredCount(sectionIndex) === scorecardSections[sectionIndex].questions.length;
}

function getSectionStatus(score) {
  if (score >= 21) return { label: 'Strong', color: '#3ddc84' };
  if (score >= 13) return { label: 'Development', color: '#ffd23f' };
  return { label: 'Needs Work', color: '#ff6978' };
}

function getOverallStatus(score) {
  if (score >= 125) return { label: 'Strong Brand', color: '#3ddc84' };
  if (score >= 75) return { label: 'Growing Brand', color: '#ffd23f' };
  return { label: 'Brand Needs Attention', color: '#ff6978' };
}

function buildScorecardInsights(breakdown) {
  const insights = [];
  const strong = breakdown.filter((item) => item.score >= 21);
  const needsWork = breakdown.filter((item) => item.score <= 12);
  const development = breakdown.filter((item) => item.score >= 13 && item.score <= 20);

  strong.forEach((item) => {
    if (item.key === 'voice') insights.push('Your Brand Voice is strong and recognizable.');
    else insights.push(`Your ${item.title} is performing strongly.`);
  });

  needsWork.forEach((item) => {
    if (item.key === 'differentiation') {
      insights.push('Your Differentiation score suggests your positioning may not be clear enough.');
    } else if (item.key === 'consistency') {
      insights.push('Improving consistency across platforms can strengthen audience trust.');
    } else {
      insights.push(`Your ${item.title} needs focused attention before it can support stronger growth.`);
    }
  });

  development.slice(0, 2).forEach((item) => {
    insights.push(`${item.title} is developing, but tightening this area can make the overall brand feel more confident.`);
  });

  if (!insights.length) {
    insights.push('Your brand has a balanced foundation. Keep refining weaker dimensions to increase trust and recall.');
  }

  return insights.slice(0, 5);
}

function calculateScorecardResult() {
  const breakdown = scorecardSections.map((section, sectionIndex) => {
    const score = section.questions.reduce((total, _, questionIndex) => {
      return total + getChoiceScore(scorecardState.answers[getQuestionId(sectionIndex, questionIndex)]);
    }, 0);
    const status = getSectionStatus(score);
    return {
      key: section.key,
      title: section.title,
      icon: section.icon,
      score,
      maxScore: 25,
      status: status.label,
      color: status.color,
    };
  });
  const overallScore = breakdown.reduce((total, item) => total + item.score, 0);
  const overallStatus = getOverallStatus(overallScore);
  return {
    overallScore,
    maxScore: 150,
    status: overallStatus.label,
    color: overallStatus.color,
    breakdown,
    insights: buildScorecardInsights(breakdown),
    completedAt: new Date().toISOString(),
  };
}

function renderScorecardReport(result) {
  if (!result || !Array.isArray(result.breakdown)) return '';
  const scoreAngle = Math.round((Number(result.overallScore || 0) / 150) * 360);
  const breakdownHtml = result.breakdown.map((item) => {
    const width = Math.round((Number(item.score || 0) / 25) * 100);
    return `
      <div class="scorecard-breakdown-row" style="--status-color: ${escapeHtml(item.color)}">
        <div class="scorecard-breakdown-top">
          <span class="scorecard-breakdown-name">${escapeHtml(item.icon)} ${escapeHtml(item.title)}</span>
          <span><span class="scorecard-breakdown-score">${escapeHtml(item.score)}</span> <span class="scorecard-status-pill">${escapeHtml(item.status)}</span></span>
        </div>
        <div class="scorecard-meter"><span style="width: ${width}%"></span></div>
      </div>
    `;
  }).join('');
  const insightsHtml = (result.insights || []).map((insight) => `<li>${escapeHtml(insight)}</li>`).join('');
  return `
    <div class="scorecard-report-hero">
      <div class="scorecard-total" style="--score-angle: ${scoreAngle}deg; --score-color: ${escapeHtml(result.color)}">
        <div class="scorecard-total-content">
          <span class="scorecard-total-score">${escapeHtml(result.overallScore)}</span>
          <span class="scorecard-total-label">/150</span>
        </div>
      </div>
      <div>
        <h2 class="scorecard-report-title">${escapeHtml(result.status)}</h2>
        <p class="scorecard-report-summary">Based on your 30 answers across 6 brand dimensions. Use the lowest scoring dimensions as your next improvement priorities.</p>
      </div>
    </div>
    <div class="scorecard-breakdown">${breakdownHtml}</div>
    <ul class="scorecard-insights">${insightsHtml}</ul>
  `;
}

function renderScorecardQuiz() {
  const quiz = document.getElementById('scorecardQuiz');
  if (!quiz) return;
  const section = scorecardSections[scorecardState.currentSection];
  const totalQuestions = scorecardSections.reduce((total, item) => total + item.questions.length, 0);
  const answeredCount = getAnsweredCount();
  const progress = Math.round((answeredCount / totalQuestions) * 100);

  document.getElementById('scorecardStepLabel').textContent = `Dimension ${scorecardState.currentSection + 1} of ${scorecardSections.length} - ${section.title}`;
  document.getElementById('scorecardProgressLabel').textContent = `${progress}% complete`;
  document.getElementById('scorecardProgressFill').style.width = `${progress}%`;
  document.getElementById('scorecardSectionIcon').textContent = section.icon;
  document.getElementById('scorecardSectionTitle').textContent = section.title;
  document.getElementById('scorecardSectionSubtitle').textContent = section.subtitle;

  const tabs = document.getElementById('scorecardDimTabs');
  tabs.innerHTML = scorecardSections.map((item, index) => {
    const classes = [
      'scorecard-dim-tab',
      index === scorecardState.currentSection ? 'active' : '',
      isSectionComplete(index) ? 'complete' : '',
    ].filter(Boolean).join(' ');
    return `<button type="button" class="${classes}" data-section-index="${index}" title="${escapeHtml(item.title)}">${escapeHtml(item.icon)}</button>`;
  }).join('');

  const questions = document.getElementById('scorecardQuestions');
  questions.innerHTML = section.questions.map((question, questionIndex) => {
    const questionId = getQuestionId(scorecardState.currentSection, questionIndex);
    const selected = scorecardState.answers[questionId];
    const options = scorecardChoices.map((choice) => {
      const isSelected = selected === choice.key;
      return `<button type="button" class="scorecard-option ${isSelected ? 'selected' : ''}" data-question-id="${questionId}" data-choice="${choice.key}">${choice.key}: ${choice.label}</button>`;
    }).join('');
    return `
      <div class="scorecard-question">
        <div class="scorecard-question-label">${questionIndex + 1}. ${escapeHtml(question)}</div>
        <div class="scorecard-options">${options}</div>
      </div>
    `;
  }).join('');

  document.getElementById('scorecardBackBtn').disabled = scorecardState.currentSection === 0;
  document.getElementById('scorecardNextBtn').textContent = scorecardState.currentSection === scorecardSections.length - 1 ? 'View Report' : 'Next Section';
}

function completeScorecard() {
  const statusLabel = document.getElementById('scorecardStatus');
  if (getAnsweredCount() < 30) {
    const firstIncomplete = scorecardSections.findIndex((_, index) => !isSectionComplete(index));
    scorecardState.currentSection = Math.max(0, firstIncomplete);
    renderScorecardQuiz();
    statusLabel.textContent = 'Answer all 30 questions to generate your brand score.';
    return;
  }
  const result = calculateScorecardResult();
  setStrategyState('scorecard', { answers: { ...scorecardState.answers }, result });
  updateSavedDisplay('scorecard');
  document.getElementById('scorecardQuiz').hidden = true;
  document.getElementById('scorecardEditBtn').hidden = false;
  statusLabel.textContent = 'Brand score generated and saved.';
}

function wireScorecardQuiz() {
  document.getElementById('scorecardDimTabs')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-section-index]');
    if (!button) return;
    scorecardState.currentSection = Number(button.dataset.sectionIndex || 0);
    renderScorecardQuiz();
  });

  document.getElementById('scorecardQuestions')?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-question-id][data-choice]');
    if (!button) return;
    scorecardState.answers[button.dataset.questionId] = button.dataset.choice;
    document.getElementById('scorecardStatus').textContent = '';
    renderScorecardQuiz();
  });

  document.getElementById('scorecardBackBtn')?.addEventListener('click', () => {
    scorecardState.currentSection = Math.max(0, scorecardState.currentSection - 1);
    renderScorecardQuiz();
  });

  document.getElementById('scorecardNextBtn')?.addEventListener('click', () => {
    if (!isSectionComplete(scorecardState.currentSection)) {
      document.getElementById('scorecardStatus').textContent = 'Complete this section before moving on.';
      return;
    }
    if (scorecardState.currentSection === scorecardSections.length - 1) {
      completeScorecard();
      return;
    }
    scorecardState.currentSection += 1;
    document.getElementById('scorecardStatus').textContent = '';
    renderScorecardQuiz();
  });
}

async function generateStrategy(kind) {
  if (kind === 'scorecard') {
    completeScorecard();
    return;
  }

  const statusLabel = document.getElementById(`${kind}Status`);
  if (statusLabel) {
    statusLabel.textContent = 'Generating content...';
  }

  const inputs = getInputValues(kind);
  if (kind === 'icp' && !inputs.industry && !inputs.audience) {
    statusLabel.textContent = 'Provide industry or target audience to build ICP.';
    return;
  }
  if (kind === 'positioning' && !inputs.brandName) {
    statusLabel.textContent = 'Brand name is required for positioning.';
    return;
  }

  try {
    const response = await fetch('/api/strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: kind, inputs }),
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.message || 'Unable to generate strategy result.');
    }
    const savedPayload = { ...inputs, result: result.result, createdAt: new Date().toISOString() };
    setStrategyState(kind, savedPayload);
    updateSavedDisplay(kind);
    populateForm(kind, savedPayload);
    statusLabel.textContent = result.notice || (kind === 'icp'
      ? 'Generated successfully. Use Save to store this ICP in your dashboard.'
      : 'Generated successfully. Use Save to store this report in your dashboard.');
  } catch (error) {
    statusLabel.textContent = error.message || 'Generation failed. Please try again.';
  }
}

async function saveIcpReport() {
  const statusLabel = document.getElementById('icpStatus');
  const saved = getStrategyState('icp');
  const report = buildIcpReportPayload(saved);
  if (!report) {
    statusLabel.textContent = 'Generate an ICP before saving.';
    return;
  }

  try {
    statusLabel.textContent = 'Saving ICP...';
    const response = await fetch('/api/strategy/saved', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to save ICP.');
    const nextSaved = savedIcpReportToState(result.report);
    setStrategyState('icp', nextSaved);
    updateSavedDisplay('icp');
    statusLabel.textContent = 'ICP saved to your dashboard.';
  } catch (error) {
    statusLabel.textContent = error.message || 'Failed to save ICP.';
  }
}

async function deleteIcpReport() {
  const statusLabel = document.getElementById('icpStatus');
  const saved = getStrategyState('icp');
  if (!saved?.id) {
    setStrategyState('icp', null);
    updateSavedDisplay('icp');
    return;
  }
  const confirmed = window.confirm('Delete this saved ICP permanently?');
  if (!confirmed) return;

  try {
    statusLabel.textContent = 'Deleting ICP...';
    const response = await fetch('/api/strategy/saved?type=icp', { method: 'DELETE' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to delete ICP.');
    setStrategyState('icp', null);
    updateSavedDisplay('icp');
    statusLabel.textContent = 'ICP deleted.';
  } catch (error) {
    statusLabel.textContent = error.message || 'Failed to delete ICP.';
  }
}

async function savePositioningReport() {
  const statusLabel = document.getElementById('positioningStatus');
  const saved = getStrategyState('positioning');
  const report = buildPositioningReportPayload(saved);
  if (!report) {
    statusLabel.textContent = 'Generate positioning before saving.';
    return;
  }
  if (!report.brandName || !report.industry || !report.usp || report.brandValues.length < 1) {
    statusLabel.textContent = 'Brand name, industry, USP, and brand values are required before saving.';
    return;
  }

  try {
    statusLabel.textContent = 'Saving positioning report...';
    const response = await fetch('/api/positioning/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to save positioning report.');
    const nextSaved = { ...saved, id: report.id, savedAt: new Date().toISOString() };
    setStrategyState('positioning', nextSaved);
    updateSavedDisplay('positioning');
    statusLabel.textContent = 'Positioning saved to your dashboard.';
  } catch (error) {
    statusLabel.textContent = error.message || 'Failed to save positioning report.';
  }
}

async function deletePositioningReport() {
  const statusLabel = document.getElementById('positioningStatus');
  const saved = getStrategyState('positioning');
  if (!saved?.id) {
    setStrategyState('positioning', null);
    updateSavedDisplay('positioning');
    return;
  }
  const confirmed = window.confirm('Delete this saved positioning report permanently?');
  if (!confirmed) return;

  try {
    statusLabel.textContent = 'Deleting positioning report...';
    const response = await fetch(`/api/positioning/delete/${encodeURIComponent(saved.id)}`, {
      method: 'DELETE',
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message || 'Unable to delete positioning report.');
    setStrategyState('positioning', null);
    updateSavedDisplay('positioning');
    statusLabel.textContent = 'Positioning report deleted.';
  } catch (error) {
    statusLabel.textContent = error.message || 'Failed to delete positioning report.';
  }
}

async function hydrateSavedPositioningReports() {
  try {
    const response = await fetch('/api/positioning/reports');
    if (!response.ok) return;
    const data = await response.json();
    const latest = (data.reports || [])
      .sort((a, b) => new Date(b.savedAt || b.createdAt || 0) - new Date(a.savedAt || a.createdAt || 0))[0];
    if (!latest) return;
    const local = getStrategyState('positioning');
    if (!local || new Date(latest.savedAt || latest.createdAt || 0) >= new Date(local.savedAt || local.createdAt || 0)) {
      const normalized = reportToStrategyState(latest);
      setStrategyState('positioning', normalized);
      populateForm('positioning', normalized);
      updateSavedDisplay('positioning');
    }
  } catch (error) {
    // The local strategy state still works if saved reports cannot be loaded.
  }
}

async function hydrateSavedIcpReport() {
  try {
    const response = await fetch('/api/strategy/saved?type=icp');
    if (!response.ok) return;
    const data = await response.json();
    if (!data.report) return;
    const local = getStrategyState('icp');
    if (!local || new Date(data.report.savedAt || data.report.createdAt || 0) >= new Date(local.savedAt || local.createdAt || 0)) {
      const normalized = savedIcpReportToState(data.report);
      setStrategyState('icp', normalized);
      populateForm('icp', normalized);
      updateSavedDisplay('icp');
    }
  } catch (error) {
    // Local ICP state still works if the saved report cannot be loaded.
  }
}

function wireGenerateButtons() {
  document.getElementById('generateIcpBtn')?.addEventListener('click', () => generateStrategy('icp'));
  document.getElementById('generatePositioningBtn')?.addEventListener('click', () => generateStrategy('positioning'));
}

function wireEditButtons() {
  const copySaved = async (kind, buttonId) => {
    const target = document.getElementById(`${kind}SavedText`);
    const text = target?.textContent || '';
    if (!text.trim()) return;
    await navigator.clipboard.writeText(text);
    const button = document.getElementById(buttonId);
    const original = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = original; }, 1200);
  };
  document.getElementById('icpCopyBtn')?.addEventListener('click', () => copySaved('icp', 'icpCopyBtn'));
  document.getElementById('icpSaveBtn')?.addEventListener('click', saveIcpReport);
  document.getElementById('icpDeleteBtn')?.addEventListener('click', deleteIcpReport);
  document.getElementById('positioningCopyBtn')?.addEventListener('click', () => copySaved('positioning', 'positioningCopyBtn'));
  document.getElementById('positioningSaveBtn')?.addEventListener('click', savePositioningReport);
  document.getElementById('positioningDeleteBtn')?.addEventListener('click', deletePositioningReport);
  document.getElementById('scorecardEditBtn')?.addEventListener('click', () => {
    const saved = getStrategyState('scorecard');
    if (saved) populateForm('scorecard', saved);
    document.getElementById('scorecardQuiz').hidden = false;
    document.getElementById('scorecardSavedDisplay').hidden = true;
    document.getElementById('scorecardEditBtn').hidden = true;
    document.getElementById('scorecardStatus').textContent = '';
    showStrategySection('scorecard');
  });
  document.getElementById('icpEditBtn')?.addEventListener('click', () => {
    const saved = getStrategyState('icp');
    if (saved) populateForm('icp', saved);
    showStrategySection('icp');
  });
  document.getElementById('positioningEditBtn')?.addEventListener('click', () => {
    const saved = getStrategyState('positioning');
    if (saved) populateForm('positioning', saved);
    showStrategySection('positioning');
  });
}

function hydrateStrategyPage() {
  ['scorecard', 'icp', 'positioning'].forEach((kind) => updateSavedDisplay(kind));
  const savedPositioning = getStrategyState('positioning');
  if (savedPositioning) populateForm('positioning', savedPositioning);
  const savedIcp = getStrategyState('icp');
  if (savedIcp) populateForm('icp', savedIcp);
  const savedScorecard = getStrategyState('scorecard');
  if (savedScorecard) populateForm('scorecard', savedScorecard);
  renderScorecardQuiz();
  if (isScorecardResult(savedScorecard?.result)) {
    document.getElementById('scorecardQuiz').hidden = true;
    document.getElementById('scorecardEditBtn').hidden = false;
  }
  hydrateSavedIcpReport();
  hydrateSavedPositioningReports();
  const initialSection = window.location.hash.replace('#', '');
  if (initialSection) showStrategySection(initialSection);
}

document.addEventListener('DOMContentLoaded', () => {
  wireTabButtons();
  wireScorecardQuiz();
  wireGenerateButtons();
  wireEditButtons();
  hydrateStrategyPage();
});

window.addEventListener('hashchange', () => {
  showStrategySection(window.location.hash.replace('#', ''));
});

