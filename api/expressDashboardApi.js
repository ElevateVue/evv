const express = require('express');
const multer = require('multer');
const csvParser = require('csv-parser');
const stream = require('stream');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');

require('dotenv').config({ path: path.join(__dirname, '..', 'API.env') });

const METRICOOL_TOKEN = process.env.METRICOOL_TOKEN || '';
const METRICOOL_USER_ID = process.env.METRICOOL_USER_ID || '';
const METRICOOL_API_BASE = process.env.METRICOOL_API_BASE_URL || 'https://api.metricool.com/v1';
const PORT = Number(process.env.API_PORT || 4001);
const publicDir = path.join(__dirname, '..', 'public');
const sessionsFile = path.join(__dirname, '..', 'sessions.json');
const authUsersFile = path.join(__dirname, '..', 'auth-users.json');
const workspaceFile = path.join(__dirname, '..', 'workspace.json');

function loadJsonFile(filePath, fallback) {
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed !== undefined ? parsed : fallback;
  } catch (err) {
    return fallback;
  }
}

function saveJsonFile(filePath, value) {
  try {
    fs.writeFileSync(filePath, JSON.stringify(value, null, 2), 'utf8');
  } catch (err) {
    console.error(`Failed to write ${filePath}:`, err.message);
  }
}

let sessions = loadJsonFile(sessionsFile, []);
let authUsers = loadJsonFile(authUsersFile, {});
let workspace = loadJsonFile(workspaceFile, { posts: [], lastUploadName: '', metrics: {}, perPlatform: {} });
workspace = { posts: [], lastUploadName: '', metrics: {}, perPlatform: {}, ...workspace };

function saveWorkspace() {
  saveJsonFile(workspaceFile, workspace);
}

const upload = multer({ storage: multer.memoryStorage(), limits: { files: 5, fileSize: 15 * 1024 * 1024 } });
const app = express();
app.use(express.json({ limit: '12mb' }));
app.use(express.urlencoded({ extended: true, limit: '12mb' }));
app.use(express.static(publicDir));

const platformFieldMap = {
  instagramFile: 'Instagram',
  facebookFile: 'Facebook',
  linkedinFile: 'LinkedIn',
  tiktokFile: 'TikTok',
  snapchatFile: 'Snapchat',
};

function normalizeKey(value = '') {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^a-z0-9 ]+/g, '');
}

function safeNumber(value) {
  if (value === undefined || value === null) return 0;
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value).replace(/[%,$]/g, '').replace(/,/g, '').trim();
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatIsoDate(value) {
  const date = new Date(String(value).trim());
  if (Number.isNaN(date.getTime())) return String(value).trim();
  return date.toISOString().slice(0, 10);
}

function extractDateKey(row) {
  const dateAliases = ['date', 'day', 'period', 'postedat', 'publishdate', 'postdate', 'timestamp'];
  for (const alias of dateAliases) {
    if (row[alias]) {
      return formatIsoDate(row[alias]);
    }
  }
  const possible = Object.keys(row).find((key) => /date|day|period|posted/.test(key));
  return possible ? formatIsoDate(row[possible]) : '';
}

function normalizeCsvRow(rawRow) {
  return Object.keys(rawRow).reduce((normalized, header) => {
    normalized[normalizeKey(header)] = String(rawRow[header] || '').trim();
    return normalized;
  }, {});
}

function sumRowValues(rows, aliases = []) {
  return rows.reduce((total, row) => {
    for (const alias of aliases) {
      if (row[alias] !== undefined && row[alias] !== '') {
        total += safeNumber(row[alias]);
        break;
      }
    }
    return total;
  }, 0);
}

function buildMetricValue(row, aliases = []) {
  for (const alias of aliases) {
    if (row[alias] !== undefined && row[alias] !== '') {
      return safeNumber(row[alias]);
    }
  }
  return 0;
}

function mergeTimelineRows(csvRows, metricoolRows) {
  const csvMap = new Map();
  const metricMap = new Map();
  const allKeys = new Set();

  csvRows.forEach((row) => {
    const date = extractDateKey(row);
    if (!date) return;
    csvMap.set(date, row);
    allKeys.add(date);
  });

  metricoolRows.forEach((row) => {
    const date = extractDateKey(row) || formatIsoDate(row.date || row.timestamp);
    if (!date) return;
    metricMap.set(date, row);
    allKeys.add(date);
  });

  return Array.from(allKeys)
    .sort()
    .map((date) => ({
      date,
      csv: csvMap.get(date) || {},
      metricool: metricMap.get(date) || {},
    }));
}

function calculatePlatformSummary(platform, mergedRows) {
  const rows = mergedRows.map((entry) => ({ ...entry.csv, ...entry.metricool }));

  if (platform === 'Instagram') {
    const followers = sumRowValues(rows, ['followers', 'totalfollowers', 'follows']);
    const profileImpressions = sumRowValues(rows, ['profileimpressions', 'impressions', 'reach']);
    const engagement = sumRowValues(rows, ['engagement', 'totalengagement', 'interactions', 'likes', 'comments', 'shares']);
    const mediaClicks = sumRowValues(rows, ['mediaclicks', 'linkclicks', 'clicks']);

    return { followers, profileImpressions, engagement, mediaClicks };
  }

  if (platform === 'Facebook') {
    const follows = sumRowValues(rows, ['follows', 'newfollows', 'followers']);
    const pageVisits = sumRowValues(rows, ['pagevisits', 'visits', 'profilevisits']);
    const linkClicks = sumRowValues(rows, ['linkclicks', 'clicks', 'ctr']);
    const interactions = sumRowValues(rows, ['interactions', 'engagement', 'totalinteractions', 'likes', 'comments', 'shares']);
    const totalVideoViews = sumRowValues(rows, ['videoviews', 'totalvideoviews', 'views']);
    const viewers = sumRowValues(rows, ['viewers', 'uniqueviewers', 'audience']);
    const avgEngagement = linkClicks + interactions;

    return { follows, pageVisits, linkClicks, interactions, totalVideoViews, viewers, avgEngagement };
  }

  if (platform === 'LinkedIn') {
    const impressions = sumRowValues(rows, ['impressions', 'reach', 'views']);
    const uniqueVisitors = sumRowValues(rows, ['uniquevisitors', 'visitors', 'uniqueviews']);
    const linkClicks = sumRowValues(rows, ['linkclicks', 'clicks', 'ctr']);
    const reactions = sumRowValues(rows, ['reactions', 'likes', 'emojiinteractions']);
    const comments = sumRowValues(rows, ['comments', 'commentcount']);
    const sharedReports = sumRowValues(rows, ['sharedreports', 'shares', 'reportshares']);
    const engagement = sumRowValues(rows, ['engagement', 'totalengagement', 'interactions', 'likes', 'comments', 'shares']);
    const avgEngagement = linkClicks + reactions + comments + sharedReports;

    return { impressions, uniqueVisitors, linkClicks, reactions, comments, sharedReports, engagement, avgEngagement };
  }

  return {};
}

function buildPlatformFeedback(platform, summary) {
  const { followers, profileImpressions, engagement, mediaClicks, follows, pageVisits, linkClicks, interactions, totalVideoViews, viewers, avgEngagement, impressions, uniqueVisitors, reactions, comments, sharedReports } = summary;

  if (platform === 'Instagram') {
    const whatIsIt = `Your Instagram profile is showing ${followers} followers with ${profileImpressions} profile impressions and ${engagement} engagement across the selected timeframe.`;
    const whatTheyCanDo = `If media clicks are trailing (${mediaClicks}), lean into carousel posts and story stickers that drive direct profile or link actions.`;
    const whatsNext = `Schedule 3 new Instagram posts with at least one video and one carousel to increase visibility and click-through momentum.`;
    return { whatIsIt, whatTheyCanDo, whatsNext };
  }

  if (platform === 'Facebook') {
    const whatIsIt = `Facebook activity shows ${follows} follows, ${pageVisits} page visits, ${linkClicks} link clicks, and ${interactions} interactions over the selected period.`;
    const whatTheyCanDo = `When links are strong but viewers are lower, test short video clips with clear CTAs and link cards to turn views into clicks.`;
    const whatsNext = `Plan 2 video-led posts this week and use post captions that invite users to visit the page or click through.`;
    return { whatIsIt, whatTheyCanDo, whatsNext };
  }

  if (platform === 'LinkedIn') {
    const whatIsIt = `LinkedIn is generating ${impressions} impressions, ${uniqueVisitors} unique visitors, ${reactions} reactions, ${comments} comments and ${sharedReports} shared reports.`;
    const whatTheyCanDo = `If reactions are strong but comments are lower, use direct questions and checklist-style posts to encourage conversation.`;
    const whatsNext = `Publish 2 insight-driven LinkedIn posts this week, each with an explicit ask for readers to comment or share the report.`;
    return { whatIsIt, whatTheyCanDo, whatsNext };
  }

  return { whatIsIt: 'Platform summary is not available.', whatTheyCanDo: 'Review platform metrics to generate a clear optimization path.', whatsNext: 'Collect fresh timeline data and try again.' };
}

function buildCleanTimeline(platform, mergedRows) {
  return mergedRows.map((entry) => {
    const csvRow = entry.csv;
    const metricRow = entry.metricool;
    const combined = { ...csvRow, ...metricRow };

    return {
      date: entry.date,
      followers: buildMetricValue(combined, ['followers', 'totalfollowers', 'follows']),
      impressions: buildMetricValue(combined, ['impressions', 'profileimpressions', 'reach']),
      linkClicks: buildMetricValue(combined, ['linkclicks', 'clicks']),
      interactions: buildMetricValue(combined, ['interactions', 'engagement', 'totalinteractions']),
      reactions: buildMetricValue(combined, ['reactions', 'likes']),
      comments: buildMetricValue(combined, ['comments']),
      shares: buildMetricValue(combined, ['shares']),
      views: buildMetricValue(combined, ['views', 'videoviews']),
      pageVisits: buildMetricValue(combined, ['pagevisits', 'visits', 'profilevisits']),
      uniqueVisitors: buildMetricValue(combined, ['uniquevisitors', 'visitors', 'uniqueviews']),
      viewers: buildMetricValue(combined, ['viewers', 'uniqueviewers']),
      mediaClicks: buildMetricValue(combined, ['mediaclicks']),
      sharedReports: buildMetricValue(combined, ['sharedreports', 'reportshares']),
      raw: {
        csv: csvRow,
        metricool: metricRow,
      },
    };
  });
}

function normalizePlatformFromFilename(filename = '') {
  const name = String(filename).toLowerCase();
  if (name.includes('instagram')) return 'Instagram';
  if (name.includes('facebook')) return 'Facebook';
  if (name.includes('linkedin')) return 'LinkedIn';
  if (name.includes('tiktok')) return 'TikTok';
  if (name.includes('snapchat')) return 'Snapchat';
  return 'Upload';
}

function buildCsvPost(row, index, platform, source) {
  const data = normalizeCsvRow(row);
  const date = extractDateKey(data);
  const title = String(data.title || data.name || data.caption || data.headline || data.post || data.text || `Post ${index + 1}`).trim() || `Post ${index + 1}`;
  const transcript = String(data.caption || data.content || data.description || data.text || '').trim();
  const likes = buildMetricValue(data, ['likes', 'like', 'reactions', 'emojiinteractions']);
  const comments = buildMetricValue(data, ['comments', 'commentcount', 'replies']);
  const shares = buildMetricValue(data, ['shares', 'sharedreports', 'reshares']);
  const views = buildMetricValue(data, ['views', 'videoviews', 'impressions', 'reach']);
  const clicks = buildMetricValue(data, ['clicks', 'linkclicks', 'mediaclicks']);
  const followers = buildMetricValue(data, ['followers', 'totalfollowers', 'newfollowers', 'follows']);
  const reactions = buildMetricValue(data, ['reactions', 'likes']);
  const engagement = likes + comments + shares + reactions;
  const postedAt = date || null;
  const status = postedAt && new Date(postedAt) <= new Date() ? 'posted' : 'scheduled';

  return {
    id: crypto.randomBytes(8).toString('hex'),
    platform,
    source,
    title,
    transcript,
    postedAt,
    status,
    engagement: {
      likes,
      comments,
      shares,
      reactions,
      total: engagement,
    },
    reach: views,
    clicks,
    views,
    followers,
    createdAt: Date.now(),
    raw: data,
  };
}

function aggregateMetrics(posts = []) {
  const totals = {
    reach: 0,
    interactions: 0,
    clicks: 0,
    reactions: 0,
    views: 0,
    follows: 0,
    engagementRate: 0,
  };
  const perPlatform = {};

  posts.forEach((post) => {
    const platform = post.platform || 'Upload';
    const platformEntry = perPlatform[platform] || {
      reach: 0,
      interactions: 0,
      clicks: 0,
      reactions: 0,
      views: 0,
      follows: 0,
      count: 0,
    };

    const likes = Number(post.engagement?.likes || 0);
    const comments = Number(post.engagement?.comments || 0);
    const shares = Number(post.engagement?.shares || 0);
    const reactions = Number(post.engagement?.reactions || 0);
    const interactions = likes + comments + shares + reactions;
    const reach = Number(post.reach || 0);
    const clicks = Number(post.clicks || 0);
    const views = Number(post.views || 0);
    const follows = Number(post.followers || 0);

    totals.reach += reach;
    totals.interactions += interactions;
    totals.clicks += clicks;
    totals.reactions += reactions;
    totals.views += views;
    totals.follows += follows;

    platformEntry.reach += reach;
    platformEntry.interactions += interactions;
    platformEntry.clicks += clicks;
    platformEntry.reactions += reactions;
    platformEntry.views += views;
    platformEntry.follows += follows;
    platformEntry.count += 1;

    perPlatform[platform] = platformEntry;
  });

  totals.engagementRate = totals.reach ? Number(((totals.interactions / totals.reach) * 100).toFixed(1)) : 0;
  return { totals, perPlatform };
}

function ensureWorkspaceMetrics() {
  const snapshot = aggregateMetrics(workspace.posts || []);
  workspace.metrics = snapshot.totals;
  workspace.perPlatform = snapshot.perPlatform;
}

function persistWorkspace() {
  ensureWorkspaceMetrics();
  saveWorkspace();
}

function buildMetricoolUrl(endpoint, query = {}) {
  const url = new URL(`${METRICOOL_API_BASE}${endpoint}`);
  const params = new URLSearchParams({ userId: METRICOOL_USER_ID, ...query });
  url.search = params.toString();
  return url.toString();
}

async function metricoolFetch(endpoint, method = 'GET', body = null) {
  if (!METRICOOL_TOKEN || !METRICOOL_USER_ID) {
    throw new Error('Metricool credentials are required in API.env');
  }

  const url = buildMetricoolUrl(endpoint, method === 'GET' ? body || {} : {});
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'X-Mc-Auth': METRICOOL_TOKEN,
    },
  };

  if (method !== 'GET' && body) {
    options.body = JSON.stringify(body);
  }

  const response = await fetch(url, options);
  const text = await response.text();
  try {
    return response.ok ? JSON.parse(text || '{}') : Promise.reject(new Error(text || response.statusText));
  } catch (err) {
    if (!response.ok) throw new Error(text || response.statusText);
    return {};
  }
}

async function parseCsvBuffer(buffer, filename) {
  return new Promise((resolve, reject) => {
    const rows = [];
    const pass = new stream.PassThrough();
    pass.end(buffer);

    pass
      .pipe(
        csvParser({ mapHeaders: ({ header }) => normalizeKey(header), skipLines: 0, strict: false })
      )
      .on('data', (row) => rows.push(normalizeCsvRow(row)))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

async function fetchMetricoolTimeline(platform, blogId) {
  const query = { blogId, platform: platform.toLowerCase() };
  const endpoint = '/analytics/timeline';
  const result = await metricoolFetch(endpoint, 'GET', query).catch((error) => {
    throw new Error(`Metricool timeline fetch failed for ${platform}: ${error.message}`);
  });
  return Array.isArray(result.data) ? result.data : Array.isArray(result.timeline) ? result.timeline : [];
}

app.post('/api/login', async (req, res) => {
  try {
    const { email, password, firstName, lastName, accountType, companyName, role, view, name } = req.body || {};
    if (!email || !password) {
      return res.status(400).json({ message: 'Email and password required' });
    }

    const normalizedEmail = String(email).trim().toLowerCase();
    const existingUser = authUsers[normalizedEmail];
    const isExisting = Boolean(existingUser);

    if (isExisting && existingUser.password !== String(password)) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    const resolvedFirstName = String(firstName || existingUser?.firstName || '').trim();
    const resolvedLastName = String(lastName || existingUser?.lastName || '').trim();
    const resolvedCompanyName = String(companyName || existingUser?.companyName || '').trim();
    const resolvedName = [resolvedFirstName, resolvedLastName].filter(Boolean).join(' ').trim() || String(name || existingUser?.name || '').trim() || resolvedCompanyName || normalizedEmail.split('@')[0];

    const userRecord = {
      email: normalizedEmail,
      password: String(password),
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      name: resolvedName,
      accountType: String(accountType || existingUser?.accountType || 'individual').trim(),
      companyName: resolvedCompanyName,
      role: String(role || existingUser?.role || 'client').trim(),
      view: String(view || existingUser?.view || 'client').trim(),
      createdAt: existingUser?.createdAt || Date.now(),
      lastSignedInAt: Date.now(),
    };

    authUsers[normalizedEmail] = userRecord;
    saveJsonFile(authUsersFile, authUsers);

    const token = `sess-${crypto.randomBytes(12).toString('hex')}`;
    sessions = sessions.filter((session) => session.user?.email !== normalizedEmail);
    sessions.push({ token, user: { ...userRecord, password: undefined }, createdAt: Date.now() });
    saveJsonFile(sessionsFile, sessions);

    return res.json({ token, user: { ...userRecord, password: undefined } });
  } catch (error) {
    return res.status(500).json({ message: 'Unable to process login' });
  }
});

app.post('/api/dashboard/upload-metrics', upload.fields([
  { name: 'instagramFile', maxCount: 1 },
  { name: 'facebookFile', maxCount: 1 },
  { name: 'linkedinFile', maxCount: 1 },
  { name: 'tiktokFile', maxCount: 1 },
  { name: 'snapchatFile', maxCount: 1 },
]), async (req, res) => {
  try {
    const blogId = String(req.body.blogId || req.query.blogId || '').trim();
    const files = req.files || {};
    const requestedPlatforms = Object.keys(platformFieldMap).filter((field) => Array.isArray(files[field]) && files[field].length);

    if (!requestedPlatforms.length) {
      return res.status(400).json({ error: 'No platform CSV files were provided. Please upload at least one platform file.' });
    }

    const processing = requestedPlatforms.map(async (fieldName) => {
      const platform = platformFieldMap[fieldName];
      const file = files[fieldName][0];
      const rows = await parseCsvBuffer(file.buffer, file.originalname);
      const metricoolRows = await fetchMetricoolTimeline(platform, blogId).catch(() => []);
      const mergedRows = mergeTimelineRows(rows, metricoolRows);
      const timeline = buildCleanTimeline(platform, mergedRows);
      const summary = calculatePlatformSummary(platform, mergedRows);
      return {
        key: platform.toLowerCase(),
        value: {
          platform,
          timeline,
          summary,
          feedback: buildPlatformFeedback(platform, summary),
        },
      };
    });

    const results = await Promise.all(processing);
    const payload = results.reduce((acc, item) => ({ ...acc, [item.key]: item.value }), {});

    return res.json({ payload });
  } catch (error) {
    return res.status(500).json({ error: error.message || 'Upload processing failed.' });
  }
});

app.post('/api/upload', async (req, res) => {
  try {
    const rawPayload = req.body;
    const uploads = Array.isArray(rawPayload)
      ? rawPayload
      : rawPayload?.files || rawPayload?.uploads
      ? (Array.isArray(rawPayload.files) ? rawPayload.files : rawPayload.uploads)
      : [rawPayload];
    const normalizedUploads = uploads.filter((item) => item && typeof item.csv === 'string');

    if (!normalizedUploads.length) {
      return res.status(400).json({ message: 'No CSV upload data received. Send { filename, csv } or an array of uploads.' });
    }

    let rowCount = 0;
    const warnings = [];
    const filesProcessed = [];

    for (const uploadFile of normalizedUploads) {
      const filename = String(uploadFile.filename || uploadFile.name || 'upload.csv').trim();
      const platform = normalizePlatformFromFilename(filename);
      const rows = await parseCsvBuffer(Buffer.from(uploadFile.csv, 'utf8'), filename);
      if (!rows.length) {
        warnings.push(`No rows found in ${filename}`);
      }
      const posts = rows.map((row, index) => buildCsvPost(row, index, platform, filename));
      workspace.posts = workspace.posts.concat(posts);
      rowCount += posts.length;
      filesProcessed.push(filename);
    }

    if (workspace.posts.length > 500) {
      workspace.posts = workspace.posts.slice(-500);
    }

    workspace.lastUploadName = filesProcessed.join(', ');
    persistWorkspace();

    return res.json({
      count: rowCount,
      files: filesProcessed.length,
      filesProcessed,
      lastUploadName: workspace.lastUploadName,
      normalization: {
        geminiFiles: 0,
        fallbackFiles: filesProcessed.length,
        warnings,
      },
      metrics: workspace.metrics,
      perPlatform: workspace.perPlatform,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Upload failed.' });
  }
});

app.get('/api/metrics', (req, res) => {
  ensureWorkspaceMetrics();
  return res.json({
    metrics: workspace.metrics || {},
    perPlatform: workspace.perPlatform || {},
    lastUploadName: workspace.lastUploadName || '',
  });
});

app.get('/api/posts', (req, res) => {
  const posts = Array.isArray(workspace.posts) ? workspace.posts.slice().sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0)) : [];
  return res.json({ posts });
});

app.post('/api/posts', (req, res) => {
  try {
    const body = req.body || {};
    const platform = String(body.platform || 'Upload').trim();
    const title = String(body.title || body.name || 'Untitled post').trim();
    const transcript = String(body.transcript || body.caption || '').trim();
    const postedAt = body.postedAt ? String(body.postedAt).trim() : null;
    const likes = safeNumber(body.likes);
    const comments = safeNumber(body.comments);
    const shares = safeNumber(body.shares);
    const reactions = safeNumber(body.reactions);
    const clicks = safeNumber(body.clicks);
    const views = safeNumber(body.views);
    const followers = safeNumber(body.followers);
    const status = postedAt && new Date(postedAt) <= new Date() ? 'posted' : 'scheduled';
    const post = {
      id: crypto.randomBytes(8).toString('hex'),
      platform,
      title,
      transcript,
      postedAt: postedAt || null,
      status,
      engagement: { likes, comments, shares, reactions, total: likes + comments + shares + reactions },
      reach: views,
      clicks,
      views,
      followers,
      createdAt: Date.now(),
      raw: body,
    };
    workspace.posts.unshift(post);
    persistWorkspace();
    return res.json({ post });
  } catch (error) {
    return res.status(500).json({ message: error.message || 'Unable to save post.' });
  }
});

app.delete('/api/posts/:id', (req, res) => {
  const id = String(req.params.id || '');
  const posts = Array.isArray(workspace.posts) ? workspace.posts : [];
  const nextPosts = posts.filter((post) => post.id !== id);
  if (nextPosts.length === posts.length) return res.status(404).json({ message: 'not found' });
  workspace.posts = nextPosts;
  workspace.metrics = aggregateMetrics(workspace.posts);
  saveWorkspace();
  return res.json({ ok: true });
});

app.get('/api/google/oauth-url', (req, res) => {
  return res.status(501).json({ message: 'Google OAuth is not configured in this demo API.' });
});

app.get('/api/google/status', (req, res) => {
  return res.json({ gsc: null, ga4: null });
});

app.get('/api/auth/connect-link', async (req, res) => {
  try {
    const result = await metricoolFetch('/profile/admin', 'GET');
    const connectUrl = result?.connectUrl || result?.oauthUrl || `${METRICOOL_API_BASE}/oauth/whitelabel?userId=${METRICOOL_USER_ID}`;
    return res.json({ connectUrl });
  } catch (error) {
    return res.status(502).json({ error: `Could not load connect-link: ${error.message}` });
  }
});

app.post('/api/schedule-post', async (req, res) => {
  try {
    const payload = req.body;
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ error: 'Scheduling payload must be a valid JSON object.' });
    }

    const result = await metricoolFetch('/schedule/post', 'POST', payload);
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(502).json({ error: `Scheduling failed: ${error.message}` });
  }
});

app.get('/api/content-lab/calendar', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await metricoolFetch('/content/calendar', 'GET', { startDate, endDate });
    return res.json({ calendar: result.data || result || [] });
  } catch (error) {
    return res.status(502).json({ error: `Calendar lookup failed: ${error.message}` });
  }
});

app.get('/api/reports/competitors', async (req, res) => {
  try {
    const handles = String(req.query.handles || req.query.competitors || '').split(',').map((item) => item.trim()).filter(Boolean);
    const result = await metricoolFetch('/reports/competitors', 'GET', { handles: handles.join(',') });
    return res.json({ competitors: result.data || result || [], requestedHandles: handles });
  } catch (error) {
    return res.status(502).json({ error: `Competitor report fetch failed: ${error.message}` });
  }
});

app.post('/api/scheduling/generate-caption', async (req, res) => {
  try {
    const body = req.body;
    if (!body || !body.topic) {
      return res.status(400).json({ error: 'Caption generation requires a topic field.' });
    }

    const result = await metricoolFetch('/scheduling/generate-caption', 'POST', body);
    return res.json({ caption: result.caption || result.text || '', raw: result });
  } catch (error) {
    return res.status(502).json({ error: `Caption generation failed: ${error.message}` });
  }
});

app.get('/api/dashboard/feedback/best-times', async (req, res) => {
  try {
    const heatmap = [];
    const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

    for (const day of days) {
      const row = { day, hours: [] };
      for (let hour = 6; hour <= 22; hour += 2) {
        const score = 20 + Math.floor(Math.random() * 70);
        row.hours.push({ hour: `${hour}:00`, score, recommendation: score > 60 ? 'High' : score > 40 ? 'Medium' : 'Low' });
      }
      heatmap.push(row);
    }

    return res.json({ bestTimes: heatmap, labels: ['6:00', '8:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00', '22:00'] });
  } catch (error) {
    return res.status(500).json({ error: `Best-times feedback failed: ${error.message}` });
  }
});

app.get('/health', (req, res) => {
  return res.json({ status: 'ok' });
});

app.get(/^(?!\/api).*/, (req, res) => {
  return res.sendFile(path.join(publicDir, 'landing.html'));
});

app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint not found.' });
});

app.listen(PORT, () => {
  console.log(`Express dashboard API is running on http://localhost:${PORT}`);
});
