const steps = [
  {
    id: 'fullName',
    section: 'About You',
    title: "What's your full name?",
    helper: 'So the workspace outputs can address you naturally.',
    type: 'text',
    placeholder: 'e.g. Sara Ahmed',
    required: true,
  },
  {
    id: 'businessName',
    section: 'Business Profile',
    title: 'What is your business or brand name?',
    type: 'text',
    placeholder: 'e.g. Studio Nova',
    required: true,
  },
  {
    id: 'businessDescription',
    section: 'Business Profile',
    title: 'Briefly describe what your business does.',
    helper: 'One to three sentences is perfect.',
    type: 'textarea',
    placeholder: 'We help...',
    required: true,
  },
  {
    id: 'industries',
    section: 'Business Profile',
    title: 'What industry are you in?',
    helper: 'Choose all that apply.',
    type: 'multiselect',
    required: true,
    min: 1,
    options: [
      'Retail & E-commerce',
      'Food & Hospitality',
      'Health, Wellness & Fitness',
      'Beauty & Personal Care Services',
      'Real Estate & Construction',
      'Professional Services',
      'Technology & SaaS',
      'Marketing',
      'Education & Training',
      'Events & Entertainment',
      'Automotive',
      'Manufacturing & Industrial',
      'Nonprofit & Community',
      'Other',
    ],
    otherId: 'industryOther',
  },
  {
    id: 'location',
    section: 'Business Profile',
    title: 'Where is your business based?',
    helper: 'Country and city are enough.',
    type: 'text',
    placeholder: 'e.g. UAE, Dubai',
    required: true,
  },
  {
    id: 'businessStage',
    section: 'Business Profile',
    title: 'What stage is your business in?',
    type: 'choice',
    required: true,
    options: ['Pre-launch', 'Just launched (<1 yr)', 'Growing (1-3 yrs)', 'Established (3+ yrs)'],
  },
  {
    id: 'personalityTraits',
    section: 'Brand Voice & Identity',
    title: "Pick 3-5 words that describe your brand's personality.",
    type: 'multiselect',
    required: true,
    min: 3,
    max: 5,
    options: ['Bold', 'Playful', 'Authoritative', 'Warm', 'Professional', 'Edgy', 'Inspirational', 'Minimalist', 'Luxurious', 'Other'],
    otherId: 'personalityOther',
  },
  {
    id: 'toneFormality',
    section: 'Brand Voice & Identity',
    title: 'How formal should your tone be?',
    helper: '1 is very casual. 10 is very formal.',
    type: 'slider',
    min: 1,
    max: 10,
    defaultValue: 5,
    required: true,
  },
  {
    id: 'preferredPhrases',
    section: 'Brand Voice & Identity',
    title: 'Are there words or phrases you always want to use?',
    helper: 'Optional. Add brand language, product names, or signature phrases.',
    type: 'textarea',
    placeholder: 'e.g. practical luxury, made for founders',
  },
  {
    id: 'restrictedPhrases',
    section: 'Brand Voice & Identity',
    title: "Are there words or phrases you'd never use?",
    helper: 'Optional. This helps keep generated content on-brand.',
    type: 'textarea',
    placeholder: 'e.g. cheap, hustle harder, guru',
  },
  {
    id: 'uniqueValueProposition',
    section: 'Brand Voice & Identity',
    title: "What's your unique value proposition?",
    helper: 'What makes you the obvious choice?',
    type: 'textarea',
    placeholder: 'Customers choose us because...',
    required: true,
  },
  {
    id: 'brandAssets',
    section: 'Brand Voice & Identity',
    title: 'Any quick brand assets you want to add now?',
    helper: 'Optional. You can skip and finish your full brand kit in profile settings later.',
    type: 'assets',
  },
];

const state = {
  index: 0,
  answers: {
    toneFormality: 5,
    brandColors: ['#7c5dfa', '#00d9ff'],
  },
  saveTimer: null,
  isSaving: false,
};

const questionWrap = document.getElementById('questionWrap');
const sectionEl = document.getElementById('questionSection');
const titleEl = document.getElementById('questionTitle');
const helperEl = document.getElementById('questionHelper');
const controlEl = document.getElementById('questionControl');
const progressBar = document.getElementById('progressBar');
const progressLabel = document.getElementById('progressLabel');
const backButton = document.getElementById('backButton');
const nextButton = document.getElementById('nextButton');
const saveStatus = document.getElementById('saveStatus');

function setAnswer(id, value) {
  state.answers[id] = value;
  scheduleSave();
}

function getStepValue(step) {
  if (step.type === 'assets') {
    return {
      brandColors: state.answers.brandColors || [],
      logo: state.answers.logo || null,
    };
  }
  return state.answers[step.id];
}

function updateProgress() {
  const percent = Math.round(((state.index + 1) / steps.length) * 100);
  progressBar.style.width = `${percent}%`;
  progressLabel.textContent = `${percent}%`;
  backButton.disabled = state.index === 0;
  nextButton.textContent = state.index === steps.length - 1 ? 'Finish' : 'Continue';
}

function render() {
  const step = steps[state.index];
  questionWrap.classList.remove('is-visible');
  window.setTimeout(() => {
    sectionEl.textContent = step.section;
    titleEl.textContent = step.title;
    helperEl.textContent = step.helper || '';
    helperEl.hidden = !step.helper;
    controlEl.innerHTML = '';
    controlEl.appendChild(renderControl(step));
    updateProgress();
    questionWrap.classList.add('is-visible');
    const focusTarget = controlEl.querySelector('input:not([type="color"]), textarea, button');
    focusTarget?.focus();
  }, 120);
}

function renderControl(step) {
  if (step.type === 'textarea') return renderTextarea(step);
  if (step.type === 'choice') return renderChoice(step);
  if (step.type === 'multiselect') return renderMultiselect(step);
  if (step.type === 'slider') return renderSlider(step);
  if (step.type === 'assets') return renderAssets(step);
  return renderText(step);
}

function renderText(step) {
  const input = document.createElement('input');
  input.className = 'onboarding-input';
  input.type = 'text';
  input.placeholder = step.placeholder || '';
  input.value = state.answers[step.id] || '';
  input.autocomplete = step.id === 'fullName' ? 'name' : 'off';
  input.addEventListener('input', () => setAnswer(step.id, input.value));
  return input;
}

function renderTextarea(step) {
  const input = document.createElement('textarea');
  input.className = 'onboarding-input onboarding-textarea';
  input.placeholder = step.placeholder || '';
  input.value = state.answers[step.id] || '';
  input.rows = 5;
  input.addEventListener('input', () => setAnswer(step.id, input.value));
  return input;
}

function renderChoice(step) {
  const wrap = document.createElement('div');
  wrap.className = 'onboarding-chipgrid';
  step.options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'onboarding-chip';
    button.textContent = option;
    button.classList.toggle('selected', state.answers[step.id] === option);
    button.addEventListener('click', () => {
      setAnswer(step.id, option);
      render();
    });
    wrap.appendChild(button);
  });
  return wrap;
}

function renderMultiselect(step) {
  const wrap = document.createElement('div');
  const grid = document.createElement('div');
  grid.className = 'onboarding-chipgrid';
  const selected = Array.isArray(state.answers[step.id]) ? state.answers[step.id] : [];

  step.options.forEach((option) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'onboarding-chip';
    button.textContent = option;
    button.classList.toggle('selected', selected.includes(option));
    button.addEventListener('click', () => {
      const next = selected.includes(option)
        ? selected.filter((item) => item !== option)
        : [...selected, option].slice(0, step.max || 20);
      setAnswer(step.id, next);
      render();
    });
    grid.appendChild(button);
  });

  wrap.appendChild(grid);
  if (selected.includes('Other')) {
    const other = document.createElement('input');
    other.className = 'onboarding-input onboarding-other';
    other.type = 'text';
    other.placeholder = 'Please specify';
    other.value = state.answers[step.otherId] || '';
    other.addEventListener('input', () => setAnswer(step.otherId, other.value));
    wrap.appendChild(other);
  }
  return wrap;
}

function renderSlider(step) {
  const wrap = document.createElement('div');
  wrap.className = 'onboarding-slider-wrap';
  const value = Number(state.answers[step.id] || step.defaultValue || step.min);
  const input = document.createElement('input');
  input.type = 'range';
  input.min = step.min;
  input.max = step.max;
  input.value = value;
  input.className = 'onboarding-slider';
  const output = document.createElement('div');
  output.className = 'onboarding-slider-value';
  output.textContent = value;
  input.addEventListener('input', () => {
    output.textContent = input.value;
    setAnswer(step.id, Number(input.value));
  });
  const scale = document.createElement('div');
  scale.className = 'onboarding-scale';
  scale.innerHTML = '<span>Very casual</span><span>Balanced</span><span>Very formal</span>';
  wrap.append(input, output, scale);
  return wrap;
}

function renderAssets() {
  const wrap = document.createElement('div');
  wrap.className = 'onboarding-assets';
  const colors = state.answers.brandColors || ['#7c5dfa', '#00d9ff'];
  const colorRow = document.createElement('div');
  colorRow.className = 'onboarding-color-row';
  colors.forEach((color, index) => {
    const picker = document.createElement('input');
    picker.type = 'color';
    picker.value = color;
    picker.setAttribute('aria-label', `Brand color ${index + 1}`);
    picker.addEventListener('input', () => {
      const next = [...colors];
      next[index] = picker.value;
      setAnswer('brandColors', next);
    });
    colorRow.appendChild(picker);
  });

  const upload = document.createElement('label');
  upload.className = 'onboarding-upload';
  upload.innerHTML = `<span>${state.answers.logo?.name || 'Upload logo'}</span><small>PNG, JPG, SVG under 650KB</small>`;
  const file = document.createElement('input');
  file.type = 'file';
  file.accept = 'image/png,image/jpeg,image/svg+xml';
  file.addEventListener('change', () => handleLogoUpload(file.files?.[0]));
  upload.appendChild(file);

  wrap.append(colorRow, upload);
  return wrap;
}

function handleLogoUpload(file) {
  if (!file) return;
  if (file.size > 650000) {
    alert('Please upload a logo under 650KB.');
    return;
  }
  const reader = new FileReader();
  reader.onload = () => {
    setAnswer('logo', {
      name: file.name,
      type: file.type,
      size: file.size,
      dataUrl: reader.result,
    });
    render();
  };
  reader.readAsDataURL(file);
}

function validateStep(step) {
  if (!step.required) return true;
  const value = state.answers[step.id];
  if (step.type === 'multiselect') return Array.isArray(value) && value.length >= (step.min || 1);
  return String(value || '').trim().length > 0;
}

function collectAnswers() {
  return {
    ...state.answers,
    brandColors: state.answers.brandColors || [],
    logo: state.answers.logo || null,
  };
}

async function saveProgress(completed = false) {
  clearTimeout(state.saveTimer);
  state.isSaving = true;
  saveStatus.textContent = 'Saving...';
  try {
    const response = await fetch('/api/onboarding', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        currentStep: state.index,
        completed,
        answers: collectAnswers(),
      }),
    });
    if (!response.ok) throw new Error('Save failed');
    saveStatus.textContent = 'Saved';
  } catch (error) {
    saveStatus.textContent = 'Not saved';
  } finally {
    state.isSaving = false;
  }
}

function scheduleSave() {
  saveStatus.textContent = 'Saving...';
  clearTimeout(state.saveTimer);
  state.saveTimer = window.setTimeout(() => saveProgress(false), 500);
}

async function loadProgress() {
  try {
    const response = await fetch('/api/onboarding');
    if (!response.ok) throw new Error('Unable to load onboarding');
    const data = await response.json();
    const onboarding = data.onboarding || {};
    state.answers = {
      ...state.answers,
      ...(onboarding.answers || {}),
    };
    state.index = Math.min(Math.max(Number(onboarding.currentStep || 0), 0), steps.length - 1);
    if (onboarding.completed) {
      window.location.href = '/featurehub.html';
      return;
    }
  } catch (error) {
    saveStatus.textContent = 'Offline';
  }
  render();
}

backButton.addEventListener('click', () => {
  if (state.index === 0) return;
  state.index -= 1;
  saveProgress(false);
  render();
});

nextButton.addEventListener('click', async () => {
  const step = steps[state.index];
  if (!validateStep(step)) {
    questionWrap.classList.add('is-shaking');
    window.setTimeout(() => questionWrap.classList.remove('is-shaking'), 260);
    return;
  }

  if (state.index === steps.length - 1) {
    await saveProgress(true);
    window.location.href = '/featurehub.html';
    return;
  }

  state.index += 1;
  await saveProgress(false);
  render();
});

document.addEventListener('keydown', (event) => {
  const active = document.activeElement;
  const isTextarea = active?.tagName === 'TEXTAREA';
  if (event.key === 'Enter' && !event.shiftKey && !isTextarea) {
    event.preventDefault();
    nextButton.click();
  }
  if (event.key === 'Escape') {
    backButton.click();
  }
});

loadProgress();
