(function () {
  const PAGE_MAP = {
    'featurehub.html': { name: 'Feature Hub', category: 'Overview' },
    'dashboard-overview.html': { name: 'Dashboard', category: 'Analytics' },
    'connect.html': { name: 'Connect', category: 'Connections' },
    'upload.html': { name: 'Scheduling', category: 'Publishing' },
    'report.html': { name: 'Report', category: 'Insights' },
    'report-backup.html': { name: 'Report Backup', category: 'Insights' },
    'post-queue.html': { name: 'Campaign Center', category: 'Publishing' },
    'analytics.html': { name: 'Analytics', category: 'Analytics' },
    'clienthub.html': { name: 'Client Hub', category: 'Admin' }
  };
  const LOCAL_FALLBACK_KEY = 'evvClientHubRecords';

  function readJson(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // Ignore storage write failures.
    }
  }

  function toArray(value) {
    return Array.isArray(value) ? value : [];
  }

  function getScopedStorageKey(baseKey) {
    const user = readJson('user', null);
    const email = String(user?.email || '').trim().toLowerCase();
    return email ? `evv:${email}:${baseKey}` : baseKey;
  }

  function readScopedJson(baseKey, fallback) {
    return readJson(getScopedStorageKey(baseKey), fallback);
  }

  function readScopedString(baseKey, fallback = '') {
    try {
      const raw = localStorage.getItem(getScopedStorageKey(baseKey));
      return raw == null ? fallback : raw;
    } catch {
      return fallback;
    }
  }

  function getPageContext() {
    const pageFile = window.location.pathname.split('/').pop() || 'featurehub.html';
    const pageMeta = PAGE_MAP[pageFile] || {
      name: document.title.replace(/\s*[\u2022-].*$/, '').trim() || pageFile,
      category: 'Workspace'
    };

    return { pageFile, pageMeta };
  }

  function getSavedMetrics() {
    const queueItems = toArray(readScopedJson('postQueue', []));
    const feedbackItems = toArray(readScopedJson('feedback', []));
    const reports = toArray(readScopedJson('aiReports', []));
    const hashtagSets = toArray(readScopedJson('savedHashtagSets', []));
    const connections = toArray(readScopedJson('connections', []));
    const uploads = readScopedString('lastUploadName') ? 1 : 0;

    return {
      connections: connections.length,
      queuedPosts: queueItems.length,
      reports: reports.length,
      feedback: feedbackItems.length,
      hashtagSets: hashtagSets.length,
      uploads,
      totalSavedItems: connections.length + queueItems.length + reports.length + feedbackItems.length + hashtagSets.length + uploads
    };
  }

  function updateLocalFallback(user, payload) {
    if (!user?.email) return;
    const id = String(user.email).trim().toLowerCase();
    const allRecords = readJson(LOCAL_FALLBACK_KEY, {});
    const existing = allRecords[id] || {};
    const now = Date.now();
    const pageUsage = existing.pageUsage || {};
    const usage = pageUsage[payload.pageFile] || {
      name: payload.pageName,
      category: payload.pageCategory,
      visits: 0,
      firstVisited: now
    };

    usage.name = payload.pageName;
    usage.category = payload.pageCategory;
    usage.visits += 1;
    usage.lastVisited = now;
    pageUsage[payload.pageFile] = usage;

    const usageList = Object.entries(pageUsage)
      .map(([file, value]) => ({ file, ...value }))
      .sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));
    const firstName = user.firstName || existing.firstName || '';
    const lastName = user.lastName || existing.lastName || '';
    const fullName = [firstName, lastName].filter(Boolean).join(' ').trim() || user.name || existing.name || user.email;

    allRecords[id] = {
      id,
      email: user.email,
      name: fullName,
      firstName,
      lastName,
      companyName: user.companyName || existing.companyName || '',
      accountType: user.accountType || existing.accountType || 'individual',
      role: user.role || existing.role || 'client',
      view: user.view || existing.view || 'client',
      initials: String(payload.initials || existing.initials || fullName[0] || user.email[0] || 'C').toUpperCase(),
      firstSeen: existing.firstSeen || now,
      lastActive: now,
      totalVisits: (existing.totalVisits || 0) + 1,
      lastPage: payload.pageName,
      pageUsage,
      pagesUsed: usageList.map((item) => item.name),
      toolsUsed: usageList.map((item) => item.name),
      totalToolsUsed: usageList.length,
      recentTools: usageList.slice(0, 4).map((item) => item.name),
      metrics: payload.metrics
    };

    writeJson(LOCAL_FALLBACK_KEY, allRecords);
  }

  const user = readJson('user', null);
  if (!user?.email) return;

  const { pageFile, pageMeta } = getPageContext();
  const firstName = user.firstName || (user.name ? String(user.name).split(' ')[0] : '');
  const lastName = user.lastName || (user.name ? String(user.name).split(' ').slice(1).join(' ') : '');
  const payload = {
    pageFile,
    pageName: pageMeta.name,
    pageCategory: pageMeta.category,
    firstName,
    lastName,
    name: [firstName, lastName].filter(Boolean).join(' ').trim() || user.name || '',
    companyName: user.companyName || '',
    accountType: user.accountType || 'individual',
    role: user.role || 'client',
    view: user.view || 'client',
    initials: String(firstName[0] || user.name?.[0] || user.email[0] || 'C').toUpperCase(),
    metrics: getSavedMetrics()
  };

  updateLocalFallback(user, payload);

  fetch('/api/client-hub/track', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'same-origin',
    body: JSON.stringify(payload)
  }).catch(() => {
    // Local fallback is already updated, so no extra work is needed here.
  });

  window.__trackClientActivity = function trackClientActivity(event = {}) {
    const context = getPageContext();
    const activityPayload = {
      pageFile: event.pageFile || context.pageFile,
      pageName: event.pageName || context.pageMeta.name,
      pageCategory: event.pageCategory || context.pageMeta.category,
      eventType: event.eventType || 'activity',
      eventLabel: event.eventLabel || event.label || 'Activity',
      eventDetail: event.eventDetail || event.detail || '',
      eventMeta: event.eventMeta || {},
      metrics: getSavedMetrics()
    };

    fetch('/api/client-hub/event', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'same-origin',
      body: JSON.stringify(activityPayload)
    }).catch(() => {
      // Ignore tracking failures.
    });
  };
})();
