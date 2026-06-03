(function () {
  const pageTitle = document.getElementById('brandPageTitle');
  const pageSubtitle = document.getElementById('brandPageSubtitle');
  const toolMeta = {
    voice: {
      title: 'Brand Voice Builder',
      subtitle: "Define your brand's tone and personality",
    },
    tagline: {
      title: 'Tagline Generator',
      subtitle: 'Crafted taglines that stick',
    },
  };

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function setActiveTool(tool) {
    document.querySelectorAll('[data-tool]').forEach((section) => {
      section.classList.toggle('active', section.dataset.tool === tool);
    });
    document.querySelectorAll('[data-tool-tab]').forEach((button) => {
      button.classList.toggle('active', button.dataset.toolTab === tool);
    });
    pageTitle.textContent = toolMeta[tool].title;
    pageSubtitle.textContent = toolMeta[tool].subtitle;
  }

  async function requestBrandTool(type, inputs) {
    const response = await fetch('/api/brand', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify({ type, inputs }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || 'Generation failed.');
    return data.result;
  }

  function writeScoped(key, value) {
    const writer = window.writeScopedJson;
    if (typeof writer === 'function') {
      writer(key, value);
      return;
    }
    localStorage.setItem(key, JSON.stringify(value));
  }

  function readScoped(key, fallback = null) {
    const reader = window.readScopedJson;
    if (typeof reader === 'function') return reader(key, fallback);
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  async function copyText(text, button) {
    const value = String(text || '').trim();
    if (!value) {
      setStatus(button?.id?.includes('Voice') ? 'voiceStatus' : 'taglineStatus', 'Nothing to copy yet.', true);
      return;
    }
    await navigator.clipboard.writeText(value);
    const original = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = original; }, 1200);
  }

  function flashSaved(button) {
    const original = button.textContent;
    button.textContent = 'Saved';
    setTimeout(() => { button.textContent = original; }, 1200);
  }

  function voiceText(result) {
    if (!result) return '';
    return [
      `Voice Summary: ${result.summary || ''}`,
      `Personality: ${result.personality || ''}`,
      `Do: ${(result.dos || []).join(', ')}`,
      `Do Not: ${(result.donts || []).join(', ')}`,
      `Signature Phrases: ${Array.isArray(result.phrasesToUse) ? result.phrasesToUse.join(', ') : result.phrasesToUse || ''}`,
      `Sample Copy: ${result.sampleCopy || ''}`,
    ].join('\n\n');
  }

  function taglinesText(result) {
    return (Array.isArray(result?.taglines) ? result.taglines : []).join('\n');
  }

  function setStatus(id, message, isError = false) {
    const status = document.getElementById(id);
    status.textContent = message;
    status.classList.toggle('error', isError);
  }

  function renderVoiceGuide(result) {
    const container = document.getElementById('voiceResults');
    const doList = (items) => (Array.isArray(items) ? items : []).map((item) => `<li>${escapeHtml(item)}</li>`).join('');
    const phrases = Array.isArray(result.phrasesToUse) ? result.phrasesToUse.join(', ') : result.phrasesToUse;
    container.innerHTML = `
      <article class="result-card"><h3>Voice Summary</h3><p>${escapeHtml(result.summary || '')}</p></article>
      <article class="result-card"><h3>Personality</h3><p>${escapeHtml(result.personality || '')}</p></article>
      <article class="result-card"><h3>Do</h3><ul>${doList(result.dos)}</ul></article>
      <article class="result-card"><h3>Do Not</h3><ul>${doList(result.donts)}</ul></article>
      <article class="result-card"><h3>Signature Phrases</h3><p>${escapeHtml(phrases || '')}</p></article>
      <article class="result-card"><h3>Sample Copy</h3><p>${escapeHtml(result.sampleCopy || '')}</p></article>
    `;
    container.hidden = false;
  }

  function renderTaglines(result) {
    const container = document.getElementById('taglineResults');
    const taglines = Array.isArray(result.taglines) ? result.taglines : [];
    container.innerHTML = taglines.map((tagline) => `
      <div class="tagline-item">
        <span>${escapeHtml(tagline)}</span>
        <button class="copy-btn" type="button" data-copy="${escapeHtml(tagline)}">Copy</button>
      </div>
    `).join('');
    container.hidden = false;
  }

  async function buildVoiceGuide() {
    const button = document.getElementById('buildVoiceBtn');
    const inputs = {
      brandName: document.getElementById('voiceBrandName').value.trim(),
      industry: document.getElementById('voiceIndustry').value.trim(),
      sample: document.getElementById('voiceSample').value.trim(),
      dials: {
        formality: Number(document.getElementById('formalityDial').value),
        energy: Number(document.getElementById('energyDial').value),
        humor: Number(document.getElementById('humorDial').value),
        authority: Number(document.getElementById('authorityDial').value),
      },
    };
    if (!inputs.brandName || !inputs.industry) {
      setStatus('voiceStatus', 'Add a brand name and industry first.', true);
      return;
    }
    button.disabled = true;
    setStatus('voiceStatus', 'Building brand voice guide...');
    try {
      const result = await requestBrandTool('voice', inputs);
      renderVoiceGuide(result);
      writeScoped('brand:voice', { inputs, result, savedAt: new Date().toISOString() });
      setStatus('voiceStatus', 'Brand voice guide generated and saved locally.');
    } catch (error) {
      setStatus('voiceStatus', error.message || 'Could not build the voice guide.', true);
    } finally {
      button.disabled = false;
    }
  }

  async function generateTaglines() {
    const button = document.getElementById('generateTaglinesBtn');
    const inputs = {
      brandName: document.getElementById('taglineBrandName').value.trim(),
      industry: document.getElementById('taglineIndustry').value.trim(),
      usp: document.getElementById('taglineUsp').value.trim(),
      style: document.getElementById('taglineStyle').value,
    };
    if (!inputs.brandName || !inputs.industry || !inputs.usp) {
      setStatus('taglineStatus', 'Add brand name, industry, and USP first.', true);
      return;
    }
    button.disabled = true;
    setStatus('taglineStatus', 'Generating taglines...');
    try {
      const result = await requestBrandTool('tagline', inputs);
      renderTaglines(result);
      writeScoped('brand:taglines', { inputs, result, savedAt: new Date().toISOString() });
      setStatus('taglineStatus', 'Generated 10 tagline options.');
    } catch (error) {
      setStatus('taglineStatus', error.message || 'Could not generate taglines.', true);
    } finally {
      button.disabled = false;
    }
  }

  document.querySelectorAll('[data-tool-tab]').forEach((button) => {
    button.addEventListener('click', () => setActiveTool(button.dataset.toolTab));
  });
  document.querySelector('[data-back]')?.addEventListener('click', () => {
    window.location.href = 'featurehub.html';
  });
  document.getElementById('buildVoiceBtn')?.addEventListener('click', buildVoiceGuide);
  document.getElementById('generateTaglinesBtn')?.addEventListener('click', generateTaglines);
  document.getElementById('saveVoiceBtn')?.addEventListener('click', (event) => {
    const saved = readScoped('brand:voice');
    if (!saved?.result) return setStatus('voiceStatus', 'Generate a voice guide before saving.', true);
    writeScoped('brand:voice', { ...saved, savedAt: new Date().toISOString() });
    flashSaved(event.currentTarget);
    setStatus('voiceStatus', 'Voice guide saved locally.');
  });
  document.getElementById('copyVoiceBtn')?.addEventListener('click', (event) => {
    copyText(voiceText(readScoped('brand:voice')?.result), event.currentTarget);
  });
  document.getElementById('saveTaglinesBtn')?.addEventListener('click', (event) => {
    const saved = readScoped('brand:taglines');
    if (!saved?.result) return setStatus('taglineStatus', 'Generate taglines before saving.', true);
    writeScoped('brand:taglines', { ...saved, savedAt: new Date().toISOString() });
    flashSaved(event.currentTarget);
    setStatus('taglineStatus', 'Taglines saved locally.');
  });
  document.getElementById('copyTaglinesBtn')?.addEventListener('click', (event) => {
    copyText(taglinesText(readScoped('brand:taglines')?.result), event.currentTarget);
  });
  document.getElementById('taglineResults')?.addEventListener('click', async (event) => {
    const button = event.target.closest('[data-copy]');
    if (!button) return;
    await navigator.clipboard.writeText(button.dataset.copy);
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = 'Copy'; }, 1200);
  });

  const savedVoice = readScoped('brand:voice');
  if (savedVoice?.result) {
    renderVoiceGuide(savedVoice.result);
    setStatus('voiceStatus', 'Saved voice guide loaded.');
  }

  const savedTaglines = readScoped('brand:taglines');
  if (savedTaglines?.result) {
    renderTaglines(savedTaglines.result);
    setStatus('taglineStatus', 'Saved taglines loaded.');
  }
})();

