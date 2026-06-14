(function () {
  const api = async (path, opts = {}) => {
    const response = await fetch(path, Object.assign({
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
    }, opts));
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.message || data.error || 'Request failed.');
    return data;
  };

  const colorMap = {
    image: '#2563eb',
    video: '#7c3aed',
    carousel: '#ffb020',
    story: '#ec4899',
    reel: '#ef4444',
    text: '#10b981',
  };

  const calendarGrid = document.getElementById('calendarGrid');
  const modal = document.getElementById('scheduleModal');
  const schDate = document.getElementById('schDate');
  const schPlatform = document.getElementById('schPlatform');
  const schAccount = document.getElementById('schAccount');
  const schType = document.getElementById('schType');
  const schTitle = document.getElementById('schTitle');
  const schTopic = document.getElementById('schTopic');
  const schMediaUrl = document.getElementById('schMediaUrl');
  const schCaption = document.getElementById('schCaption');
  const schMedia = document.getElementById('schMedia');
  const schMediaPreview = document.getElementById('schMediaPreview');
  let selectedMedia = null;
  let socialAccounts = [];

  function setButtonLoading(button, isLoading, label = 'Generating...') {
    if (!button) return;
    if (isLoading) {
      button.dataset.defaultText = button.textContent;
      button.textContent = label;
      button.disabled = true;
      button.setAttribute('aria-busy', 'true');
      return;
    }
    button.textContent = button.dataset.defaultText || button.textContent;
    button.disabled = false;
    button.removeAttribute('aria-busy');
    delete button.dataset.defaultText;
  }

  function storageKey(key) {
    return `contentLab:${key}`;
  }

  function readSaved(key, fallback = null) {
    try {
      const raw = localStorage.getItem(storageKey(key));
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeSaved(key, value) {
    localStorage.setItem(storageKey(key), JSON.stringify(value));
  }

  async function copyText(text, button) {
    const value = String(text || '').trim();
    if (!value) {
      alert('Nothing to copy yet.');
      return;
    }
    await navigator.clipboard.writeText(value);
    if (!button) return;
    const original = button.textContent;
    button.textContent = 'Copied';
    setTimeout(() => { button.textContent = original; }, 1200);
  }

  function flashSaved(button) {
    if (!button) return;
    const original = button.textContent;
    button.textContent = 'Saved';
    setTimeout(() => { button.textContent = original; }, 1200);
  }

  function getHooksText() {
    return Array.from(document.querySelectorAll('#hooksList .hook'))
      .map((item) => item.textContent.trim())
      .filter(Boolean)
      .join('\n');
  }

  function getIdeasText() {
    return Array.from(document.querySelectorAll('#ideasGrid .idea'))
      .map((item) => {
        const title = item.querySelector('h4')?.textContent.trim() || '';
        const desc = item.querySelector('p')?.textContent.trim() || '';
        return [title, desc].filter(Boolean).join('\n');
      })
      .filter(Boolean)
      .join('\n\n');
  }

  function toIsoDate(date) {
    return date.toISOString().slice(0, 10);
  }

  function sameDay(a, b) {
    return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }

  function buildFallbackHashtags(text) {
    const words = String(text || '')
      .toLowerCase()
      .replace(/[^a-z0-9\s]/g, ' ')
      .split(/\s+/)
      .filter((word) => word.length > 3)
      .slice(0, 5);
    const tags = Array.from(new Set(words.map((word) => `#${word}`)));
    return tags.length ? tags.join(' ') : '#content #socialmedia #orbit';
  }

  function combineCaptionAndHashtags(caption, hashtags, fallbackText = '') {
    const cleanCaption = String(caption || '').trim();
    const hashtagText = Array.isArray(hashtags) ? hashtags.join(' ') : String(hashtags || '').trim();
    const normalizedHashtags = hashtagText || buildFallbackHashtags(fallbackText || cleanCaption);
    if (/(^|\s)#\w+/.test(cleanCaption)) return cleanCaption;
    return `${cleanCaption}\n\n${normalizedHashtags}`.trim();
  }

  async function deletePost(postId) {
    if (!postId) return;
    if (!confirm('Delete this scheduled post?')) return;
    try {
      await api(`/api/posts/${encodeURIComponent(postId)}`, { method: 'DELETE' });
      fetchAndRender();
    } catch (err) {
      alert(err.message || 'Failed to delete post.');
    }
  }

  function renderCalendar(posts = []) {
    if (!calendarGrid) return;
    calendarGrid.innerHTML = '';
    const today = new Date();
    const year = today.getFullYear();
    const monthNames = Array.from({ length: 12 }, (_, month) =>
      new Date(year, month, 1).toLocaleString(undefined, { month: 'long', year: 'numeric' })
    );
    const weekdays = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    monthNames.forEach((label, month) => {
      const section = document.createElement('section');
      section.className = 'content-month';
      if (month === today.getMonth()) section.id = 'currentMonth';

      const title = document.createElement('h2');
      title.className = 'content-calendar-month';
      title.textContent = label;
      section.appendChild(title);

      const weekdayGrid = document.createElement('div');
      weekdayGrid.className = 'content-weekdays';
      weekdays.forEach((day) => {
        const el = document.createElement('div');
        el.textContent = day;
        weekdayGrid.appendChild(el);
      });
      section.appendChild(weekdayGrid);

      const grid = document.createElement('div');
      grid.className = 'content-calendar-grid';
      const daysInMonth = new Date(year, month + 1, 0).getDate();
      const startOffset = new Date(year, month, 1).getDay();

      for (let i = 0; i < startOffset; i += 1) {
        const blank = document.createElement('div');
        blank.className = 'day blank';
        grid.appendChild(blank);
      }

      for (let day = 1; day <= daysInMonth; day += 1) {
        const date = new Date(year, month, day);
        const iso = toIsoDate(date);
        const el = document.createElement('div');
        el.className = 'day';
        el.dataset.date = iso;
        el.setAttribute('role', 'button');
        el.setAttribute('tabindex', '0');
        if (sameDay(date, today)) el.classList.add('today');

        const dateEl = document.createElement('span');
        dateEl.className = 'date';
        dateEl.textContent = String(day);
        el.appendChild(dateEl);

        posts
          .filter((post) => post.postedAt && sameDay(new Date(post.postedAt), date))
          .forEach((post) => {
            const pill = document.createElement('span');
            pill.className = 'post-pill';
            const type = post.postType || 'image';
            pill.style.background = colorMap[type] || '#334155';
            pill.textContent = `${post.mediaName ? '▣ ' : ''}${post.title} (${post.platform})`;
            pill.addEventListener('click', (event) => {
              event.stopPropagation();
              alert(JSON.stringify(post, null, 2));
            });
            pill.textContent = '';
            const label = document.createElement('span');
            label.className = 'post-pill-text';
            label.textContent = `${post.mediaName ? 'File: ' : ''}${post.title} (${post.platform})`;
            const deleteButton = document.createElement('button');
            deleteButton.type = 'button';
            deleteButton.className = 'post-delete-btn';
            deleteButton.title = 'Delete post';
            deleteButton.setAttribute('aria-label', `Delete ${post.title || 'post'}`);
            deleteButton.textContent = 'x';
            deleteButton.addEventListener('click', (event) => {
              event.stopPropagation();
              deletePost(post.id);
            });
            pill.append(label, deleteButton);
            el.appendChild(pill);
          });

        el.addEventListener('click', () => openScheduleModal(iso));
        el.addEventListener('keydown', (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            openScheduleModal(iso);
          }
        });
        grid.appendChild(el);
      }

      section.appendChild(grid);
      calendarGrid.appendChild(section);
    });

    document.getElementById('currentMonth')?.scrollIntoView({ block: 'center' });
  }

  async function fetchAndRender() {
    if (!calendarGrid) return;
    try {
      const res = await api('/api/posts');
      renderCalendar(res.posts || []);
    } catch (err) {
      renderCalendar([]);
    }
  }

  async function loadSocialAccounts() {
    if (!schAccount) return;
    try {
      const response = await api('/api/social/accounts');
      socialAccounts = Array.isArray(response.accounts) ? response.accounts : [];
    } catch (error) {
      socialAccounts = [];
      console.warn('Unable to load Postiz accounts', error);
    }
    renderAccountOptions();
  }

  function renderAccountOptions() {
    if (!schAccount) return;
    const selectedPlatform = schPlatform?.value || '';
    const matching = socialAccounts.filter((account) => !selectedPlatform || account.platform === selectedPlatform);
    schAccount.innerHTML = '';
    if (!matching.length) {
      const option = document.createElement('option');
      option.value = '';
      option.textContent = socialAccounts.length ? `No ${selectedPlatform} accounts connected` : 'Connect accounts in Postiz first';
      schAccount.appendChild(option);
      return;
    }
    matching.forEach((account) => {
      const option = document.createElement('option');
      option.value = account.accountId;
      option.dataset.platform = account.platform;
      option.textContent = `${account.displayName || account.username || account.platform} - ${account.platform}`;
      schAccount.appendChild(option);
    });
  }

  function resetMedia() {
    selectedMedia = null;
    if (schMedia) schMedia.value = '';
    if (schMediaPreview) schMediaPreview.textContent = 'No media selected';
  }

  function openScheduleModal(isoDate) {
    if (!modal || !schDate || !schPlatform || !schType || !schTitle || !schTopic || !schCaption) return;
    schDate.value = isoDate || toIsoDate(new Date());
    schPlatform.value = 'Instagram';
    schType.value = 'image';
    schTitle.value = '';
    schTopic.value = '';
    if (schMediaUrl) schMediaUrl.value = '';
    schCaption.value = readSaved('calendarCaption', '');
    resetMedia();
    renderAccountOptions();
    modal.style.display = 'flex';
  }

  schPlatform?.addEventListener('change', renderAccountOptions);

  document.getElementById('newPostBtn')?.addEventListener('click', () => openScheduleModal());
  document.getElementById('cancelScheduleBtn')?.addEventListener('click', () => {
    if (modal) modal.style.display = 'none';
  });

  document.getElementById('saveCaptionBtn')?.addEventListener('click', (event) => {
    writeSaved('calendarCaption', schCaption?.value || '');
    flashSaved(event.currentTarget);
  });

  document.getElementById('copyCaptionBtn')?.addEventListener('click', (event) => {
    copyText(schCaption?.value || '', event.currentTarget);
  });

  schMedia?.addEventListener('change', () => {
    const file = schMedia.files?.[0];
    if (!file) return resetMedia();
    const reader = new FileReader();
    reader.onload = () => {
      selectedMedia = {
        mediaName: file.name,
        mediaType: file.type || 'application/octet-stream',
        mediaData: String(reader.result || ''),
      };
      if (schMediaPreview) schMediaPreview.textContent = `${file.name} (${Math.round(file.size / 1024)} KB)`;
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('generateCaptionBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (button.disabled) return;
    const topic = schTopic?.value || schTitle?.value || '';
    try {
      setButtonLoading(button, true, 'Generating...');
      if (schCaption) schCaption.placeholder = 'Generating caption...';
      const res = await api('/api/generate/caption', {
        method: 'POST',
        body: JSON.stringify({
          topic,
          title: schTitle?.value,
          platform: schPlatform?.value,
          postType: schType?.value,
          length: 'short',
        }),
      });
      if (schCaption) {
        schCaption.value = combineCaptionAndHashtags(res.caption || '', res.hashtags, topic || schTitle?.value);
      }
      if (res.notice) alert(res.notice);
    } catch (err) {
      alert(err.message || 'Tell me the topic first, then I can generate a caption.');
    } finally {
      setButtonLoading(button, false);
      if (schCaption) schCaption.placeholder = 'Caption...';
    }
  });

  document.getElementById('saveScheduleBtn')?.addEventListener('click', async () => {
    const captionWithHashtags = combineCaptionAndHashtags(
      schCaption?.value || '',
      '',
      `${schTopic?.value || ''} ${schTitle?.value || ''} ${schPlatform?.value || ''}`
    );
    const payload = {
      platform: schPlatform?.value,
      accountId: schAccount?.value,
      title: schTitle?.value || 'Untitled',
      transcript: captionWithHashtags,
      caption: captionWithHashtags,
      postType: schType?.value,
      scheduledFor: schDate?.value,
    };
    if (schMediaUrl?.value.trim()) {
      payload.mediaUrl = schMediaUrl.value.trim();
      payload.mediaType = schType?.value === 'video' || schType?.value === 'reel' ? 'video' : 'image';
    }
    try {
      if (!payload.accountId) {
        alert('Choose a connected Postiz account before scheduling.');
        return;
      }
      const res = await api('/api/schedule-post', { method: 'POST', body: JSON.stringify(payload) });
      if (res.post && modal) {
        modal.style.display = 'none';
        fetchAndRender();
      }
    } catch (err) {
      alert(err.message || 'Failed to schedule post.');
    }
  });

  document.getElementById('gwWriteBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (button.disabled) return;
    const output = document.getElementById('gwOutput');
    try {
      setButtonLoading(button, true, 'Generating...');
      if (output) {
        output.value = '';
        output.placeholder = 'Generating content...';
      }
      const res = await api('/api/generate/ghost', {
        method: 'POST',
        body: JSON.stringify({
          topic: document.getElementById('gwTopic')?.value,
          platform: document.getElementById('gwPlatform')?.value,
          tone: document.getElementById('gwTone')?.value,
          length: document.getElementById('gwLength')?.value,
          audience: document.getElementById('gwAudience')?.value,
          keyPoints: document.getElementById('gwKeyPoints')?.value,
        }),
      });
      if (output) output.value = `${res.content || ''}\n\nDifferentiation:\n${res.differentiation || ''}`.trim();
      if (res.notice) alert(res.notice);
    } catch (err) {
      alert(err.message || 'Tell me what to write about first.');
    } finally {
      setButtonLoading(button, false);
      if (output) output.placeholder = 'Generated content appears here';
    }
  });

  document.getElementById('gwSaveBtn')?.addEventListener('click', (event) => {
    writeSaved('ghostOutput', document.getElementById('gwOutput')?.value || '');
    flashSaved(event.currentTarget);
  });

  document.getElementById('gwCopyBtn')?.addEventListener('click', (event) => {
    copyText(document.getElementById('gwOutput')?.value || '', event.currentTarget);
  });

  document.getElementById('hkGenerateBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (button.disabled) return;
    const container = document.getElementById('hooksList');
    try {
      setButtonLoading(button, true, 'Generating...');
      if (container) container.innerHTML = '<div class="hook">Generating hooks...</div>';
      const res = await api('/api/generate/hooks', {
        method: 'POST',
        body: JSON.stringify({
          topic: document.getElementById('hkTopic')?.value,
          tone: document.getElementById('hkTone')?.value,
          platform: document.getElementById('hkPlatform')?.value,
          count: 8,
        }),
      });
      if (container) {
        container.innerHTML = '';
        (res.hooks || []).forEach((hook) => {
          const el = document.createElement('div');
          el.className = 'hook';
          el.textContent = hook;
          container.appendChild(el);
        });
      }
      if (res.notice) alert(res.notice);
    } catch (err) {
      alert(err.message || 'Tell me the topic first, then I can generate hooks.');
      if (container) container.innerHTML = '';
    } finally {
      setButtonLoading(button, false);
    }
  });

  document.getElementById('hkSaveBtn')?.addEventListener('click', (event) => {
    writeSaved('hooks', getHooksText());
    flashSaved(event.currentTarget);
  });

  document.getElementById('hkCopyBtn')?.addEventListener('click', (event) => {
    copyText(getHooksText(), event.currentTarget);
  });

  document.getElementById('diGenerateBtn')?.addEventListener('click', async (event) => {
    const button = event.currentTarget;
    if (button.disabled) return;
    const grid = document.getElementById('ideasGrid');
    try {
      setButtonLoading(button, true, 'Generating...');
      if (grid) grid.innerHTML = '<div class="idea"><h4>Generating ideas...</h4><p>Please wait while your ideas are created.</p></div>';
      const res = await api('/api/generate/ideas', {
        method: 'POST',
        body: JSON.stringify({
          industry: document.getElementById('diIndustry')?.value,
          platform: document.getElementById('diPlatform')?.value,
          goal: document.getElementById('diGoal')?.value,
          count: 10,
        }),
      });
      if (grid) {
        grid.innerHTML = '';
        (res.ideas || []).forEach((item) => {
          const card = document.createElement('div');
          card.className = 'idea';
          card.innerHTML = `<h4>${item.title || item.name || 'Idea'}</h4><p>${item.description || item.desc || ''}</p>`;
          card.addEventListener('click', () => {
            const title = document.getElementById('ideaTitle');
            const desc = document.getElementById('ideaDesc');
            const ideaModal = document.getElementById('ideaModal');
            if (title) title.textContent = item.title || item.name || 'Idea';
            if (desc) desc.textContent = item.description || item.desc || '';
            if (ideaModal) ideaModal.style.display = 'flex';
            window._activeIdea = item;
          });
          grid.appendChild(card);
        });
      }
      if (res.notice) alert(res.notice);
    } catch (err) {
      alert(err.message || 'Tell me the industry or topic first, then I can generate ideas.');
      if (grid) grid.innerHTML = '';
    } finally {
      setButtonLoading(button, false);
    }
  });

  document.getElementById('diSaveBtn')?.addEventListener('click', (event) => {
    writeSaved('ideas', getIdeasText());
    flashSaved(event.currentTarget);
  });

  document.getElementById('diCopyBtn')?.addEventListener('click', (event) => {
    copyText(getIdeasText(), event.currentTarget);
  });

  const ideaModal = document.getElementById('ideaModal');
  if (ideaModal) {
    document.getElementById('closeIdeaBtn')?.addEventListener('click', () => {
      ideaModal.style.display = 'none';
    });
    document.getElementById('copyIdeaBtn')?.addEventListener('click', () => {
      const item = window._activeIdea || {};
      navigator.clipboard.writeText(`${item.title || ''}\n\n${item.description || ''}`.trim()).then(() => alert('Copied'));
    });
  }

  const savedGhostOutput = readSaved('ghostOutput', '');
  const ghostOutput = document.getElementById('gwOutput');
  if (ghostOutput && savedGhostOutput) ghostOutput.value = savedGhostOutput;

  const savedHooks = readSaved('hooks', '');
  const hooksList = document.getElementById('hooksList');
  if (hooksList && savedHooks) {
    hooksList.innerHTML = '';
    savedHooks.split('\n').filter(Boolean).forEach((hook) => {
      const el = document.createElement('div');
      el.className = 'hook';
      el.textContent = hook;
      hooksList.appendChild(el);
    });
  }

  const savedIdeas = readSaved('ideas', '');
  const ideasGrid = document.getElementById('ideasGrid');
  if (ideasGrid && savedIdeas) {
    ideasGrid.innerHTML = '';
    savedIdeas.split(/\n{2,}/).filter(Boolean).forEach((idea) => {
      const [title, ...description] = idea.split('\n');
      const card = document.createElement('div');
      card.className = 'idea';
      const h4 = document.createElement('h4');
      const p = document.createElement('p');
      h4.textContent = title || 'Idea';
      p.textContent = description.join('\n');
      card.append(h4, p);
      ideasGrid.appendChild(card);
    });
  }

  fetchAndRender();
  loadSocialAccounts();
})();
