(function() {
  const PLATFORMS = ['Instagram', 'Facebook', 'LinkedIn'];
  const COLORS = ['#00d9ff', '#7c5dfa', '#f58ac8', '#ffb86b', '#6fe3b2', '#ffe27a', '#7cc6ff', '#c5a3ff'];
  const METRIC_COLORS = {
    'Reach / Impressions': '#6bbcff',
    Impressions: '#6bbcff',
    Interactions: '#6fe3b2',
    Clicks: '#f58ac8',
    Reactions: '#ff6b6b',
    Views: '#00d9ff',
    Follows: '#ffe27a',
    Visits: '#c5a3ff',
    Viewers: '#7cc6ff',
    Unique: '#7c5dfa',
    Comments: '#ffb86b',
    Reports: '#9aa3ff',
    Engagement: '#6fe3b2',
    'Avg. Engagement': '#7c5dfa',
    'Avg Engagement': '#7c5dfa',
  };
  const STORAGE_KEY = 'evvPlatformDashboards';
  const REPORTS_KEY = 'aiReports';

  const METRICS = {
    Instagram: [
      { label: 'Reach / Impressions', aliases: ['reach', 'impressions', 'reach impressions', 'reach/impressions', 'reach / impressions'] },
      { label: 'Interactions', aliases: ['interactions', 'interaction', 'engagement', 'engagements', 'total interactions'] },
      { label: 'Clicks', aliases: ['clicks', 'click', 'link clicks', 'website clicks', 'profile clicks'] },
      { label: 'Reactions', aliases: ['reactions', 'likes', 'reaction'] },
      { label: 'Views', aliases: ['views', 'view', 'video views', 'plays'] },
      { label: 'Follows', aliases: ['follows', 'follow', 'followers', 'new follows'] },
      { label: 'Avg. Engagement', aliases: ['avg engagement', 'average engagement', 'engagement rate'], formula: (totals) => percentage(valueFor(totals, ['interactions', 'clicks', 'reactions']), valueFor(totals, ['reach', 'impressions', 'views'])), suffix: '%' },
    ],
    Facebook: [
      { label: 'Follows', aliases: ['follows', 'follow', 'followers', 'new follows'] },
      { label: 'Visits', aliases: ['visits', 'visit', 'page visits', 'profile visits'] },
      { label: 'Clicks', aliases: ['clicks', 'click', 'link clicks', 'website clicks'] },
      { label: 'Interactions', aliases: ['interactions', 'interaction', 'engagement', 'engagements', 'total interactions'] },
      { label: 'Views', aliases: ['views', 'view', 'video views', 'total views'] },
      { label: 'Viewers', aliases: ['viewers', 'viewer', 'unique viewers'] },
      { label: 'Avg Engagement', aliases: ['avg engagement', 'average engagement'], formula: (totals) => valueFor(totals, ['link clicks', 'clicks']) + valueFor(totals, ['interactions']) },
    ],
    LinkedIn: [
      { label: 'Impressions', aliases: ['impressions'] },
      { label: 'Unique', aliases: ['unique', 'unique impressions', 'unique visitors', 'unique views'] },
      { label: 'Clicks', aliases: ['clicks', 'click', 'link clicks'] },
      { label: 'Reactions', aliases: ['reactions', 'likes'] },
      { label: 'Comments', aliases: ['comments', 'comment', 'comment count'] },
      { label: 'Reports', aliases: ['reports', 'report', 'reposts', 'repost', 'shares', 'shared reports'] },
      { label: 'Engagement', aliases: ['engagement', 'engagement rate'], suffix: '%' },
      { label: 'Avg Engagement', aliases: ['avg engagement', 'average engagement'], formula: (totals) => valueFor(totals, ['clicks']) + valueFor(totals, ['reactions']) + valueFor(totals, ['comments']) + valueFor(totals, ['reports', 'reposts', 'shares']) },
    ],
  };

  let state = {};
  let selectedPlatform = 'Instagram';
  let visibleMetrics = new Set();
  let pendingFiles = [];
  let chart = null;
  const els = {};

  function byId(id) {
    return document.getElementById(id);
  }

  function init() {
    els.platformSelector = byId('platformSelector');
    els.uploadBtn = byId('platformUploadBtn');
    els.uploadModal = byId('platformUploadModal');
    els.uploadBackdrop = byId('platformUploadModalBackdrop');
    els.uploadClose = byId('platformUploadModalClose');
    els.uploadBrowse = byId('platformUploadModalBrowse');
    els.uploadInput = byId('platformUploadModalInput');
    els.uploadDrop = byId('platformUploadModalDrop');
    els.uploadSubmit = byId('platformUploadModalSubmit');
    els.uploadList = byId('platformUploadList');
    els.uploadStatus = byId('uploadStatus');
    els.period = byId('periodLabel');
    els.metricGrid = byId('platformMetricGrid');
    els.toggles = byId('platformMetricToggles');
    els.legend = byId('platformLegend');
    els.chartTitle = byId('platformChartTitle');
    els.chartCanvas = byId('platformMetricChart');
    els.feedback = byId('platformFeedbackContent');
    els.report = byId('platformReportSummary');
    els.reportEmpty = byId('recentReportsEmpty');

    if (!els.platformSelector || !els.metricGrid) return;
    bindEvents();
    loadState().then(render);
  }

  function bindEvents() {
    els.platformSelector.addEventListener('change', () => {
      selectedPlatform = els.platformSelector.value;
      visibleMetrics = new Set();
      render();
    });
    els.uploadBtn?.addEventListener('click', openUpload);
    els.uploadClose?.addEventListener('click', closeUpload);
    els.uploadBackdrop?.addEventListener('click', closeUpload);
    els.uploadBrowse?.addEventListener('click', () => els.uploadInput?.click());
    els.uploadInput?.addEventListener('change', () => {
      pendingFiles = mergePendingFiles(Array.from(els.uploadInput.files || []));
      renderUploadList();
    });
    ['dragenter', 'dragover'].forEach((eventName) => {
      els.uploadDrop?.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.uploadDrop.classList.add('dragover');
      });
    });
    ['dragleave', 'drop'].forEach((eventName) => {
      els.uploadDrop?.addEventListener(eventName, (event) => {
        event.preventDefault();
        els.uploadDrop.classList.remove('dragover');
      });
    });
    els.uploadDrop?.addEventListener('drop', (event) => {
      pendingFiles = mergePendingFiles(Array.from(event.dataTransfer.files || []));
      renderUploadList();
    });
    els.uploadSubmit?.addEventListener('click', uploadFiles);
    els.uploadModal?.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter') return;
      if (event.target.closest('button')) return;
      event.preventDefault();
      uploadFiles();
    });
  }

  function mergePendingFiles(files) {
    const next = files
      .filter((file) => /\.csv$/i.test(file.name) || /csv/i.test(file.type || ''))
      .map((file) => ({ file, platform: inferPlatform(file.name, '') }));
    return pendingFiles.concat(next).slice(0, 3);
  }

  function openUpload() {
    els.uploadModal?.classList.add('show');
    els.uploadBackdrop?.classList.add('show');
  }

  function closeUpload() {
    els.uploadModal?.classList.remove('show');
    els.uploadBackdrop?.classList.remove('show');
    pendingFiles = [];
    if (els.uploadInput) els.uploadInput.value = '';
    renderUploadList();
  }

  function renderUploadList() {
    if (!els.uploadList) return;
    els.uploadList.innerHTML = '';
    pendingFiles.forEach((item, index) => {
      const row = document.createElement('div');
      row.className = 'file-item';
      row.innerHTML = `
        <span>${escapeHtml(item.file.name)}
          <small>${escapeHtml(item.platform || 'Platform will be detected from CSV')}</small>
        </span>
        <button class="delete-btn" data-index="${index}" type="button">Remove</button>
      `;
      els.uploadList.appendChild(row);
    });
    els.uploadList.querySelectorAll('.delete-btn').forEach((button) => {
      button.addEventListener('click', () => {
        pendingFiles.splice(Number(button.dataset.index), 1);
        renderUploadList();
      });
    });
  }

  async function uploadFiles() {
    if (!pendingFiles.length) {
      alert('Add at least one Instagram, Facebook, or LinkedIn CSV file.');
      return;
    }

    els.uploadSubmit.disabled = true;
    els.uploadSubmit.textContent = 'Processing...';
    try {
      const files = [];
      for (const item of pendingFiles) {
        const csv = await item.file.text();
        const platform = inferPlatform(`${item.file.name}\n${csv}`, item.platform);
        files.push({ filename: item.file.name, platform, csv });
      }

      const response = await fetch('/api/upload', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload.message || 'Upload failed');

      mergeDashboards(payload.platformDashboards || buildDashboardsFromFiles(files));
      saveState();
      closeUpload();
      render();
    } catch (error) {
      alert(error.message || 'Upload failed');
    } finally {
      els.uploadSubmit.disabled = false;
      els.uploadSubmit.textContent = 'Upload Files';
    }
  }

  async function loadState() {
    state = readLocalState();
    try {
      const response = await fetch('/api/metrics');
      if (response.ok) {
        const payload = await response.json();
        mergeDashboards(payload.platformDashboards || {});
      }
    } catch (error) {
      console.error('Unable to load dashboard metrics', error);
    }
  }

  function readLocalState() {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
      return parsed && typeof parsed === 'object' ? parsed : {};
    } catch {
      return {};
    }
  }

  function saveState() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }

  function mergeDashboards(next) {
    Object.entries(next || {}).forEach(([platformKey, dashboard]) => {
      const platform = inferPlatform(dashboard?.platform || platformKey || dashboard?.filename);
      if (!PLATFORMS.includes(platform)) return;
      state[platform] = normalizeDashboard(platform, dashboard);
    });
  }

  function normalizeDashboard(platform, dashboard = {}) {
    const rows = Array.isArray(dashboard.rows) ? dashboard.rows : Array.isArray(dashboard.timeline) ? dashboard.timeline : [];
    return {
      platform,
      filename: dashboard.filename || dashboard.source || '',
      uploadedAt: dashboard.uploadedAt || new Date().toISOString(),
      rows: rows.map((row) => normalizeRow(row)).filter((row) => Object.keys(row.metrics).length),
      metricoolRows: Array.isArray(dashboard.metricoolRows) ? dashboard.metricoolRows.map((row) => normalizeRow(row)) : [],
    };
  }

  function buildDashboardsFromFiles(files) {
    return files.reduce((dashboards, file) => {
      const platform = inferPlatform(file.platform || file.filename);
      const parsed = parseCsv(file.csv);
      dashboards[platform] = normalizeDashboard(platform, {
        platform,
        filename: file.filename,
        rows: parsed.rows.map((values) => rowFromValues(parsed.headers, values)),
      });
      return dashboards;
    }, {});
  }

  function parseCsv(csv) {
    const rows = String(csv || '').split(/\r?\n/).filter((line) => line.trim()).map(parseCsvLine);
    return { headers: rows[0] || [], rows: rows.slice(1) };
  }

  function parseCsvLine(line) {
    const values = [];
    let current = '';
    let quoted = false;
    for (let index = 0; index < line.length; index += 1) {
      const char = line[index];
      const next = line[index + 1];
      if (char === '"') {
        if (quoted && next === '"') {
          current += '"';
          index += 1;
        } else {
          quoted = !quoted;
        }
      } else if (char === ',' && !quoted) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    return values;
  }

  function rowFromValues(headers, values) {
    return headers.reduce((row, header, index) => {
      row[header] = values[index] || '';
      return row;
    }, {});
  }

  function normalizeRow(row = {}) {
    if (row.metrics && typeof row.metrics === 'object') {
      return {
        date: row.date || normalizeDate(row.raw?.date || ''),
        metrics: Object.fromEntries(Object.entries(row.metrics).map(([key, value]) => [labelize(key), toNumber(value)])),
        raw: row.raw || row,
      };
    }

    const metrics = {};
    let date = '';
    Object.entries(row).forEach(([key, value]) => {
      const normalized = normalizeKey(key);
      if (!date && /date|day|period|posted|publish|timestamp/.test(normalized)) {
        date = normalizeDate(value);
        return;
      }
      const number = toNumber(value);
      if (Number.isFinite(number) && String(value).trim() !== '') metrics[labelize(key)] = number;
    });
    return { date, metrics, raw: row };
  }

  function render() {
    selectedPlatform = els.platformSelector.value || selectedPlatform;
    const dashboard = state[selectedPlatform] || { platform: selectedPlatform, rows: [] };
    const rows = getAllRows(dashboard);
    const metrics = getMetricSummaries(selectedPlatform, rows);
    if (!visibleMetrics.size) visibleMetrics = new Set(metrics.slice(0, 6).map((metric) => metric.label));
    renderUploadAvailability();
    renderMetrics(metrics);
    renderMetricToggles(metrics);
    renderChart(rows, metrics);
    renderFeedback(metrics, rows);
    renderReport(metrics, rows, dashboard);
    renderPeriod(rows, dashboard);
  }

  function renderUploadAvailability() {
    const uploadedPlatforms = PLATFORMS.filter((platform) => getAllRows(state[platform] || {}).length);
    if (els.uploadBtn) els.uploadBtn.style.display = 'inline-flex';
    if (els.uploadStatus) {
      els.uploadStatus.textContent = uploadedPlatforms.length
        ? `Using ${uploadedPlatforms.join(', ')} CSV data`
        : '';
    }
  }

  function getAllRows(dashboard) {
    return [...(dashboard.rows || []), ...(dashboard.metricoolRows || [])];
  }

  function getMetricSummaries(platform, rows) {
    const totals = {};
    rows.forEach((row) => {
      Object.entries(row.metrics || {}).forEach(([label, value]) => {
        totals[label] = (totals[label] || 0) + Number(value || 0);
      });
    });

    return (METRICS[platform] || []).map((metric) => {
      const value = typeof metric.formula === 'function' ? metric.formula(totals) : valueFor(totals, metric.aliases);
      return { label: metric.label, value, suffix: metric.suffix || '' };
    });
  }

  function renderMetrics(metrics) {
    els.metricGrid.innerHTML = '';
    metrics.forEach((metric, index) => {
      const colorClass = ['cyan', 'purple', 'pink', 'orange', 'green', 'yellow'][index % 6];
      const card = document.createElement('div');
      card.className = `platform-metric-card ${colorClass}`;
      card.innerHTML = `<div class="metric-title">${escapeHtml(metric.label)}</div><div class="metric-value ${colorClass}">${formatMetric(metric)}</div>`;
      els.metricGrid.appendChild(card);
    });
  }

  function renderMetricToggles(metrics) {
    els.toggles.innerHTML = '';
    metrics.forEach((metric, index) => {
      const color = getMetricColor(metric.label, index);
      const button = document.createElement('button');
      button.className = `metric-btn${visibleMetrics.has(metric.label) ? ' active' : ''}`;
      button.innerHTML = `<span class="dot" style="background:${color}"></span>${escapeHtml(metric.label)}`;
      button.addEventListener('click', () => {
        if (visibleMetrics.has(metric.label) && visibleMetrics.size > 1) visibleMetrics.delete(metric.label);
        else visibleMetrics.add(metric.label);
        render();
      });
      els.toggles.appendChild(button);
    });
    els.legend.innerHTML = metrics
      .filter((metric) => visibleMetrics.has(metric.label))
      .map((metric, index) => `<div class="legend-item"><span class="legend-swatch" style="background:${getMetricColor(metric.label, index)}"></span>${escapeHtml(metric.label)}</div>`)
      .join('');
  }

  function renderChart(rows, metrics) {
    if (!els.chartCanvas) return;
    const selectedMetrics = metrics.filter((metric) => visibleMetrics.has(metric.label));
    const timeline = buildMonthlyTimeline(rows);
    const labels = timeline.map((entry) => `Day ${entry.day}`);
    const datasets = selectedMetrics.map((metric, index) => {
      const color = getMetricColor(metric.label, index);
      return {
        label: metric.label,
        data: timeline.map((entry) => getMetricPointValue(selectedPlatform, metric.label, entry.metrics || {})),
        borderColor: color,
        backgroundColor: `${color}22`,
        pointBackgroundColor: color,
        pointBorderColor: color,
        pointHoverBackgroundColor: '#ffffff',
        pointHoverBorderColor: color,
        tension: 0.35,
        fill: false,
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
      };
    });
    if (typeof Chart === 'undefined') {
      renderCanvasFallback(labels, datasets);
      els.chartTitle.textContent = `${selectedPlatform} Performance Graphs`;
      return;
    }
    if (chart) chart.destroy();
    chart = new Chart(els.chartCanvas, {
      type: 'line',
      data: { labels, datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        interaction: { mode: 'nearest', intersect: false },
        plugins: {
          legend: { display: false },
          tooltip: {
            enabled: true,
            mode: 'nearest',
            intersect: false,
            displayColors: true,
            callbacks: {
              title: (items) => items?.[0]?.label || '',
              label: (item) => `${item.dataset.label}: ${formatNumber(item.parsed.y)}`,
            },
          },
        },
        scales: {
          x: { grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8fa0c2', maxTicksLimit: 10 } },
          y: { beginAtZero: true, grid: { color: 'rgba(255,255,255,0.04)' }, ticks: { color: '#8fa0c2' } },
        },
      },
    });
    els.chartTitle.textContent = `${selectedPlatform} Performance Graphs`;
  }

  function buildMonthlyTimeline(rows) {
    const dayMap = new Map();
    const sourceRows = rows.length ? rows : [{ metrics: {} }];
    sourceRows.forEach((row, index) => {
      const day = getDayNumber(row.date, index);
      if (!dayMap.has(day)) dayMap.set(day, { day, metrics: {} });
      const entry = dayMap.get(day);
      Object.entries(row.metrics || {}).forEach(([label, value]) => {
        entry.metrics[label] = (entry.metrics[label] || 0) + Number(value || 0);
      });
    });
    const timelineLength = getTimelineLength(sourceRows);
    return Array.from({ length: timelineLength }, (_, index) => {
      const day = index + 1;
      return dayMap.get(day) || { day, metrics: {} };
    });
  }

  function getTimelineLength(rows) {
    const datedRows = rows
      .map((row) => new Date(String(row.date || '').trim()))
      .filter((date) => !Number.isNaN(date.getTime()));

    if (!datedRows.length) return 31;

    const first = datedRows[0];
    const sameMonth = datedRows.every((date) => date.getFullYear() === first.getFullYear() && date.getMonth() === first.getMonth());
    if (!sameMonth) return 31;

    return new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  }

  function getDayNumber(value, index) {
    const text = String(value || '').trim();
    const parsed = new Date(text);
    if (!Number.isNaN(parsed.getTime())) return clampDay(parsed.getDate());
    const matched = text.match(/\b([1-9]|[12][0-9]|3[01])\b/);
    if (matched) return clampDay(Number(matched[1]));
    return clampDay(index + 1);
  }

  function clampDay(value) {
    return Math.min(31, Math.max(1, Number(value) || 1));
  }

  function getMetricColor(label, index = 0) {
    return METRIC_COLORS[label] || COLORS[index % COLORS.length];
  }

  function renderCanvasFallback(labels, datasets) {
    const canvas = els.chartCanvas;
    const rect = canvas.parentElement?.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const width = Math.max(320, Math.floor(rect?.width || 720));
    const height = Math.max(260, Math.floor(rect?.height || 340));
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    const padding = { top: 24, right: 22, bottom: 54, left: 52 };
    const plotWidth = width - padding.left - padding.right;
    const plotHeight = height - padding.top - padding.bottom;
    const allValues = datasets.flatMap((dataset) => dataset.data || []).map(Number).filter(Number.isFinite);
    const maxValue = Math.max(1, ...allValues);

    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    for (let step = 0; step <= 4; step += 1) {
      const y = padding.top + (plotHeight / 4) * step;
      ctx.beginPath();
      ctx.moveTo(padding.left, y);
      ctx.lineTo(width - padding.right, y);
      ctx.stroke();
    }

    ctx.fillStyle = '#8fa0c2';
    ctx.font = '12px sans-serif';
    ctx.textAlign = 'right';
    for (let step = 0; step <= 4; step += 1) {
      const value = maxValue - (maxValue / 4) * step;
      const y = padding.top + (plotHeight / 4) * step + 4;
      ctx.fillText(formatNumber(value), padding.left - 10, y);
    }

    datasets.forEach((dataset) => {
      ctx.strokeStyle = dataset.borderColor || '#6bbcff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      dataset.data.forEach((rawValue, index) => {
        const x = padding.left + (plotWidth / Math.max(1, labels.length - 1)) * index;
        const y = padding.top + plotHeight - (Number(rawValue || 0) / maxValue) * plotHeight;
        if (index === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    });

    ctx.fillStyle = '#8fa0c2';
    ctx.font = '11px sans-serif';
    ctx.textAlign = 'center';
    labels.forEach((label, index) => {
      if (labels.length > 8 && index % Math.ceil(labels.length / 8) !== 0) return;
      const x = padding.left + (plotWidth / Math.max(1, labels.length - 1)) * index;
      ctx.fillText(String(label).slice(0, 14), x, height - 22);
    });
  }

  function renderFeedback(metrics, rows) {
    if (!els.feedback) return;
    const hasRows = rows.length > 0;
    if (!hasRows) {
      els.feedback.textContent = `Upload a ${selectedPlatform} CSV to generate feedback.`;
      return;
    }
    const ranked = metrics.slice().sort((a, b) => Math.abs(b.value) - Math.abs(a.value));
    const top = ranked[0] || metrics[0];
    const second = ranked[1] || top;
    const visibleRows = rows.filter((row) => row.date).sort((a, b) => String(a.date).localeCompare(String(b.date)));
    const trend = visibleRows.length > 1 ? getTrendForMetric(visibleRows, top.label) : null;
    const trendText = trend
      ? `${top.label} moved from ${formatNumber(trend.first)} to ${formatNumber(trend.last)}, which is a ${trend.change >= 0 ? 'positive lift' : 'drop'} of ${formatNumber(Math.abs(trend.change))}.`
      : `The file does not include enough dated rows for a directional trend, so the dashboard is treating this as a platform total baseline.`;
    const focusText = getPlatformFocusText(selectedPlatform, top.label, second.label);
    els.feedback.innerHTML = `
      <div class="ai-feedback-text">
        <strong>What the metric means</strong>
        <p>${escapeHtml(top.label)} is the strongest visible signal in the uploaded ${selectedPlatform} CSV. This tells you where the platform is currently producing the most measurable movement, whether that movement is awareness, audience response, or direct action.</p>
        <strong>Performance analysis and insights</strong>
        <p>The dashboard is reading ${rows.length} item/date row${rows.length === 1 ? '' : 's'} and totals ${formatMetric(top)} for ${escapeHtml(top.label)}. ${escapeHtml(trendText)} The next most important support metric is ${escapeHtml(second.label)} at ${formatMetric(second)}, so it should be reviewed alongside the lead KPI instead of treated separately.</p>
        <strong>Recommended actions</strong>
        <p>${escapeHtml(focusText)} Use the top-performing metric as the headline KPI for the next report, then compare it with ${escapeHtml(second.label)} to see if reach is becoming engagement, engagement is becoming clicks, or visibility is translating into audience growth.</p>
        <strong>Next-step strategies</strong>
        <p>For the next ${selectedPlatform} reporting cycle, keep the same CSV structure so the graph can compare like-for-like movement. Track one creative or posting change at a time, then use the next upload to confirm whether the change improved ${escapeHtml(top.label)} without weakening the other core metrics.</p>
      </div>
    `;
  }

  function getTrendForMetric(rows, label) {
    const values = rows.map((row) => getMetricPointValue(selectedPlatform, label, row.metrics || {})).filter((value) => Number.isFinite(value));
    if (values.length < 2) return null;
    return { first: values[0], last: values[values.length - 1], change: values[values.length - 1] - values[0] };
  }

  function getMetricPointValue(platform, label, rowMetrics) {
    const metric = (METRICS[platform] || []).find((item) => item.label === label);
    if (!metric) return valueFor(rowMetrics, [label]);
    return typeof metric.formula === 'function' ? metric.formula(rowMetrics) : valueFor(rowMetrics, metric.aliases || [label]);
  }

  function getPlatformFocusText(platform, topLabel, supportLabel) {
    if (platform === 'Instagram') {
      return `On Instagram, ${topLabel} should be read together with ${supportLabel} because strong content usually needs both visibility and audience interaction.`;
    }
    if (platform === 'Facebook') {
      return `On Facebook, ${topLabel} matters most when it supports visits, clicks, and interactions, so posts should keep a clear reason for people to respond or move onward.`;
    }
    if (platform === 'LinkedIn') {
      return `On LinkedIn, ${topLabel} is strongest when it is paired with professional response signals such as clicks, reactions, comments, and repost activity.`;
    }
    return `${topLabel} should be reviewed with ${supportLabel} to understand the quality of the platform movement.`;
  }

  async function renderReport(metrics, rows, dashboard) {
    if (!els.report) return;
    const reports = await loadReports();
    const report = reports.find((item) => normalizeKey(item.platform) === normalizeKey(selectedPlatform));
    if (els.reportEmpty) els.reportEmpty.style.display = report ? 'none' : 'block';
    els.report.style.display = report ? 'flex' : 'none';
    if (report) {
      els.report.innerHTML = `
        <div class="recent-report-row">
          <div>
            <div class="recent-report-title">${escapeHtml(report.title || `${selectedPlatform} Report`)}</div>
            <div class="recent-report-meta">${escapeHtml(formatReportDate(report.start))}${report.end ? ` to ${escapeHtml(formatReportDate(report.end))}` : ''}</div>
          </div>
          <a class="pill-btn outline small" href="report.html?report=${encodeURIComponent(report.id || '')}">View</a>
        </div>
      `;
      return;
    }

    const hasRows = rows.length > 0;
    els.report.innerHTML = '';
    if (els.reportEmpty) {
      els.reportEmpty.textContent = hasRows
        ? `No ${selectedPlatform} report generated yet.`
        : `Upload ${selectedPlatform} CSV data to see reports.`;
    }
  }

  async function loadReports() {
    try {
      const response = await fetch('/api/reports', { credentials: 'same-origin' });
      if (response.ok) {
        const payload = await response.json();
        if (Array.isArray(payload.reports)) {
          localStorage.setItem(REPORTS_KEY, JSON.stringify(payload.reports));
          return payload.reports;
        }
      }
    } catch {
      // Local reports keep the dashboard useful offline.
    }
    try {
      const scopedKey = getScopedStorageKey(REPORTS_KEY);
      const parsed = JSON.parse(localStorage.getItem(scopedKey) || localStorage.getItem(REPORTS_KEY) || '[]');
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  }

  function getScopedStorageKey(key) {
    try {
      const user = JSON.parse(localStorage.getItem('user') || 'null');
      const email = String(user?.email || '').trim().toLowerCase();
      return email ? `evv:${email}:${key}` : key;
    } catch {
      return key;
    }
  }

  function renderPeriod(rows, dashboard) {
    const dates = rows.map((row) => row.date).filter(Boolean).sort();
    const source = dashboard.filename ? ` - ${dashboard.filename}` : '';
    if (!rows.length) {
      els.period.textContent = `${selectedPlatform}: awaiting upload`;
      return;
    }
    els.period.textContent = dates.length
      ? `${selectedPlatform}: ${dates[0]} to ${dates[dates.length - 1]}${source}`
      : `${selectedPlatform}: ${rows.length} uploaded rows${source}`;
  }

  function inferPlatform(value, fallback = '') {
    const text = String(value || '').toLowerCase();
    if (text.includes('facebook') || text.includes('fb_') || text === 'facebook') return 'Facebook';
    if (text.includes('linkedin') || text.includes('linkedlin') || text.includes('link_') || text === 'linkedin') return 'LinkedIn';
    if (text.includes('instagram') || text.includes('instgram') || text.includes('insta') || text.includes('ig_') || text === 'instagram') return 'Instagram';
    return PLATFORMS.includes(fallback) ? fallback : '';
  }

  function valueFor(totals, aliases) {
    const aliasKeys = aliases.map(normalizeKey);
    const found = Object.entries(totals || {}).find(([key]) => {
      const normalized = normalizeKey(key);
      return aliasKeys.includes(normalized) || aliasKeys.some((alias) => normalized.includes(alias) || alias.includes(normalized));
    });
    return found ? Number(found[1] || 0) : 0;
  }

  function percentage(top, base) {
    return base ? Number(((top / base) * 100).toFixed(2)) : 0;
  }

  function normalizeKey(value) {
    return String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
  }

  function labelize(value) {
    return String(value || '')
      .replace(/[_-]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim()
      .replace(/\b\w/g, (char) => char.toUpperCase());
  }

  function normalizeDate(value) {
    const date = new Date(String(value || '').trim());
    if (Number.isNaN(date.getTime())) return String(value || '').trim();
    return date.toISOString().slice(0, 10);
  }

  function toNumber(value) {
    if (typeof value === 'number') return value;
    const cleaned = String(value ?? '').replace(/[%,$]/g, '').replace(/,/g, '').trim();
    if (!cleaned) return NaN;
    const parsed = Number(cleaned);
    return Number.isFinite(parsed) ? parsed : NaN;
  }

  function formatMetric(metric) {
    return `${formatNumber(metric.value)}${metric.suffix || ''}`;
  }

  function formatNumber(value) {
    const number = Number(value || 0);
    return Number.isFinite(number) ? number.toLocaleString(undefined, { maximumFractionDigits: 2 }) : '0';
  }

  function formatReportDate(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value || '') : date.toLocaleDateString('en-GB');
  }

  function escapeHtml(value) {
    return String(value || '').replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  }

  document.addEventListener('DOMContentLoaded', init);
})();
