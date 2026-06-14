const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
const {
  getSocialAuthLinks,
  scheduleSocialPost,
  getScheduledCalendarPosts,
  getSocialAnalytics,
} = require('./api/postizClient');
require('dotenv').config();
const apiEnvPath = path.join(__dirname, 'API.env');
if (fs.existsSync(apiEnvPath)) {
  require('dotenv').config({ path: apiEnvPath, override: true });
}

// Load GA4 service account
let ga4ServiceAccount = null;
try {
  const gaConfigPath = path.join(__dirname, 'ga4-config.json');
  if (fs.existsSync(gaConfigPath)) {
    ga4ServiceAccount = JSON.parse(fs.readFileSync(gaConfigPath, 'utf8'));
    console.log('✓ GA4 Service Account loaded');
  }
} catch (err) {
  console.warn('GA4 Service Account not found or invalid:', err.message);
}

const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'application/javascript',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.pdf': 'application/pdf',
};

const staticDir = path.join(__dirname, 'public');
const uploadsDir = path.join(staticDir, 'uploads');
const sessionsFile = path.join(__dirname, 'sessions.json');
const clientHubFile = path.join(__dirname, 'client-hub-records.json');
const newsletterSubscribersFile = path.join(__dirname, 'newsletter-subscribers.json');
const appDataFile = path.join(__dirname, 'app-data.json');
const positioningReportsFile = path.join(__dirname, 'positioning-reports.json');
const loadSessions = () => {
  try {
    const raw = fs.readFileSync(sessionsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    return [];
  }
};
const saveSessions = (sessions) => {
  try {
    fs.writeFileSync(sessionsFile, JSON.stringify(sessions, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist sessions:', err);
  }
};
const loadClientHubRecords = () => {
  try {
    const raw = fs.readFileSync(clientHubFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
};
const saveClientHubRecords = (records) => {
  try {
    fs.writeFileSync(clientHubFile, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist client hub records:', err);
  }
};
const loadNewsletterSubscribers = () => {
  try {
    const raw = fs.readFileSync(newsletterSubscribersFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (err) {
    return {};
  }
};
const saveNewsletterSubscribers = (records) => {
  try {
    fs.writeFileSync(newsletterSubscribersFile, JSON.stringify(records, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist newsletter subscribers:', err);
  }
};
const loadPositioningReports = () => {
  try {
    const raw = fs.readFileSync(positioningReportsFile, 'utf8');
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : { reports: [] };
  } catch (err) {
    return { reports: [] };
  }
};
const savePositioningReports = (data) => {
  try {
    fs.writeFileSync(positioningReportsFile, JSON.stringify(data, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist positioning reports:', err);
  }
};

let sessions = loadSessions();
let clientHubRecords = loadClientHubRecords();
let newsletterSubscribers = loadNewsletterSubscribers();
let positioningReports = loadPositioningReports();
let appState = {
  users: {},
};

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  '';
const GEMINI_UPLOAD_MODEL = process.env.GEMINI_UPLOAD_MODEL || 'gemini-2.0-flash';
const GEMINI_SUGGESTIONS_MODEL = process.env.GEMINI_SUGGESTIONS_MODEL || GEMINI_UPLOAD_MODEL;
const DEEPSEEK_API_KEY = process.env.DEEPSEEK_API_KEY || '';
const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';
const AI_UPLOAD_PROVIDER = process.env.AI_UPLOAD_PROVIDER || 'gemini';
const AI_SUGGESTIONS_PROVIDER = process.env.AI_SUGGESTIONS_PROVIDER || 'deepseek';
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM_EMAIL = process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev';
const RESEND_NEWSLETTER_REPLY_TO = process.env.RESEND_NEWSLETTER_REPLY_TO || '';
const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY || '';
const POSTIZ_CUSTOMER_ID = process.env.POSTIZ_CUSTOMER_ID || '';
const POSTIZ_API_BASE = process.env.POSTIZ_API_BASE_URL || 'https://api.postiz.com/public/v1';
const POSTIZ_TIMEZONE = process.env.POSTIZ_TIMEZONE || 'Asia/Dubai';
const PUBLIC_APP_URL = String(process.env.PUBLIC_APP_URL || '').replace(/\/+$/, '');
const ADMIN_EMAILS = String(process.env.ADMIN_EMAILS || '')
  .split(',')
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);
const googleTokenStore = {}; // keyed by session token
const geminiClient = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

function createEmptyMetrics() {
  return {
    reach: 0,
    interactions: 0,
    clicks: 0,
    reactions: 0,
    views: 0,
    follows: 0,
    engagementRate: 0,
  };
}

function createEmptyWorkspace() {
  return {
    posts: [],
    metrics: createEmptyMetrics(),
    perPlatform: {},
    platformDashboards: {},
    lastUploadName: null,
    reports: [],
    onboarding: createEmptyOnboarding(),
    strategyReports: {},
    updatedAt: new Date().toISOString(),
  };
}

function createEmptyOnboarding() {
  return {
    started: false,
    completed: false,
    currentStep: 0,
    answers: {},
    updatedAt: null,
    completedAt: null,
  };
}

function parseCsvLine(line = '') {
  const values = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const next = line[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === ',' && !inQuotes) {
      values.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  values.push(current.trim());
  return values;
}

function parseCsvTable(csv = '') {
  const lines = csv.split(/\r?\n/).filter((line) => line.trim());
  if (!lines.length) return { headers: [], rows: [] };
  const headers = parseCsvLine(lines[0]).map((header) => header.trim());
  const rows = lines.slice(1).map((line) => parseCsvLine(line));
  return { headers, rows };
}

function normalizeKey(value = '') {
  return String(value).trim().toLowerCase().replace(/[^a-z0-9]+/g, '');
}

function coerceNumber(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const normalized = String(value ?? '')
    .replace(/[%,$]/g, '')
    .replace(/,/g, '')
    .trim();
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function parsePostedAt(value) {
  if (!value) return 0;
  const parsed = Date.parse(String(value).trim());
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatIsoDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function postizPlatform(value = '') {
  const platform = String(value || '').trim().toLowerCase();
  if (platform === 'twitter') return 'x';
  if (platform === 'google business' || platform === 'googlebusinessprofile' || platform === 'googlebusiness') return 'gmb';
  if (platform === 'linkedin page' || platform === 'linkedinpage') return 'linkedin-page';
  return platform.replace(/\s+/g, '');
}

function displayPlatform(value = '') {
  const platform = String(value || '').trim().toLowerCase();
  const labels = {
    facebook: 'Facebook',
    instagram: 'Instagram',
    linkedin: 'LinkedIn',
    tiktok: 'TikTok',
    snapchat: 'Snapchat',
    twitter: 'Twitter',
    threads: 'Threads',
    pinterest: 'Pinterest',
    youtube: 'YouTube',
    reddit: 'Reddit',
    bluesky: 'Bluesky',
    gmb: 'Google Business',
    googlebusiness: 'Google Business',
  };
  return labels[platform] || String(value || 'Social').trim() || 'Social';
}

function extractPostizList(payload, key) {
  if (Array.isArray(payload)) return payload;
  if (Array.isArray(payload?.[key])) return payload[key];
  if (Array.isArray(payload?.data)) return payload.data;
  if (Array.isArray(payload?.items)) return payload.items;
  if (Array.isArray(payload?.posts)) return payload.posts;
  return [];
}

function buildPostizUrl(endpoint, query = {}) {
  const url = new URL(`${POSTIZ_API_BASE}${endpoint}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url;
}

async function postizFetch(endpoint, method = 'GET', body = null) {
  if (!POSTIZ_API_KEY) throw new Error('Postiz API key is required in API.env as POSTIZ_API_KEY');
  const url = buildPostizUrl(endpoint, method === 'GET' ? body || {} : {});
  const payload = method === 'GET' || !body ? '' : JSON.stringify(body);

  return new Promise((resolve, reject) => {
    const transport = url.protocol === 'http:' ? http : https;
    const request = transport.request(url, {
      method,
      headers: {
        Authorization: POSTIZ_API_KEY,
        'Content-Type': 'application/json',
        ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
      },
    }, (response) => {
      let raw = '';
      response.on('data', (chunk) => { raw += chunk; });
      response.on('end', () => {
        let parsed = {};
        try {
          parsed = raw ? JSON.parse(raw) : {};
        } catch {
          parsed = { raw };
        }
        if (response.statusCode && response.statusCode >= 400) {
          return reject(new Error(parsed.error || parsed.message || raw || response.statusMessage));
        }
        resolve(parsed);
      });
    });
    request.on('error', reject);
    if (payload) request.write(payload);
    request.end();
  });
}

async function resolvePostizCustomerId(preferredCustomerId = '') {
  const customerId = String(preferredCustomerId || POSTIZ_CUSTOMER_ID || '').trim();
  if (customerId) return customerId;
  const groups = await postizFetch('/groups', 'GET').catch(() => []);
  const group = extractPostizList(groups, 'groups')[0];
  return group?.id || '';
}

function normalizeScheduledFor(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T09:00:00`;
  return text;
}

function withPostizReturnUrl(authUrl, returnUrl) {
  const cleanReturnUrl = String(returnUrl || '').trim();
  if (!cleanReturnUrl) return authUrl;
  try {
    const url = new URL(authUrl);
    const state = url.searchParams.get('state');
    if (!state) return authUrl;
    const first = state.indexOf('-');
    const second = first >= 0 ? state.indexOf('-', first + 1) : -1;
    const third = second >= 0 ? state.indexOf('-', second + 1) : -1;
    if (third < 0) return authUrl;
    url.searchParams.set('state', `${state.slice(0, third + 1)}${encodeURIComponent(cleanReturnUrl)}`);
    return url.toString();
  } catch {
    return authUrl;
  }
}

function postizMediaItems(body = {}) {
  const items = Array.isArray(body.mediaItems) ? body.mediaItems : [];
  const media = items.map((item) => ({
    id: item.id || crypto.randomBytes(6).toString('hex'),
    path: item.path || item.url,
  })).filter((item) => item.path);
  if (body.mediaUrl) {
    media.push({
      id: crypto.randomBytes(6).toString('hex'),
      path: body.mediaUrl,
    });
  }
  return media;
}

function postizSettings(platform, body = {}) {
  const type = postizPlatform(platform);
  if (type === 'instagram' || type === 'instagram-standalone') {
    return { __type: type, post_type: /story/i.test(body.postType || '') ? 'story' : 'post', is_trial_reel: false, collaborators: [] };
  }
  if (type === 'x') return { __type: 'x', who_can_reply_post: 'everyone', community: '' };
  if (type === 'linkedin' || type === 'linkedin-page') return { __type: type, post_as_images_carousel: false };
  if (type === 'facebook') return { __type: 'facebook' };
  if (type === 'youtube') return { __type: 'youtube', title: String(body.title || 'Scheduled video').slice(0, 100), type: 'public', selfDeclaredMadeForKids: 'no' };
  if (type === 'tiktok') {
    return {
      __type: 'tiktok',
      privacy_level: 'PUBLIC_TO_EVERYONE',
      duet: true,
      stitch: true,
      comment: true,
      autoAddMusic: 'no',
      brand_content_toggle: false,
      brand_organic_toggle: false,
      video_made_with_ai: false,
      content_posting_method: 'DIRECT_POST',
    };
  }
  if (type === 'gmb') return { __type: 'gmb', topicType: 'STANDARD' };
  return { __type: type };
}

function buildPostizSchedulePayload(body = {}, normalizedPlatforms = []) {
  const content = body.content || body.caption || body.transcript || '';
  const scheduledFor = normalizeScheduledFor(body.scheduledFor || body.scheduledAt);
  const media = postizMediaItems(body);
  return {
    type: body.publishNow ? 'now' : scheduledFor ? 'schedule' : 'draft',
    date: scheduledFor || undefined,
    shortLink: false,
    tags: [],
    posts: normalizedPlatforms.map((item) => ({
      integration: { id: item.accountId },
      value: [{ content, image: media }],
      settings: postizSettings(item.platform, body),
    })),
  };
}

function normalizePostizAnalyticsPost(item = {}) {
  const analytics = item.analytics || {};
  const platformAnalytics = Array.isArray(item.platformAnalytics) ? item.platformAnalytics : [];
  const firstPlatform = platformAnalytics[0] || {};
  const platform = displayPlatform(item.platform || firstPlatform.platform || item.platforms?.[0]?.platform);
  const reactions = coerceNumber(analytics.reactions || analytics.likes);
  const likes = coerceNumber(analytics.likes);
  const comments = coerceNumber(analytics.comments);
  const shares = coerceNumber(analytics.shares);
  const saves = coerceNumber(analytics.saves);
  const clicks = coerceNumber(analytics.clicks);
  const views = coerceNumber(analytics.views);
  const reach = coerceNumber(analytics.reach || analytics.impressions);
  const title = String(item.title || item.content || item.message || 'Postiz post').trim();

  return {
    id: item.postId || item._id || item.latePostId || crypto.randomBytes(8).toString('hex'),
    postizPostId: item.postId || item._id || item.latePostId || null,
    platform,
    title: title.length > 90 ? `${title.slice(0, 87)}...` : title,
    transcript: String(item.content || item.message || '').trim(),
    engagement: {
      likes,
      comments,
      shares,
      reactions,
      saves,
      clicks,
      views,
      reach,
      follows: 0,
      interactions: likes + comments + shares + reactions + saves,
    },
    status: item.status || 'published',
    postedAt: item.publishedAt || item.scheduledFor || Date.now(),
    raw: item,
  };
}

function buildPlatformDashboardsFromPostiz(posts = [], followerStats = null) {
  const dashboards = {};
  posts.forEach((post) => {
    const platform = post.platform || 'Social';
    dashboards[platform] = dashboards[platform] || {
      platform,
      filename: 'Postiz live analytics',
      uploadedAt: new Date().toISOString(),
      rows: [],
      postizRows: [],
      metricoolRows: [],
    };
    dashboards[platform].rows.push({
      date: formatIsoDate(post.postedAt || Date.now()),
      metrics: {
        Impressions: coerceNumber(post.engagement?.reach),
        Reach: coerceNumber(post.engagement?.reach),
        Interactions: coerceNumber(post.engagement?.interactions),
        Clicks: coerceNumber(post.engagement?.clicks),
        Reactions: coerceNumber(post.engagement?.reactions),
        Comments: coerceNumber(post.engagement?.comments),
        Shares: coerceNumber(post.engagement?.shares),
        Views: coerceNumber(post.engagement?.views),
      },
      raw: post.raw || post,
    });
  });

  const accounts = Array.isArray(followerStats?.accounts) ? followerStats.accounts : [];
  accounts.forEach((account) => {
    const platform = displayPlatform(account.platform);
    dashboards[platform] = dashboards[platform] || {
      platform,
      filename: 'Postiz live analytics',
      uploadedAt: new Date().toISOString(),
      rows: [],
      postizRows: [],
      metricoolRows: [],
    };
    dashboards[platform].rows.push({
      date: formatIsoDate(Date.now()),
      metrics: {
        Follows: coerceNumber(account.currentFollowers),
        Followers: coerceNumber(account.currentFollowers),
        'Follower Growth': coerceNumber(account.growth),
      },
      raw: account,
    });
  });
  return dashboards;
}

function analyticsSeriesValue(series = {}) {
  const points = Array.isArray(series.data) ? series.data : [];
  if (!points.length) return coerceNumber(series.total || series.value || 0);
  return points.reduce((total, point) => total + coerceNumber(point.total || point.value), 0);
}

function rowsFromPostizAnalytics(integration = {}, analytics = []) {
  const platform = displayPlatform(integration.identifier || integration.providerIdentifier);
  const byDate = new Map();
  analytics.forEach((series) => {
    const label = String(series.label || '').trim();
    const points = Array.isArray(series.data) ? series.data : [];
    points.forEach((point) => {
      const date = formatIsoDate(point.date || Date.now());
      if (!date) return;
      if (!byDate.has(date)) byDate.set(date, { date, metrics: {}, raw: { integration, analytics } });
      byDate.get(date).metrics[label] = coerceNumber(point.total || point.value);
    });
  });
  if (!byDate.size && analytics.length) {
    const metrics = {};
    analytics.forEach((series) => {
      if (series.label) metrics[series.label] = analyticsSeriesValue(series);
    });
    byDate.set(formatIsoDate(Date.now()), { date: formatIsoDate(Date.now()), metrics, raw: { integration, analytics } });
  }
  return { platform, rows: Array.from(byDate.values()) };
}

function buildPostizPost(item = {}) {
  const integration = item.integration || {};
  const platform = displayPlatform(integration.providerIdentifier || integration.identifier || item.platform);
  const title = String(item.title || item.content || item.value?.[0]?.content || 'Postiz post').trim();
  const postedAt = item.publishDate || item.date || item.scheduledFor || item.createdAt || Date.now();
  return {
    id: item.id || crypto.randomBytes(8).toString('hex'),
    postizPostId: item.id || null,
    platform,
    title: title.length > 90 ? `${title.slice(0, 87)}...` : title,
    transcript: String(item.content || item.value?.[0]?.content || '').trim(),
    engagement: { likes: 0, comments: 0, shares: 0, reactions: 0, saves: 0, clicks: 0, views: 0, reach: 0, follows: 0, interactions: 0 },
    status: item.state || item.status || 'scheduled',
    postedAt,
    raw: item,
  };
}

async function fetchPostizWorkspaceMetrics(query = {}) {
  const customer = await resolvePostizCustomerId(query.customer || query.group || query.profileId);
  const integrations = extractPostizList(await postizFetch('/integrations', 'GET', { group: customer }), 'integrations');
  const groups = extractPostizList(await postizFetch('/groups', 'GET').catch(() => []), 'groups');
  const days = String(query.days || query.date || 30);
  const wantedPlatform = postizPlatform(query.platform || '');
  const visibleIntegrations = integrations.filter((item) => {
    if (item.disabled) return false;
    if (!wantedPlatform) return true;
    return postizPlatform(item.identifier || item.providerIdentifier) === wantedPlatform;
  });
  const analytics = {};
  const platformDashboards = {};
  const followerStats = { accounts: [] };
  for (const integration of visibleIntegrations) {
    const rows = await postizFetch(`/analytics/${encodeURIComponent(integration.id)}`, 'GET', { date: days }).catch((error) => ({ error: error.message }));
    analytics[integration.id] = rows;
    const series = Array.isArray(rows) ? rows : [];
    const dashboard = rowsFromPostizAnalytics(integration, series);
    platformDashboards[dashboard.platform] = platformDashboards[dashboard.platform] || {
      platform: dashboard.platform,
      filename: 'Postiz live analytics',
      uploadedAt: new Date().toISOString(),
      rows: [],
      postizRows: [],
      metricoolRows: [],
    };
    platformDashboards[dashboard.platform].rows.push(...dashboard.rows);
    const followerSeries = series.find((item) => /follower/i.test(item.label || ''));
    followerStats.accounts.push({
      platform: integration.identifier || integration.providerIdentifier,
      displayName: integration.name || integration.profile,
      currentFollowers: followerSeries ? analyticsSeriesValue(followerSeries) : 0,
      raw: integration,
    });
  }
  const now = new Date();
  const startDate = query.startDate || query.fromDate || new Date(now.getTime() - Number(days) * 86400000).toISOString();
  const endDate = query.endDate || query.toDate || now.toISOString();
  const postsResult = await postizFetch('/posts', 'GET', { startDate, endDate, customer }).catch(() => ({ posts: [] }));
  const posts = extractPostizList(postsResult, 'posts').map(buildPostizPost);
  const workspace = createEmptyWorkspace();
  workspace.posts = posts;
  workspace.platformDashboards = platformDashboards;
  recalcMetrics(workspace);
  return {
    metrics: workspace.metrics,
    perPlatform: workspace.perPlatform,
    platformDashboards: workspace.platformDashboards,
    dailyData: buildDailyData(workspace),
    posts,
    postiz: { analytics, integrations, groups, followerStats, posts: postsResult, customer },
  };
}

function buildSeedPosts() {
  const daysAgo = (count) => {
    const date = new Date();
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - count);
    return date.getTime();
  };

  return [
    {
      id: 'seed-p1',
      platform: 'Instagram',
      title: 'Spring campaign reel',
      transcript: 'Launch reel focused on product styling ideas.',
      engagement: { likes: 420, comments: 42, shares: 18, views: 4100, reach: 6200, follows: 44, clicks: 120 },
      status: 'posted',
      postedAt: daysAgo(6),
    },
    {
      id: 'seed-p2',
      platform: 'Instagram',
      title: 'Behind the scenes carousel',
      transcript: 'Team process and storytelling carousel.',
      engagement: { likes: 360, comments: 31, shares: 14, views: 3300, reach: 5400, follows: 26, clicks: 92 },
      status: 'posted',
      postedAt: daysAgo(5),
    },
    {
      id: 'seed-p3',
      platform: 'LinkedIn',
      title: 'Industry insight document',
      transcript: 'Thought leadership PDF post for decision makers.',
      engagement: { likes: 180, comments: 16, shares: 11, views: 1700, reach: 2800, follows: 9, clicks: 74 },
      status: 'posted',
      postedAt: daysAgo(4),
    },
    {
      id: 'seed-p4',
      platform: 'TikTok',
      title: 'Trend response short-form video',
      transcript: 'Fast reaction edit tied to a relevant trend.',
      engagement: { likes: 690, comments: 58, shares: 29, views: 7200, reach: 9600, follows: 61, clicks: 88 },
      status: 'posted',
      postedAt: daysAgo(3),
    },
    {
      id: 'seed-p5',
      platform: 'Facebook',
      title: 'Community spotlight post',
      transcript: 'Customer quote and testimonial spotlight.',
      engagement: { likes: 210, comments: 24, shares: 19, views: 2100, reach: 3900, follows: 15, clicks: 67 },
      status: 'posted',
      postedAt: daysAgo(2),
    },
    {
      id: 'seed-p6',
      platform: 'Instagram',
      title: 'Offer reminder story set',
      transcript: 'Time-sensitive CTA sequence.',
      engagement: { likes: 280, comments: 20, shares: 12, views: 2900, reach: 4300, follows: 19, clicks: 138 },
      status: 'posted',
      postedAt: daysAgo(1),
    },
  ];
}

function platformFromFilename(filename = '') {
  const base = String(filename).toLowerCase();
  if (base.startsWith('ig_') || base.includes('instagram')) return 'Instagram';
  if (base.startsWith('fb_') || base.includes('facebook')) return 'Facebook';
  if (base.startsWith('link_') || base.startsWith('linkedin_') || base.includes('linkedin') || base.includes('linkedlin')) return 'LinkedIn';
  if (base.startsWith('tiktok_') || base.includes('tiktok')) return 'TikTok';
  if (base.startsWith('snap_') || base.includes('snapchat')) return 'Snapchat';
  return 'Upload';
}

function platformFromUpload(fileObj = {}) {
  const explicitPlatform = String(fileObj.platform || '').trim();
  if (['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'Snapchat'].includes(explicitPlatform)) {
    return explicitPlatform;
  }
  return platformFromFilename([
    fileObj.filename || fileObj.name || '',
    String(fileObj.csv || '').slice(0, 5000),
  ].join('\n'));
}

function extractJsonPayload(text = '') {
  const trimmed = String(text || '').trim();
  if (!trimmed) return null;
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1].trim() : trimmed;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1 || end < start) return null;
  return candidate.slice(start, end + 1);
}

function buildStandardPost(row, globalIndex, fallbackPlatform = 'Upload') {
  return {
    id: 'p' + (globalIndex + 1),
    platform: row.platform || fallbackPlatform,
    title: row.title || `Upload row ${globalIndex + 1}`,
    transcript: row.transcript || '',
    engagement: {
      likes: coerceNumber(row.likes),
      comments: coerceNumber(row.comments),
      shares: coerceNumber(row.shares),
      views: coerceNumber(row.views),
      reach: coerceNumber(row.reach),
      follows: coerceNumber(row.follows),
      clicks: coerceNumber(row.clicks),
      interactions: coerceNumber(row.interactions),
      reactions: coerceNumber(row.reactions),
    },
    status: 'posted',
    postedAt: parsePostedAt(row.postedAt),
  };
}

function buildPostsFromNormalizedRows(rows, filename, globalIndexOffset) {
  const fallbackPlatform = platformFromFilename(filename);
  return rows.map((row, idx) => buildStandardPost(row || {}, globalIndexOffset + idx, fallbackPlatform));
}

function buildPostsFromUploadRows(rows, fileObj, globalIndexOffset) {
  const fallbackPlatform = platformFromUpload(fileObj);
  return rows.map((row, idx) => buildStandardPost(row || {}, globalIndexOffset + idx, fallbackPlatform));
}

function buildReportMetricsFromSummary(summaryMetrics) {
  return [
    { label: 'Reach', value: Number(summaryMetrics.reach || 0) },
    { label: 'Interactions', value: Number(summaryMetrics.interactions || 0) },
    { label: 'Clicks', value: Number(summaryMetrics.clicks || 0) },
    { label: 'Reactions', value: Number(summaryMetrics.reactions || 0) },
    { label: 'Views', value: Number(summaryMetrics.views || 0) },
    { label: 'Followers', value: Number(summaryMetrics.follows || 0) },
    { label: 'Avg Engagement Rate', value: Number(summaryMetrics.engagementRate || 0), sub: '%' },
  ];
}

function getRowValue(row, keyMap, aliases) {
  const aliasList = Array.isArray(aliases) ? aliases : [aliases];
  for (const alias of aliasList) {
    const columnIndex = keyMap[normalizeKey(alias)];
    if (columnIndex !== undefined) return row[columnIndex] || '';
  }
  return '';
}

function parseFileLocally(fileObj, globalIndexOffset) {
  const { filename, csv } = fileObj;
  if (!csv) throw new Error('csv required');
  const uploadPlatform = platformFromUpload(fileObj);

  const { headers, rows } = parseCsvTable(csv);
  if (!headers.length) throw new Error('empty csv');

  const keyMap = headers.reduce((acc, header, index) => {
    acc[normalizeKey(header)] = index;
    return acc;
  }, {});

  const requiredStandard = ['platform', 'title'];
  const hasStandard = requiredStandard.every((key) => keyMap[normalizeKey(key)] !== undefined);

  if (hasStandard) {
    return rows.map((row, idx) =>
      buildStandardPost(
        {
          platform: getRowValue(row, keyMap, 'platform') || uploadPlatform,
          title: getRowValue(row, keyMap, 'title'),
          transcript: getRowValue(row, keyMap, 'transcript'),
          likes: getRowValue(row, keyMap, 'likes'),
          comments: getRowValue(row, keyMap, 'comments'),
          shares: getRowValue(row, keyMap, 'shares'),
          views: getRowValue(row, keyMap, 'views'),
          reach: getRowValue(row, keyMap, 'reach'),
          follows: getRowValue(row, keyMap, 'follows'),
          clicks: getRowValue(row, keyMap, 'clicks'),
          interactions: getRowValue(row, keyMap, ['interaction', 'interactions', 'engagements', 'totalinteractions']),
          reactions: getRowValue(row, keyMap, ['reaction', 'reactions', 'likes']),
          postedAt: getRowValue(row, keyMap, ['postedAt', 'posted at', 'date']),
        },
        globalIndexOffset + idx,
        uploadPlatform
      )
    );
  }

  const hasMonthSummary =
    keyMap[normalizeKey('Month')] !== undefined &&
    (keyMap[normalizeKey('Views')] !== undefined ||
      keyMap[normalizeKey('Reach')] !== undefined ||
      keyMap[normalizeKey('Impressions')] !== undefined);

  if (hasMonthSummary) {
    return rows.map((row, idx) => {
      const monthValue = getRowValue(row, keyMap, ['Month', 'Date', 'postedAt']) || 'Unknown';
      const postedAtRaw = String(monthValue).trim();
      const postedAt = postedAtRaw;
      const title = `${postedAtRaw} summary ${idx + 1}`;
      return buildStandardPost(
        {
          platform: uploadPlatform,
          title,
          likes: getRowValue(row, keyMap, ['Likes', 'Reactions']),
          comments: getRowValue(row, keyMap, 'Comments'),
          shares: getRowValue(row, keyMap, ['Shares', 'Reposts']),
          views: getRowValue(row, keyMap, ['Views', 'Viewers']),
          reach: getRowValue(row, keyMap, ['Reach', 'Impressions', 'Unique impressions']),
          follows: getRowValue(row, keyMap, 'Follows'),
          clicks: getRowValue(row, keyMap, ['Link Clicks', 'Clicks', 'Profile Visits', 'Visits']),
          interactions: getRowValue(row, keyMap, ['Interaction', 'Interactions', 'Engagements', 'TotalInteractions']),
          reactions: getRowValue(row, keyMap, ['Reaction', 'Reactions', 'Likes']),
          postedAt,
        },
        globalIndexOffset + idx,
        uploadPlatform
      );
    });
  }

  throw new Error('Unsupported CSV format');
}

function labelizeMetricName(value = '') {
  return String(value || '')
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function normalizeDashboardRow(rawRow = {}) {
  const metrics = {};
  let date = '';

  Object.entries(rawRow).forEach(([key, value]) => {
    const normalized = normalizeKey(key);
    if (!date && /date|day|period|posted|publish|timestamp/.test(normalized)) {
      const parsedDate = new Date(String(value || '').trim());
      date = Number.isNaN(parsedDate.getTime())
        ? String(value || '').trim()
        : parsedDate.toISOString().slice(0, 10);
      return;
    }

    const rawValue = String(value ?? '').trim();
    if (!rawValue) return;
    const numericValue = coerceNumber(rawValue);
    if (!Number.isFinite(numericValue)) return;
    metrics[labelizeMetricName(key)] = numericValue;
  });

  return { date, metrics, raw: rawRow };
}

function buildGenericDashboardRows(fileObj = {}) {
  const { headers, rows } = parseCsvTable(fileObj.csv || '');
  if (!headers.length) return [];
  return rows
    .map((row) => headers.reduce((acc, header, index) => {
      acc[header] = row[index] || '';
      return acc;
    }, {}))
    .map((row) => normalizeDashboardRow(row))
    .filter((row) => Object.keys(row.metrics || {}).length);
}

function buildPlatformDashboards(files = []) {
  return files.reduce((acc, fileObj) => {
    const filename = fileObj.filename || 'file.csv';
    const platform = platformFromUpload(fileObj);
    if (!['Instagram', 'Facebook', 'LinkedIn', 'TikTok', 'Snapchat'].includes(platform)) return acc;
    acc[platform] = {
      platform,
      filename,
      uploadedAt: new Date().toISOString(),
      rows: buildGenericDashboardRows(fileObj),
      metricoolRows: [],
    };
    return acc;
  }, {});
}

function isProviderAvailable(provider) {
  if (provider === 'gemini') return Boolean(geminiClient);
  if (provider === 'deepseek') return Boolean(DEEPSEEK_API_KEY);
  return false;
}

function getProviderSequence(preferredProvider, fallbackProviders = []) {
  const sequence = [preferredProvider, ...fallbackProviders].filter(Boolean);
  return sequence.filter((provider, index) => sequence.indexOf(provider) === index);
}

function getCampaignProviderSequence() {
  return getProviderSequence(AI_SUGGESTIONS_PROVIDER, ['gemini', 'deepseek']);
}

function buildCampaignAiErrorMessage(error, toolName) {
  const message = String(error?.message || '');
  if (/No AI provider is configured/i.test(message)) {
    return 'AI is not configured yet. Add a valid GEMINI_API_KEY or DEEPSEEK_API_KEY in API.env, then restart the server.';
  }
  if (/invalid|payload|JSON|generate|empty/i.test(message)) {
    return `${toolName} could not produce a clean result from the details provided. Add a little more context about what you want generated and try again.`;
  }
  return `${toolName} could not generate right now. Gemini may be unavailable or rejecting the request, and no fallback provider completed it. Check API.env and restart the server after changes.`;
}

function buildContentAiErrorMessage(error, toolName) {
  const message = String(error?.message || '');
  if (/No AI provider is configured/i.test(message)) {
    return 'AI is not configured yet. Add a valid GEMINI_API_KEY or DEEPSEEK_API_KEY in API.env, then restart the server.';
  }
  if (/invalid|payload|JSON|generate|empty/i.test(message)) {
    return `${toolName} needs a little more context before it can generate something useful. Add a clearer topic, audience, goal, or key message and try again.`;
  }
  return `${toolName} could not generate right now. The API provider may be unavailable or rejecting the request, so try again after checking API.env and restarting the server.`;
}

function fallbackAdCopyGrade(platform, adCopy) {
  const text = cleanAiText(adCopy);
  const hasQuestion = /\?/.test(text);
  const hasCta = /\b(book|buy|shop|start|try|join|download|learn|claim|schedule|get)\b/i.test(text);
  const hasBenefit = /\b(save|grow|faster|better|increase|reduce|clear|easy|proven|free)\b/i.test(text);
  const lengthScore = text.length > 45 && text.length < 240 ? 8 : 6;
  const scores = {
    hookStrength: hasQuestion || text.length < 120 ? 7 : 6,
    clarity: lengthScore,
    callToAction: hasCta ? 8 : 5,
    emotionalPull: hasBenefit ? 7 : 5,
    platformRelevance: /instagram|tiktok/i.test(platform) && text.length > 180 ? 6 : 7,
  };
  const overallScore = Object.values(scores).reduce((sum, score) => sum + score, 0) * 2;
  return {
    platform,
    scores,
    overallScore,
    strengths: [
      'The message is direct enough for a reader to understand the offer quickly.',
      hasBenefit ? 'It includes a clear benefit that gives the audience a reason to care.' : 'It has room to add a stronger audience benefit.',
      hasCta ? 'The copy includes an action cue that can move people toward conversion.' : 'The core offer is present and can support a stronger call to action.',
    ],
    improvements: [
      'Lead with the most specific audience pain point or desired outcome.',
      'Make the call to action more concrete and time-bound.',
      'Add one proof point, number, or differentiator to increase trust.',
    ],
    rewrittenVersions: [
      `Want ${platform} copy that feels clearer and converts faster? ${text.replace(/\s+/g, ' ').replace(/[.!?]*$/, '')}. Start with one focused next step today.`,
      `Stop guessing what to post. ${text.replace(/\s+/g, ' ').replace(/[.!?]*$/, '')}. Book a quick demo and see the workflow in action.`,
    ],
  };
}

function fallbackCreativeBrief(inputs = {}) {
  const campaignName = cleanAiText(inputs.campaignName || 'Campaign');
  const platforms = cleanAiText(inputs.platforms || 'Selected platforms');
  const objective = cleanAiText(inputs.objective || 'Drive measurable campaign results');
  const audience = cleanAiText(inputs.audience || 'Target audience');
  const tone = cleanAiText(inputs.tone || 'Professional');
  const keyMessage = cleanAiText(inputs.keyMessage || 'Communicate a clear value proposition');
  return {
    brief: {
      campaignOverview: `${campaignName} is a ${tone.toLowerCase()} campaign for ${platforms}. The campaign focuses on ${objective.toLowerCase()} with the core message: ${keyMessage}. Budget: ${cleanAiText(inputs.budget || 'Not specified')}. Deadline: ${cleanAiText(inputs.deadline || 'Not specified')}.`,
      objectivesKpis: `Primary objective: ${objective}. Recommended KPIs include reach, click-through rate, saves, qualified leads, conversion rate, and cost per result.`,
      targetAudienceDeepDive: `The campaign should speak to ${audience}. Focus on their practical pain points, desired outcomes, objections, and the moment that makes them ready to act.`,
      creativeDirectionMood: `Use a ${tone.toLowerCase()} visual and verbal direction. Keep layouts clean, benefit-led, and easy to scan on mobile.`,
      contentFormatRecommendations: `Use short-form video, carousel explainers, testimonial proof, static offer posts, and retargeting variants adapted to ${platforms}.`,
      keyMessagesHooks: `Lead with the strongest outcome, then support it with proof. Example hook: "What changes when ${audience} can ${objective.toLowerCase()} without extra friction?"`,
      callToActionOptions: 'Book a demo, Start today, Get the guide, See the workflow, Claim your strategy session.',
      successMetrics: 'Track impressions, engagement rate, CTR, conversion rate, leads generated, cost per lead, and creative fatigue after launch.',
      conclusion: `${campaignName} should stay focused on one audience, one promise, and one next action. Strong creative consistency will make the campaign easier to test and optimize.`,
    },
  };
}

function fallbackCaption({ topic, title, platform, postType }) {
  const subject = cleanAiText(topic || title || 'your next update');
  const safePlatform = cleanAiText(platform || 'Instagram');
  return {
    provider: 'local-fallback',
    caption: `${subject}\n\nHere is the part worth paying attention to: a specific moment, idea, or outcome your audience can actually use. Save this for later, share it with someone who needs it, or tell us what you would add next.`,
    hashtags: ['#ContentStrategy', '#SocialMedia', '#Marketing', '#BrandGrowth'],
  };
}

function fallbackGhost({ topic, platform, tone, audience, keyPoints }) {
  const subject = cleanAiText(topic || 'your topic');
  const safeAudience = cleanAiText(audience || 'your audience');
  const points = cleanAiText(keyPoints || 'clarity, consistency, action');
  return {
    provider: 'local-fallback',
    content: `${subject}\n\nFor ${safeAudience}, the strongest ${platform || 'content'} starts with a clear promise. A ${String(tone || 'professional').toLowerCase()} tone should explain the problem, show why it matters now, and give the reader a useful next step.\n\nKey points to cover: ${points}.\n\nClose by connecting the idea to a practical outcome the audience can remember and act on.`,
    differentiation: 'This version differentiates by focusing on a specific audience problem, a clear point of view, and a practical action rather than generic awareness copy.',
    keyPointsCovered: points.split(',').map((point) => cleanAiText(point)).filter(Boolean),
  };
}

function fallbackHooks({ topic, tone, platform, count }) {
  const subject = cleanAiText(topic || 'your content');
  const safeCount = Math.min(12, Math.max(4, Number(count) || 8));
  const templates = [
    `The truth about ${subject}`,
    `Stop making this ${platform || 'content'} mistake`,
    `What nobody tells you about ${subject}`,
    `Before you post about ${subject}, read this`,
    `${subject}: the simple fix`,
    `Why ${subject} is not working yet`,
    `A better way to approach ${subject}`,
    `Use this ${String(tone || 'curiosity').toLowerCase()} angle for ${subject}`,
    `If ${subject} feels hard, start here`,
    `Turn ${subject} into action`,
    `The fastest way to clarify ${subject}`,
    `Your audience needs this about ${subject}`,
  ];
  return { provider: 'local-fallback', hooks: templates.slice(0, safeCount) };
}

function fallbackIdeas({ industry, platform, goal, count }) {
  const safeIndustry = cleanAiText(industry || 'your niche');
  const safeGoal = cleanAiText(goal || 'engagement');
  const safeCount = Math.min(20, Math.max(6, Number(count) || 10));
  const ideas = Array.from({ length: safeCount }, (_, index) => ({
    title: `${safeIndustry} idea ${index + 1}`,
    description: `Create a ${platform || 'social'} post that supports ${safeGoal.toLowerCase()} by showing one audience problem, one useful insight, and one clear next step.`,
  }));
  return { provider: 'local-fallback', ideas };
}

function normalizePositioningReport(raw = {}, inputs = {}) {
  const messaging = raw.messaging || raw.messagingFramework || {};
  const targetAudiences = messaging.targetAudiences || messaging.audienceSegments || messaging.targetAudience || [];
  const supportingMessages = messaging.supportingMessages || messaging.supportMessages || [];
  const callToActions = messaging.callToActions || messaging.callToActionOptions || messaging.ctas || [];

  return {
    positioningStatement: cleanAiText(raw.positioningStatement),
    taglines: cleanAiList(raw.taglines || raw.brandTaglines || raw.taglineOptions).slice(0, 3),
    differentiators: cleanAiList(raw.differentiators || raw.keyDifferentiators).slice(0, 5),
    elevatorPitch: cleanAiText(raw.elevatorPitch),
    messaging: {
      coreMessage: cleanAiText(messaging.coreMessage || messaging.core),
      targetAudiences: Array.isArray(targetAudiences)
        ? targetAudiences.slice(0, 4).map((audience, index) => {
            if (typeof audience === 'string') {
              return { type: `Audience ${index + 1}`, description: cleanAiText(audience) };
            }
            return {
              type: cleanAiText(audience?.type || audience?.name || `Audience ${index + 1}`),
              description: cleanAiText(audience?.description || audience?.summary || audience?.message),
            };
          }).filter((audience) => audience.description)
        : [],
      supportingMessages: cleanAiList(supportingMessages).slice(0, 5),
      callToActions: cleanAiList(callToActions).slice(0, 5),
    },
    conclusion: cleanAiText(raw.conclusion || raw.strategicConclusion),
    provider: raw.provider || inputs.provider || undefined,
  };
}

function fallbackPositioningReport(inputs = {}) {
  const brandName = cleanAiText(inputs.brandName || 'The brand');
  const industry = cleanAiText(inputs.industry || 'its category');
  const usp = cleanAiText(inputs.usp || 'a clearer and more valuable customer experience');
  const tone = cleanAiText(inputs.tone || inputs.brandTone || 'Professional');
  const values = cleanAiList(inputs.values || inputs.brandValues || 'clarity, trust, innovation');
  const valueText = values.length ? values.join(', ') : 'clarity, trust, and innovation';

  return normalizePositioningReport({
    provider: 'local-fallback',
    positioningStatement: `${brandName} is positioned as a ${tone.toLowerCase()} ${industry} brand for customers who want ${usp}. By combining ${valueText}, ${brandName} gives its audience a confident reason to choose it over generic alternatives.`,
    taglines: [
      `${brandName}, made unmistakable.`,
      `Clearer value. Stronger choice.`,
      `Where ${industry} feels more intentional.`,
    ],
    differentiators: [
      `A clearly defined promise built around ${usp}.`,
      `A ${tone.toLowerCase()} communication style that makes the brand feel consistent and recognizable.`,
      `Values-led positioning rooted in ${valueText}.`,
      `A market presence focused on clarity, confidence, and practical customer outcomes.`,
    ],
    elevatorPitch: `${brandName} helps customers in ${industry} move beyond generic choices by offering ${usp}. The brand stands for ${valueText}, which gives every message a clear strategic center. With a ${tone.toLowerCase()} tone and a focused value proposition, ${brandName} can own a more memorable place in the market and give customers a simple reason to believe, remember, and act.`,
    messaging: {
      coreMessage: `${brandName} delivers ${usp} through a brand experience built on ${valueText}.`,
      targetAudiences: [
        { type: 'Primary buyers', description: `Customers in ${industry} who are actively comparing options and need a clearer reason to choose.` },
        { type: 'High-intent prospects', description: `People who value ${valueText} and respond to confident, outcome-led messaging.` },
      ],
      supportingMessages: [
        `${brandName} makes the value of the offer easy to understand and easy to trust.`,
        `The brand turns ${usp} into a practical advantage customers can remember.`,
        `Every touchpoint should reinforce ${valueText} with simple, specific proof.`,
      ],
      callToActions: ['Discover the difference', 'Start with a clearer strategy', 'See how it works', 'Build your brand position'],
    },
    conclusion: `${brandName} has a strong opportunity to stand out in ${industry} by owning a focused, values-led position. Its strongest strategic advantage is the combination of ${usp} with a consistent ${tone.toLowerCase()} voice.`,
  }, inputs);
}

async function callDeepSeekJson(prompt, input, invalidMessage) {
  if (!DEEPSEEK_API_KEY) throw new Error('DeepSeek API key not configured');

  const endpoint = new URL('/chat/completions', DEEPSEEK_BASE_URL);
  const payload = JSON.stringify({
    model: DEEPSEEK_MODEL,
    response_format: { type: 'json_object' },
    messages: [
      { role: 'system', content: prompt },
      { role: 'user', content: input },
    ],
  });

  const responseText = await new Promise((resolve, reject) => {
    const req = https.request(
      endpoint,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${DEEPSEEK_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`DeepSeek request failed with status ${res.statusCode}: ${raw}`));
          }
          resolve(raw);
        });
      }
    );

    req.on('error', reject);
    req.write(payload);
    req.end();
  });

  const parsedResponse = JSON.parse(responseText);
  const text = parsedResponse?.choices?.[0]?.message?.content || '';
  const jsonText = extractJsonPayload(text);
  if (!jsonText) throw new Error(invalidMessage);
  return JSON.parse(jsonText);
}

async function callGeminiJson(prompt, input, modelName, invalidMessage) {
  if (!geminiClient) throw new Error('Gemini API key not configured');

  try {
    const model = geminiClient.getGenerativeModel({
      model: modelName,
      generationConfig: { responseMimeType: 'application/json' },
    });
    const result = await model.generateContent(`${prompt}\n\n${input}`);
    const text = result?.response?.text?.() || '';
    const jsonText = extractJsonPayload(text);
    if (!jsonText) throw new Error(invalidMessage);
    return JSON.parse(jsonText);
  } catch (error) {
    const message = error?.message || '';
    if (/api key|permission|quota|billing|403|401|429/i.test(message)) {
      throw new Error(`Gemini API issue: ${message}`);
    }
    throw error;
  }
}

async function callAiJsonSequence(providers, prompt, input, invalidMessage) {
  const errors = [];

  for (const provider of providers) {
    if (!isProviderAvailable(provider)) continue;

    try {
      if (provider === 'gemini') {
        return await callGeminiJson(prompt, input, GEMINI_SUGGESTIONS_MODEL, invalidMessage);
      }
      if (provider === 'deepseek') {
        return await callDeepSeekJson(prompt, input, invalidMessage);
      }
      throw new Error(`Unsupported AI provider: ${provider}`);
    } catch (error) {
      errors.push({ provider, message: error.message || 'Unknown error' });
    }
  }

  if (!errors.length) {
    throw new Error('No AI provider is configured or available. Set GEMINI_API_KEY or DEEPSEEK_API_KEY in your environment.');
  }

  throw new Error(`AI generation failed: ${errors.map((entry) => `${entry.provider}: ${entry.message}`).join(' | ')}`);
}

function cleanAiText(value = '') {
  return String(value || '')
    .replace(/\*\*/g, '')
    .replace(/[`[\]]/g, '')
    .replace(/^\s*[-*]\s+/gm, '')
    .replace(/^\s*#{1,6}\s*/gm, '')
    .replace(/\s+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
    .replace(/^"|"$/g, '');
}

function cleanAiList(value) {
  if (Array.isArray(value)) return value.map(cleanAiText).filter(Boolean).slice(0, 8);
  const text = cleanAiText(value);
  return text ? [text] : [];
}

function clampScore(value, max = 10) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.max(0, Math.min(max, Math.round(numeric)));
}

function normalizeAdCopyGradeResult(raw = {}, platform = '') {
  const scores = raw.scores || {};
  const normalizedScores = {
    hookStrength: clampScore(scores.hookStrength),
    clarity: clampScore(scores.clarity),
    callToAction: clampScore(scores.callToAction),
    emotionalPull: clampScore(scores.emotionalPull),
    platformRelevance: clampScore(scores.platformRelevance),
  };
  const scoreTotal = Object.values(normalizedScores).reduce((sum, score) => sum + score, 0);
  return {
    platform: cleanAiText(raw.platform || platform),
    scores: normalizedScores,
    overallScore: clampScore(raw.overallScore || scoreTotal * 2, 100),
    strengths: cleanAiList(raw.strengths),
    improvements: cleanAiList(raw.improvements),
    rewrittenVersions: cleanAiList(raw.rewrittenVersions || raw.rewrittenVersion),
  };
}

function normalizeCreativeBriefResult(raw = {}) {
  const brief = raw.brief || raw;
  return {
    brief: {
      campaignOverview: cleanAiText(brief.campaignOverview),
      objectivesKpis: cleanAiText(brief.objectivesKpis),
      targetAudienceDeepDive: cleanAiText(brief.targetAudienceDeepDive),
      creativeDirectionMood: cleanAiText(brief.creativeDirectionMood),
      contentFormatRecommendations: cleanAiText(brief.contentFormatRecommendations),
      keyMessagesHooks: cleanAiText(brief.keyMessagesHooks),
      callToActionOptions: cleanAiText(brief.callToActionOptions),
      successMetrics: cleanAiText(brief.successMetrics),
      conclusion: cleanAiText(brief.conclusion),
    },
  };
}

async function normalizeFileWithProvider(fileObj, provider) {
  const { filename, csv } = fileObj;
  if (!csv) throw new Error('csv required');

  const prompt = [
    'You normalize social media analytics CSV exports into a strict JSON object.',
    'Return JSON only.',
    'Use this exact shape:',
    '{"platform":"string","rows":[{"title":"string","postedAt":"ISO date or readable date","likes":0,"comments":0,"shares":0,"views":0,"reach":0,"follows":0,"clicks":0,"interactions":0,"reactions":0}]}',
    'Rules:',
    '- Infer the platform from the filename or CSV headers when possible.',
    '- Every numeric field must be a number, not a string.',
    '- If a metric is missing, use 0.',
    '- Each row should represent one post or one period summary entry from the CSV.',
    '- Preserve dates/month labels in postedAt when possible.',
    '- Keep titles concise but identifiable.',
  ].join('\n');

  const input = `Filename: ${filename || 'upload.csv'}\nCSV:\n${csv}`;
  let parsed;
  if (provider === 'gemini') {
    parsed = await callGeminiJson(prompt, input, GEMINI_UPLOAD_MODEL, 'Gemini returned an invalid normalization payload');
  } else if (provider === 'deepseek') {
    parsed = await callDeepSeekJson(prompt, input, 'DeepSeek returned an invalid normalization payload');
  } else {
    throw new Error(`Unsupported AI provider: ${provider}`);
  }

  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  if (!rows.length) throw new Error(`${provider} did not return any normalized rows`);

  return {
    provider,
    platform: parsed.platform || platformFromFilename(filename),
    rows: rows.map((row) => ({
      platform: row.platform || parsed.platform || platformFromFilename(filename),
      title: row.title,
      postedAt: row.postedAt,
      likes: row.likes,
      comments: row.comments,
      shares: row.shares,
      views: row.views,
      reach: row.reach,
      follows: row.follows,
      clicks: row.clicks,
      interactions: row.interactions,
      reactions: row.reactions,
      transcript: row.transcript || '',
    })),
  };
}

async function normalizeFileWithAi(fileObj) {
  const providerSequence = getProviderSequence(AI_UPLOAD_PROVIDER, ['gemini', 'deepseek']);
  let lastError = null;

  for (const provider of providerSequence) {
    if (!isProviderAvailable(provider)) continue;
    try {
      return await normalizeFileWithProvider(fileObj, provider);
    } catch (error) {
      lastError = error;
    }
  }

  if (lastError) throw lastError;
  return null;
}

function isValidEmail(email = '') {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

async function sendResendEmail({ to, subject, html, text, replyTo }) {
  if (!RESEND_API_KEY) {
    throw new Error('Resend is not configured. Set RESEND_API_KEY in .env');
  }

  const payload = {
    from: RESEND_FROM_EMAIL,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
    text,
  };

  if (replyTo) payload.reply_to = replyTo;

  const body = JSON.stringify(payload);

  const responseText = await new Promise((resolve, reject) => {
    const req = https.request(
      'https://api.resend.com/emails',
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        let raw = '';
        res.on('data', (chunk) => {
          raw += chunk;
        });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(`Resend request failed with status ${res.statusCode}: ${raw}`));
          }
          resolve(raw);
        });
      }
    );

    req.on('error', reject);
    req.write(body);
    req.end();
  });

  return responseText ? JSON.parse(responseText) : {};
}

function upsertNewsletterSubscriber(email) {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  const existing = newsletterSubscribers[normalizedEmail] || {};
  const nextRecord = {
    email: normalizedEmail,
    subscribedAt: existing.subscribedAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  newsletterSubscribers[normalizedEmail] = nextRecord;
  saveNewsletterSubscribers(newsletterSubscribers);
  return nextRecord;
}

function getInteractionTotal(engagement = {}) {
  const explicitInteractions = coerceNumber(engagement.interactions);
  if (explicitInteractions > 0) return explicitInteractions;
  return coerceNumber(engagement.comments) + coerceNumber(engagement.likes) + coerceNumber(engagement.shares);
}

function getReactionTotal(engagement = {}) {
  const explicitReactions = coerceNumber(engagement.reactions);
  if (explicitReactions > 0) return explicitReactions;
  return coerceNumber(engagement.likes);
}

function buildLocalAiSuggestions(workspace) {
  const posts = Array.isArray(workspace?.posts) ? workspace.posts : [];
  const metrics = workspace?.metrics || createEmptyMetrics();
  const perPlatform = workspace?.perPlatform || {};
  if (!posts.length) throw new Error('Upload analytics data first');

  const topPlatformEntry =
    Object.entries(perPlatform || {}).sort((a, b) => {
      const scoreA = (a[1]?.interactions || 0) + (a[1]?.clicks || 0) + (a[1]?.follows || 0);
      const scoreB = (b[1]?.interactions || 0) + (b[1]?.clicks || 0) + (b[1]?.follows || 0);
      return scoreB - scoreA;
    })[0] || [];

  const [topPlatform, topPlatformMetrics] = topPlatformEntry;
  const reach = Number(metrics.reach || 0);
  const interactions = Number(metrics.interactions || 0);
  const clicks = Number(metrics.clicks || 0);
  const follows = Number(metrics.follows || 0);
  const engagementRate = Number(metrics.engagementRate || 0);

  const suggestions = [];

  if (topPlatform && topPlatformMetrics) {
    suggestions.push(
      `${topPlatform} is currently the strongest-performing channel. It is recommended to replicate the format, structure, and posting approach behind its most successful content.`
    );
  }

  if (reach > 0 && interactions === 0) {
    suggestions.push('Content is generating reach but not enough response. Stronger opening hooks, clearer captions, and more direct calls to action should be tested.');
  } else if (engagementRate < 2) {
    suggestions.push('The engagement rate remains modest relative to reach. Greater emphasis should be placed on content that encourages replies, saves, and shares.');
  } else {
    suggestions.push('Engagement is responding well relative to reach. Review the strongest interaction days and repeat the topic, creative style, or timing that contributed to that performance.');
  }

  if (clicks > 0) {
    suggestions.push('Clicks are already being generated. Strengthening landing-page alignment and repeating the strongest call-to-action style should improve conversion quality.');
  } else if (follows > 0) {
    suggestions.push('Follower growth is visible despite limited clicks. Clearer profile and link prompts should help convert attention into site traffic.');
  } else {
    suggestions.push('Traffic and follower movement remain limited. A focused conversion campaign with one clear offer and one direct call to action is recommended.');
  }

  return {
    title: 'AI Suggestions',
    summary: topPlatform
      ? `${topPlatform} appears to be your best current opportunity based on interaction, click, and follow activity.`
      : 'Your uploaded analytics show early performance patterns that can be turned into clearer next steps.',
    suggestions: suggestions.slice(0, 5),
  };
}

async function buildAiSuggestionsFromAnalytics(workspace, { start, end, platform, metrics: requestMetrics, perPlatform: requestPerPlatform, recentPosts: requestRecentPosts } = {}) {
  const posts = Array.isArray(workspace?.posts) ? workspace.posts : [];
  const metrics = workspace?.metrics || createEmptyMetrics();
  const perPlatform = workspace?.perPlatform || {};
  const lastUploadName = workspace?.lastUploadName || null;
  if (!posts.length && !requestMetrics) throw new Error('Upload analytics data first');

  const latestPosts = Array.isArray(requestRecentPosts)
    ? requestRecentPosts
    : posts
        .slice()
        .sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0))
        .slice(0, 24)
        .map((post) => ({
          platform: post.platform,
          title: post.title,
          postedAt: post.postedAt,
          engagement: {
            reach: post.engagement.reach || 0,
            interactions: getInteractionTotal(post.engagement),
            clicks: post.engagement.clicks || 0,
            reactions: getReactionTotal(post.engagement),
            views: post.engagement.views || 0,
            follows: post.engagement.follows || 0,
          },
        }));

  const payload = {
    lastUploadName,
    platform: platform || 'Instagram',
    timeframe: {
      start: start || 'unknown',
      end: end || 'unknown',
    },
    metrics: requestMetrics || metrics,
    perPlatform: requestPerPlatform || perPlatform,
    recentPosts: latestPosts,
  };

  const prompt = [
    'You are a social media analytics strategist.',
    'Review the provided analytics JSON and return a professional executive summary, clear takeaways, and a practical action plan.',
    'Include the selected platform and reporting period in the summary.',
    'Also highlight the most important metric insight and a recommended next step the client should take.',
    'Return JSON only in this exact shape:',
    '{"title":"string","summary":"string","takeaways":["string","string","string","string","string"],"actions":["string","string","string","string","string"]}',
    'Rules:',
    '- Use the data only.',
    '- Use a formal, professional tone.',
    '- Keep takeaways and actions specific, practical, and clearly written.',
    '- Mention the strongest opportunity or problem in the summary.',
    '- Mention the date range and platform in the summary.',
    '- Return exactly 5 takeaways and exactly 5 actions.',
  ].join('\n');

  const providerSequence = getProviderSequence(AI_SUGGESTIONS_PROVIDER, ['deepseek', 'gemini']);
  try {
    for (const provider of providerSequence) {
      if (!isProviderAvailable(provider)) continue;

      const parsed =
        provider === 'deepseek'
          ? await callDeepSeekJson(prompt, `Analytics JSON:\n${JSON.stringify(payload)}`, 'DeepSeek returned an invalid suggestions payload')
          : await callGeminiJson(
              prompt,
              `Analytics JSON:\n${JSON.stringify(payload)}`,
              GEMINI_SUGGESTIONS_MODEL,
              'Gemini returned an invalid suggestions payload'
            );

      const takeaways = Array.isArray(parsed?.takeaways)
        ? parsed.takeaways.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
        : [];
      const actions = Array.isArray(parsed?.actions)
        ? parsed.actions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
        : [];

      if (!takeaways.length || !actions.length) {
        throw new Error(`${provider} did not return valid takeaways/actions`);
      }

      return {
        provider,
        title: String(parsed?.title || 'AI Report').trim(),
        summary: String(parsed?.summary || '').trim(),
        takeaways,
        actions,
      };
    }

    throw new Error('No AI providers are configured for analytics suggestions');
  } catch (error) {
    console.error('AI suggestions fallback:', error.message);
    const fallback = buildLocalAiSuggestions(workspace);
    return {
      provider: 'local',
      title: fallback.title,
      summary: fallback.summary,
      takeaways: [fallback.summary],
      actions: fallback.suggestions || [],
    };
  }
}

function getOauth2Client(port) {
  const redirectUri = `http://localhost:${port}${process.env.GOOGLE_REDIRECT_PATH || '/api/google/oauth-callback'}`;
  return new google.auth.OAuth2(GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, redirectUri);
}

// Initialize GA4 with service account
async function getGA4ServiceAccountAuth() {
  if (!ga4ServiceAccount) {
    throw new Error('GA4 Service Account not configured. Add ga4-config.json to backend folder.');
  }
  
  try {
    const auth = new google.auth.JWT({
      email: ga4ServiceAccount.client_email,
      key: ga4ServiceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/analytics.readonly'],
    });
    
    // Test auth
    await auth.authorize();
    return auth;
  } catch (err) {
    throw new Error(`GA4 Service Account auth failed: ${err.message}`);
  }
}

// Initialize Google Search Console with service account
async function getGSCServiceAccountAuth() {
  if (!ga4ServiceAccount) {
    throw new Error('GSC Service Account not configured. Add ga4-config.json to backend folder.');
  }
  
  try {
    const auth = new google.auth.JWT({
      email: ga4ServiceAccount.client_email,
      key: ga4ServiceAccount.private_key,
      scopes: ['https://www.googleapis.com/auth/webmasters.readonly'],
    });
    
    // Test auth
    await auth.authorize();
    return auth;
  } catch (err) {
    throw new Error(`GSC Service Account auth failed: ${err.message}`);
  }
}

// Fetch GA4 data using service account
async function fetchGA4Report(propertyId, startDate, endDate, dimensions = ['date'], metrics = ['activeUsers']) {
  const auth = await getGA4ServiceAccountAuth();
  const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
  
  const response = await analyticsdata.properties.runReport({
    property: `properties/${propertyId}`,
    requestBody: {
      dateRanges: [{ startDate, endDate }],
      dimensions: dimensions.map((d) => ({ name: d })),
      metrics: metrics.map((m) => ({ name: m })),
      limit: 25000,
    },
  });
  
  return response.data;
}

// Fetch GSC data using service account
async function fetchGSCReport(siteUrl, startDate, endDate, dimensions = ['date'], metrics = ['impressions', 'clicks', 'ctr', 'position']) {
  const auth = await getGSCServiceAccountAuth();
  const searchconsole = google.searchconsole({ version: 'v1', auth });
  
  const response = await searchconsole.searchanalytics.query({
    siteUrl,
    requestBody: {
      startDate,
      endDate,
      dimensions,
      metrics,
      rowLimit: 25000,
    },
  });
  
  return response.data;
}

// Get GA4 properties using service account
async function getGA4Properties() {
  const auth = await getGA4ServiceAccountAuth();
  const analyticsadmin = google.analyticsadmin({ version: 'v1beta', auth });
  
  const accounts = await analyticsadmin.accounts.list();
  const accountItems = accounts.data.accounts || [];
  
  if (!accountItems.length) {
    return [];
  }
  
  const properties = [];
  for (const account of accountItems) {
    try {
      const accProps = await analyticsadmin.properties.list({ parent: account.name });
      properties.push(...(accProps.data.properties || []));
    } catch (err) {
      console.warn(`Failed to fetch properties for account ${account.name}:`, err.message);
    }
  }
  
  return properties;
}

// Get GSC sites using service account
async function getGSCSites() {
  const auth = await getGSCServiceAccountAuth();
  const searchconsole = google.searchconsole({ version: 'v1', auth });
  
  const response = await searchconsole.sites.list();
  return response.data.siteEntry || [];
}

function getSessionToken(req) {
  const cookies = parseCookies(req);
  return cookies.session;
}

function getWorkspaceIdentity(userOrEmail = {}) {
  if (typeof userOrEmail === 'string') return String(userOrEmail).trim().toLowerCase();
  return getUserIdentity(userOrEmail);
}

function ensureWorkspace(userOrEmail, options = {}) {
  const identity = getWorkspaceIdentity(userOrEmail);
  if (!identity) return null;

  if (!appState.users[identity]) {
    appState.users[identity] = options.withSeed ? buildDefaultAppState() : createEmptyWorkspace();
    saveAppState();
  }

  return appState.users[identity];
}

function buildDailyData(workspace) {
  const posts = Array.isArray(workspace?.posts) ? workspace.posts : [];
  const dailyMap = {};
  posts.forEach((p) => {
    const date = new Date(p.postedAt || 0);
    const dateKey = date.toISOString().split('T')[0]; // YYYY-MM-DD format
    
    if (!dailyMap[dateKey]) {
      dailyMap[dateKey] = {
        date: dateKey,
        follows: 0,
        reactions: 0,
        clicks: 0,
        interactions: 0,
        reach: 0,
        views: 0,
      };
    }
    
    dailyMap[dateKey].follows += p.engagement.follows || 0;
    dailyMap[dateKey].reactions += getReactionTotal(p.engagement);
    dailyMap[dateKey].clicks += p.engagement.clicks || 0;
    dailyMap[dateKey].interactions += getInteractionTotal(p.engagement);
    dailyMap[dateKey].reach += p.engagement.reach || 0;
    dailyMap[dateKey].views += p.engagement.views || 0;
  });
  
  // Sort by date and return array
  return Object.values(dailyMap).sort((a, b) => new Date(a.date) - new Date(b.date));
}

const recalcMetrics = (workspace) => {
  if (!workspace) return;
  const posts = Array.isArray(workspace.posts) ? workspace.posts : [];
  const metrics = createEmptyMetrics();
  metrics.reach = posts.reduce((s, p) => s + (p.engagement.reach || 0), 0);
  metrics.interactions = posts.reduce((s, p) => s + getInteractionTotal(p.engagement), 0);
  metrics.clicks = posts.reduce((s, p) => s + (p.engagement.clicks || 0), 0);
  metrics.reactions = posts.reduce((s, p) => s + getReactionTotal(p.engagement), 0);
  metrics.views = posts.reduce((s, p) => s + (p.engagement.views || 0), 0);
  metrics.follows = posts.reduce((s, p) => s + (p.engagement.follows || 0), 0);
  const interactions = metrics.interactions;
  const engagementBase = metrics.reach || 0;
  metrics.engagementRate = engagementBase ? Number(((interactions / engagementBase) * 100).toFixed(2)) : 0;

  const agg = {};
  posts.forEach((p) => {
    const k = p.platform || 'Unknown';
    if (!agg[k]) {
      agg[k] = { reach: 0, interactions: 0, clicks: 0, reactions: 0, views: 0, follows: 0 };
    }
    agg[k].reach += p.engagement.reach || 0;
    agg[k].interactions += getInteractionTotal(p.engagement);
    agg[k].clicks += p.engagement.clicks || 0;
    agg[k].reactions += getReactionTotal(p.engagement);
    agg[k].views += p.engagement.views || 0;
    agg[k].follows += p.engagement.follows || 0;
  });
  workspace.metrics = metrics;
  workspace.perPlatform = agg;
  workspace.updatedAt = new Date().toISOString();
};

function sanitizeChartSnapshot(snapshot) {
  if (!snapshot || typeof snapshot !== 'object' || !Array.isArray(snapshot.days)) return null;
  return {
    title: String(snapshot.title || 'Performance').trim(),
    days: snapshot.days.map((day, index) => ({
      day: Number(day?.day || index + 1),
      dateLabel: String(day?.dateLabel || `Day ${index + 1}`).trim(),
      summaryLabel: String(day?.summaryLabel || '').trim(),
      platformLabel: String(day?.platformLabel || '').trim(),
      totals: {
        reach: Number(day?.totals?.reach || 0),
        interactions: Number(day?.totals?.interactions || 0),
        clicks: Number(day?.totals?.clicks || 0),
        reactions: Number(day?.totals?.reactions || 0),
        views: Number(day?.totals?.views || 0),
        follows: Number(day?.totals?.follows || 0),
      },
    })),
  };
}

function sanitizeReport(report = {}) {
  const metricsList = Array.isArray(report.metrics) ? report.metrics : [];
  return {
    id: String(report.id || `r-${Date.now()}`).trim(),
    title: String(report.title || 'Report').trim(),
    start: String(report.start || '').trim(),
    end: String(report.end || '').trim(),
    platform: String(report.platform || 'Instagram').trim(),
    logo: report.logo ? String(report.logo).trim() : null,
    summary: String(report.summary || '').trim(),
    metrics: metricsList.map((metric) => ({
      label: String(metric?.label || 'Metric').trim(),
      value: Number(metric?.value || 0),
      ...(metric?.sub ? { sub: String(metric.sub).trim() } : {}),
    })),
    takeaways: Array.isArray(report.takeaways)
      ? report.takeaways.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    actions: Array.isArray(report.actions)
      ? report.actions.map((item) => String(item || '').trim()).filter(Boolean)
      : [],
    chartSnapshot: sanitizeChartSnapshot(report.chartSnapshot),
  };
}

function buildSeedReport(seedMetrics) {
  const endDate = new Date();
  const startDate = new Date();
  startDate.setDate(endDate.getDate() - 29);
  const startIso = formatIsoDate(startDate);
  const endIso = formatIsoDate(endDate);

  return sanitizeReport({
    id: 'seed-report-1',
    title: `Client Performance Report - ${startIso} to ${endIso}`,
    start: startIso,
    end: endIso,
    platform: 'Instagram',
    summary: 'This seeded report gives your client an immediate working example of the AI reporting experience, using shared demo analytics that can later be replaced with live uploaded data.',
    metrics: buildReportMetricsFromSummary(seedMetrics),
    takeaways: [
      'Instagram is currently the strongest visibility channel in the seeded dataset.',
      'Short-form video and story-led content are driving the largest reach spikes.',
      'Click-through activity suggests the audience is responding to direct offers and clear CTAs.',
      'Follower growth is steady, indicating the content mix is attracting new interest.',
      'Cross-platform activity supports broader awareness while Instagram drives the clearest performance lead.',
    ],
    actions: [
      'Keep the strongest short-form format in the weekly content plan.',
      'Use a direct CTA in high-reach posts to convert attention into site visits.',
      'Repurpose the best-performing Instagram creative into LinkedIn and Facebook variations.',
      'Review posting times around the highest click days and repeat those windows.',
      'Replace this seeded report with live uploaded analytics before full production handoff.',
    ],
  });
}

function buildDefaultAppState() {
  const workspace = createEmptyWorkspace();
  workspace.posts = buildSeedPosts();
  recalcMetrics(workspace);
  workspace.lastUploadName = 'seed-demo-analytics.csv';
  workspace.reports = [buildSeedReport(workspace.metrics)];
  workspace.updatedAt = new Date().toISOString();
  return workspace;
}

function loadAppState() {
  try {
    const raw = fs.readFileSync(appDataFile, 'utf8');
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch (err) {
    return null;
  }
}

function saveAppState() {
  const nextState = {
    users: appState.users,
    updatedAt: new Date().toISOString(),
  };

  try {
    fs.writeFileSync(appDataFile, JSON.stringify(nextState, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to persist app data:', err);
  }
}

function hydrateAppState() {
  const persisted = loadAppState();
  if (!persisted) {
    appState = { users: {} };
    saveAppState();
    return;
  }

  if (persisted.users && typeof persisted.users === 'object') {
    appState = {
      users: Object.entries(persisted.users).reduce((acc, [userId, workspace]) => {
        const nextWorkspace = createEmptyWorkspace();
        nextWorkspace.posts = Array.isArray(workspace?.posts) ? workspace.posts : [];
        nextWorkspace.platformDashboards = workspace?.platformDashboards && typeof workspace.platformDashboards === 'object' && !Array.isArray(workspace.platformDashboards)
          ? workspace.platformDashboards
          : {};
        nextWorkspace.lastUploadName = workspace?.lastUploadName ? String(workspace.lastUploadName).trim() : null;
        nextWorkspace.reports = Array.isArray(workspace?.reports) ? workspace.reports.map((report) => sanitizeReport(report)) : [];
        nextWorkspace.onboarding = sanitizeOnboarding(workspace?.onboarding || {});
        nextWorkspace.strategyReports = workspace?.strategyReports && typeof workspace.strategyReports === 'object' && !Array.isArray(workspace.strategyReports)
          ? workspace.strategyReports
          : {};
        recalcMetrics(nextWorkspace);
        nextWorkspace.updatedAt = workspace?.updatedAt || new Date().toISOString();
        acc[userId] = nextWorkspace;
        return acc;
      }, {}),
    };
    return;
  }

  // Backward-compatible migration from the old single shared workspace.
  const migratedWorkspace = createEmptyWorkspace();
  migratedWorkspace.posts = Array.isArray(persisted.posts) ? persisted.posts : [];
  migratedWorkspace.platformDashboards = persisted.platformDashboards && typeof persisted.platformDashboards === 'object' && !Array.isArray(persisted.platformDashboards)
    ? persisted.platformDashboards
    : {};
  migratedWorkspace.lastUploadName = persisted.lastUploadName ? String(persisted.lastUploadName).trim() : null;
  migratedWorkspace.reports = Array.isArray(persisted.reports) ? persisted.reports.map((report) => sanitizeReport(report)) : [];
  if (!migratedWorkspace.posts.length) {
    Object.keys(clientHubRecords).forEach((userId) => {
      appState.users[userId] = buildDefaultAppState();
    });
  } else {
    recalcMetrics(migratedWorkspace);
    Object.keys(clientHubRecords).forEach((userId) => {
      appState.users[userId] = JSON.parse(JSON.stringify(migratedWorkspace));
    });
  }
  saveAppState();
}

hydrateAppState();

const sendJson = (res, status, data) => {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' });
  res.end(JSON.stringify(data));
};

const parseBody = (req) =>
  new Promise((resolve) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });

const parseCookies = (req) =>
  (req.headers.cookie || '').split(';').reduce((acc, cur) => {
    const [k, v] = cur.trim().split('=');
    if (k && v) acc[k] = decodeURIComponent(v);
    return acc;
  }, {});

const getSession = (req) => {
  const cookies = parseCookies(req);
  if (!cookies.session) return null;
  return sessions.find((s) => s.token === cookies.session) || null;
};

const isAuthenticated = (req) => {
  return Boolean(getSession(req));
};

function isAdminEmail(email = '') {
  const normalizedEmail = String(email || '').trim().toLowerCase();
  return Boolean(normalizedEmail && ADMIN_EMAILS.includes(normalizedEmail));
}

function isAdminUser(user = {}) {
  return String(user?.role || '').trim().toLowerCase() === 'admin' || isAdminEmail(user?.email);
}

function getUserIdentity(user = {}) {
  const email = String(user?.email || '').trim().toLowerCase();
  return email;
}

function getWorkspaceSummary(identity = '') {
  const workspace = appState.users[String(identity || '').trim().toLowerCase()];
  if (!workspace) return null;
  return {
    lastUploadName: workspace.lastUploadName || null,
    reportCount: Array.isArray(workspace.reports) ? workspace.reports.length : 0,
    postCount: Array.isArray(workspace.posts) ? workspace.posts.length : 0,
    metrics: workspace.metrics || createEmptyMetrics(),
    updatedAt: workspace.updatedAt || null,
  };
}

function normalizeStringArray(value, maxItems = 12) {
  const list = Array.isArray(value)
    ? value
    : String(value || '')
      .split(',')
      .map((item) => item.trim());

  return list
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .slice(0, maxItems);
}

function sanitizeOnboardingAnswers(rawAnswers = {}) {
  const answers = rawAnswers && typeof rawAnswers === 'object' && !Array.isArray(rawAnswers) ? rawAnswers : {};
  const text = (value, max = 1200) => String(value || '').trim().slice(0, max);
  const toneValue = Number(answers.toneFormality || 5);
  const hexColor = (value) => {
    const color = String(value || '').trim();
    return /^#[0-9a-f]{6}$/i.test(color) ? color : '';
  };
  const logo = answers.logo && typeof answers.logo === 'object' && !Array.isArray(answers.logo) ? answers.logo : null;

  return {
    fullName: text(answers.fullName, 140),
    businessName: text(answers.businessName, 160),
    businessDescription: text(answers.businessDescription, 900),
    industries: normalizeStringArray(answers.industries, 6),
    industryOther: text(answers.industryOther, 120),
    location: text(answers.location, 160),
    businessStage: text(answers.businessStage, 80),
    personalityTraits: normalizeStringArray(answers.personalityTraits, 7),
    personalityOther: text(answers.personalityOther, 120),
    toneFormality: Math.min(10, Math.max(1, Number.isFinite(toneValue) ? toneValue : 5)),
    preferredPhrases: text(answers.preferredPhrases, 700),
    restrictedPhrases: text(answers.restrictedPhrases, 700),
    uniqueValueProposition: text(answers.uniqueValueProposition, 700),
    brandColors: normalizeStringArray(answers.brandColors, 3).map(hexColor).filter(Boolean),
    logo: logo
      ? {
          name: text(logo.name, 180),
          type: text(logo.type, 80),
          size: Math.max(0, Number(logo.size || 0)),
          dataUrl: String(logo.dataUrl || '').startsWith('data:image/') && String(logo.dataUrl).length < 700000
            ? String(logo.dataUrl)
            : '',
        }
      : null,
  };
}

function sanitizeOnboarding(rawOnboarding = {}) {
  const onboarding = rawOnboarding && typeof rawOnboarding === 'object' && !Array.isArray(rawOnboarding)
    ? rawOnboarding
    : {};
  const currentStep = Number(onboarding.currentStep || 0);

  return {
    started: Boolean(onboarding.started),
    completed: Boolean(onboarding.completed),
    currentStep: Math.max(0, Number.isFinite(currentStep) ? currentStep : 0),
    answers: sanitizeOnboardingAnswers(onboarding.answers || {}),
    updatedAt: onboarding.updatedAt || null,
    completedAt: onboarding.completedAt || null,
  };
}

function summarizeOnboarding(onboarding = {}) {
  const answers = sanitizeOnboardingAnswers(onboarding.answers || {});
  const currentStep = Number(onboarding.currentStep || 0);
  return {
    started: Boolean(onboarding.started),
    completed: Boolean(onboarding.completed),
    currentStep: Math.max(0, Number.isFinite(currentStep) ? currentStep : 0),
    fullName: answers.fullName,
    businessName: answers.businessName,
    industry: answers.industries.join(', '),
    location: answers.location,
    businessStage: answers.businessStage,
    personalityTraits: answers.personalityTraits,
    toneFormality: answers.toneFormality,
    brandColors: answers.brandColors,
    uniqueValueProposition: answers.uniqueValueProposition,
    updatedAt: onboarding.updatedAt || null,
    completedAt: onboarding.completedAt || null,
  };
}

function summarizeActivity(record = {}) {
  const activity = Array.isArray(record.activity) ? record.activity : [];
  const pageViews = activity.filter((item) => item.type === 'page_view').length;
  const edits = activity.filter((item) => String(item.type || '').startsWith('edit_')).length;
  const actions = activity.filter((item) => !['login', 'page_view'].includes(item.type)).length;
  return {
    pageViews,
    edits,
    actions,
    signIns: coerceNumber(record.signInCount),
  };
}

function appendActivity(existingRecord = {}, event = {}) {
  const currentActivity = Array.isArray(existingRecord.activity) ? existingRecord.activity : [];
  const nextItem = {
    id: String(event.id || `evt-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`).trim(),
    type: String(event.type || 'activity').trim(),
    label: String(event.label || event.type || 'Activity').trim(),
    detail: String(event.detail || '').trim(),
    pageFile: String(event.pageFile || '').trim(),
    pageName: String(event.pageName || '').trim(),
    timestamp: Number(event.timestamp || Date.now()),
    meta: event.meta && typeof event.meta === 'object' ? event.meta : {},
  };

  return [nextItem, ...currentActivity].slice(0, 40);
}

function listClientHubRecords() {
  return Object.values(clientHubRecords)
    .map((record) => ({
      ...record,
      workspace: getWorkspaceSummary(record.id),
    }))
    .sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
}

function sanitizeMetrics(metricsObj = {}) {
  return {
    connections: coerceNumber(metricsObj.connections),
    queuedPosts: coerceNumber(metricsObj.queuedPosts),
    reports: coerceNumber(metricsObj.reports),
    feedback: coerceNumber(metricsObj.feedback),
    hashtagSets: coerceNumber(metricsObj.hashtagSets),
    uploads: coerceNumber(metricsObj.uploads),
    totalSavedItems: coerceNumber(metricsObj.totalSavedItems),
  };
}

function upsertClientHubRecord(sessionUser, payload = {}) {
  const identity = getUserIdentity(sessionUser);
  if (!identity) return null;

  const existing = clientHubRecords[identity] || {};
  const now = Date.now();
  const pageFile = String(payload.pageFile || '').trim() || existing.pageFile || '';
  const pageName = String(payload.pageName || '').trim() || existing.lastPage || 'Workspace';
  const pageCategory = String(payload.pageCategory || '').trim() || 'Workspace';
  const currentUsage = existing.pageUsage && typeof existing.pageUsage === 'object' ? existing.pageUsage : {};
  const usageEntry = currentUsage[pageFile] || {
    name: pageName,
    category: pageCategory,
    visits: 0,
    firstVisited: now,
  };

  usageEntry.name = pageName;
  usageEntry.category = pageCategory;
  usageEntry.visits += 1;
  usageEntry.lastVisited = now;
  currentUsage[pageFile] = usageEntry;

  const usageList = Object.entries(currentUsage)
    .map(([file, value]) => ({ file, ...(value || {}) }))
    .sort((a, b) => (b.lastVisited || 0) - (a.lastVisited || 0));

  const firstName = String(payload.firstName || sessionUser.firstName || existing.firstName || '').trim();
  const lastName = String(payload.lastName || sessionUser.lastName || existing.lastName || '').trim();
  const fullName =
    [firstName, lastName].filter(Boolean).join(' ').trim() ||
    String(payload.name || sessionUser.name || existing.name || '').trim() ||
    String(payload.companyName || sessionUser.companyName || existing.companyName || '').trim() ||
    String(sessionUser.email || 'Client').trim();
  const metrics = sanitizeMetrics(payload.metrics || existing.metrics || {});
  const role = isAdminUser(sessionUser)
    ? 'admin'
    : String(payload.role || sessionUser.role || existing.role || 'client').trim();
  const view = role === 'admin'
    ? 'admin'
    : String(payload.view || sessionUser.view || existing.view || 'client').trim();
  const accountType = String(payload.accountType || sessionUser.accountType || existing.accountType || 'individual').trim();
  const companyName = String(payload.companyName || sessionUser.companyName || existing.companyName || '').trim();
  const eventType = String(payload.eventType || 'page_view').trim();
  const eventLabel = String(payload.eventLabel || pageName).trim();
  const eventDetail = String(payload.eventDetail || '').trim();
  const activity = appendActivity(existing, {
    type: eventType,
    label: eventLabel,
    detail: eventDetail,
    pageFile,
    pageName,
    meta: payload.eventMeta,
  });

  const nextRecord = {
    id: identity,
    email: String(sessionUser.email || existing.email || '').trim(),
    name: fullName,
    firstName,
    lastName,
    companyName,
    accountType,
    role,
    view,
    initials: String(payload.initials || existing.initials || fullName[0] || sessionUser.email?.[0] || 'C').toUpperCase(),
    firstSeen: existing.firstSeen || now,
    lastActive: now,
    totalVisits: coerceNumber(existing.totalVisits) + 1,
    lastPage: pageName,
    pageUsage: currentUsage,
    pagesUsed: usageList.map((item) => item.name),
    toolsUsed: usageList.map((item) => item.name),
    totalToolsUsed: usageList.length,
    recentTools: usageList.slice(0, 4).map((item) => item.name),
    metrics,
    onboarding: payload.onboarding || existing.onboarding || null,
    signInCount: coerceNumber(existing.signInCount),
    lastSignInAt: coerceNumber(existing.lastSignInAt),
    activity,
  };

  nextRecord.activitySummary = summarizeActivity(nextRecord);

  clientHubRecords[identity] = nextRecord;
  saveClientHubRecords(clientHubRecords);
  return nextRecord;
}

function registerClientSignIn(user = {}) {
  const identity = getUserIdentity(user);
  if (!identity) return null;
  ensureWorkspace(identity, true);

  const existing = clientHubRecords[identity] || {};
  const now = Date.now();
  const role = isAdminUser(user) ? 'admin' : String(user.role || existing.role || 'client').trim();
  const view = role === 'admin' ? 'admin' : String(user.view || existing.view || 'client').trim();
  const fullName =
    [user.firstName, user.lastName].filter(Boolean).join(' ').trim() ||
    String(user.name || existing.name || '').trim() ||
    String(user.companyName || existing.companyName || '').trim() ||
    String(user.email || 'Client').trim();

  const nextRecord = {
    ...existing,
    id: identity,
    email: String(user.email || existing.email || '').trim(),
    name: fullName,
    firstName: String(user.firstName || existing.firstName || '').trim(),
    lastName: String(user.lastName || existing.lastName || '').trim(),
    companyName: String(user.companyName || existing.companyName || '').trim(),
    accountType: String(user.accountType || existing.accountType || 'individual').trim(),
    role,
    view,
    initials: String(existing.initials || fullName[0] || user.email?.[0] || 'C').toUpperCase(),
    firstSeen: existing.firstSeen || now,
    lastActive: now,
    lastSignInAt: now,
    signInCount: coerceNumber(existing.signInCount) + 1,
    pageUsage: existing.pageUsage && typeof existing.pageUsage === 'object' ? existing.pageUsage : {},
    pagesUsed: Array.isArray(existing.pagesUsed) ? existing.pagesUsed : [],
    toolsUsed: Array.isArray(existing.toolsUsed) ? existing.toolsUsed : [],
    totalToolsUsed: coerceNumber(existing.totalToolsUsed),
    recentTools: Array.isArray(existing.recentTools) ? existing.recentTools : [],
    metrics: sanitizeMetrics(existing.metrics || {}),
    activity: appendActivity(existing, {
      type: 'login',
      label: 'Signed in',
      detail: role === 'admin' ? 'Admin session started' : 'Client session started',
      meta: { role, view },
    }),
  };

  nextRecord.activitySummary = summarizeActivity(nextRecord);
  clientHubRecords[identity] = nextRecord;
  saveClientHubRecords(clientHubRecords);
  return nextRecord;
}

const PUBLIC_ROUTES = new Set([
  '/landing.html',
  '/login.html',
  '/signin.html',
]);
const PUBLIC_API_ROUTES = new Set([
  '/api/health',
  '/api/newsletter/subscribe',
  '/api/campaign/ad-copy-grade',
  '/api/campaign/creative-brief',
  '/api/generate/caption',
  '/api/generate/ghost',
  '/api/generate/hooks',
  '/api/generate/ideas',
]);

const serveStatic = (req, res) => {
  let safePath = req.url === '/' ? '/landing.html' : req.url.split('?')[0];
  if (safePath === '/dashboard.html') safePath = '/featurehub.html';
  if (safePath === '/positioning-wizard.html') {
    res.writeHead(302, { Location: '/strategy.html#positioning' });
    res.end();
    return true;
  }
  if (safePath === '/icp-builder.html') {
    res.writeHead(302, { Location: '/strategy.html#icp' });
    res.end();
    return true;
  }
  const filePath = path.join(staticDir, safePath);
  if (!filePath.startsWith(staticDir)) return false;
  const ext = path.extname(filePath);
  const contentType = mimeTypes[ext] || 'text/plain';

  // Gate HTML pages behind login except the public welcome and login pages.
  if (ext === '.html' && !PUBLIC_ROUTES.has(safePath)) {
    if (!isAuthenticated(req)) {
      res.writeHead(302, { Location: '/landing.html' });
      res.end();
      return true;
    }

    if (safePath === '/clienthub.html') {
      const session = getSession(req);
      if (!isAdminUser(session?.user)) {
        res.writeHead(302, { Location: '/featurehub.html' });
        res.end();
        return true;
      }
    }
  }

  if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
    return true;
  }
  return false;
};

const server = http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    });
    return res.end();
  }

  if (req.url === '/api/login' && req.method === 'POST') {
    const { email, password, firstName, lastName, accountType, companyName, role, view, name } = await parseBody(req);
    if (!email || !password) return sendJson(res, 400, { message: 'Email and password required' });
    const normalizedEmail = String(email).trim().toLowerCase();
    const existingRecord = clientHubRecords[normalizedEmail] || {};
    const token = 'sess-' + crypto.randomBytes(12).toString('hex');
    const resolvedFirstName = String(firstName || existingRecord.firstName || '').trim();
    const resolvedLastName = String(lastName || existingRecord.lastName || '').trim();
    const resolvedCompanyName = String(companyName || existingRecord.companyName || '').trim();
    const resolvedName =
      [resolvedFirstName, resolvedLastName].filter(Boolean).join(' ').trim() ||
      String(name || existingRecord.name || '').trim() ||
      resolvedCompanyName ||
      'Demo User';
    const resolvedRole = isAdminEmail(normalizedEmail)
      ? 'admin'
      : String(role || existingRecord.role || 'client').trim();
    const resolvedView = resolvedRole === 'admin'
      ? 'admin'
      : String(view || existingRecord.view || 'client').trim();
    const user = {
      name: resolvedName,
      email: normalizedEmail,
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      accountType: String(accountType || existingRecord.accountType || 'individual').trim(),
      companyName: resolvedCompanyName,
      role: resolvedRole,
      view: resolvedView,
      createdAt: Date.now(),
    };
    sessions.push({ token, user, createdAt: Date.now() });
    saveSessions(sessions);
    registerClientSignIn(user);
    return sendJson(res, 200, { token, user });
  }

  // All API routes except login and health require a valid session
  if (req.url.startsWith('/api') && req.url !== '/api/login' && !PUBLIC_API_ROUTES.has(req.url.split('?')[0])) {
    if (!isAuthenticated(req)) return sendJson(res, 401, { message: 'Unauthorized' });
  }

  if (req.url.split('?')[0] === '/api/onboarding' && req.method === 'GET') {
    const session = getSession(req);
    const workspace = ensureWorkspace(session?.user, true);
    const onboarding = sanitizeOnboarding(workspace?.onboarding || {});
    return sendJson(res, 200, { onboarding });
  }

  if (req.url.split('?')[0] === '/api/onboarding' && req.method === 'POST') {
    const session = getSession(req);
    const workspace = ensureWorkspace(session?.user, true);
    if (!session?.user?.email || !workspace) return sendJson(res, 401, { message: 'Unauthorized' });

    const payload = await parseBody(req);
    const now = new Date().toISOString();
    const nextOnboarding = sanitizeOnboarding({
      ...(workspace.onboarding || {}),
      started: true,
      completed: Boolean(payload.completed),
      currentStep: payload.currentStep,
      answers: payload.answers || {},
      updatedAt: now,
      completedAt: payload.completed ? now : workspace.onboarding?.completedAt || null,
    });

    workspace.onboarding = nextOnboarding;
    workspace.updatedAt = now;
    saveAppState();

    const summary = summarizeOnboarding(nextOnboarding);
    const identity = getUserIdentity(session.user);
    clientHubRecords[identity] = {
      ...(clientHubRecords[identity] || {}),
      onboarding: summary,
      companyName: summary.businessName || clientHubRecords[identity]?.companyName || session.user.companyName || '',
      lastActive: Date.now(),
    };
    saveClientHubRecords(clientHubRecords);

    return sendJson(res, 200, { ok: true, onboarding: nextOnboarding });
  }

  if (req.url === '/api/posts' && req.method === 'GET') {
    const workspace = ensureWorkspace(getSession(req)?.user, true);
    return sendJson(res, 200, { posts: workspace?.posts || [] });
  }

  if (req.url === '/api/posts' && req.method === 'POST') {
    const workspace = ensureWorkspace(getSession(req)?.user, true);
    const { platform, title, transcript, postType, scheduledAt, mediaName, mediaType, mediaData } = await parseBody(req);
    if (!platform || !title) return sendJson(res, 400, { message: 'platform and title required' });
    const scheduledTs = scheduledAt ? Date.parse(String(scheduledAt)) : null;
    const post = {
      id: 'p' + ((workspace?.posts?.length || 0) + 1),
      platform,
      title,
      transcript: transcript || '',
      postType: String(postType || 'image'),
      mediaName: mediaName || null,
      mediaType: mediaType || null,
      mediaData: mediaData || null,
      engagement: { likes: 0, comments: 0, shares: 0 },
      status: scheduledTs ? 'scheduled' : 'draft',
      postedAt: scheduledTs || null,
    };
    workspace.posts.unshift(post);
    recalcMetrics(workspace);
    saveAppState();
    return sendJson(res, 201, { post });
  }

  if (req.url.startsWith('/api/posts/') && req.method === 'DELETE') {
    const workspace = ensureWorkspace(getSession(req)?.user, true);
    const id = decodeURIComponent(req.url.split('/')[3] || '');
    const posts = Array.isArray(workspace.posts) ? workspace.posts : [];
    const nextPosts = posts.filter((post) => post.id !== id);
    if (nextPosts.length === posts.length) return sendJson(res, 404, { message: 'not found' });
    workspace.posts = nextPosts;
    recalcMetrics(workspace);
    saveAppState();
    return sendJson(res, 200, { ok: true });
  }

  if (req.url.startsWith('/api/posts/') && req.url.endsWith('/publish') && req.method === 'POST') {
    const workspace = ensureWorkspace(getSession(req)?.user, true);
    const id = req.url.split('/')[3];
    const post = workspace.posts.find((p) => p.id === id);
    if (!post) return sendJson(res, 404, { message: 'not found' });
    post.status = 'posted';
    post.postedAt = Date.now();
    recalcMetrics(workspace);
    saveAppState();
    return sendJson(res, 200, { post });
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (parsedUrl.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
  }

  if (parsedUrl.pathname === '/api/postiz/auth-links' && req.method === 'GET') {
    try {
      const links = await getSocialAuthLinks();
      return sendJson(res, 200, { links });
    } catch (err) {
      return sendJson(res, 502, { error: `Postiz auth links failed: ${err.message}` });
    }
  }

  if (parsedUrl.pathname === '/api/postiz/schedule' && req.method === 'POST') {
    try {
      const postData = await parseBody(req);
      const result = await scheduleSocialPost(postData);
      return sendJson(res, 200, { success: true, result });
    } catch (err) {
      return sendJson(res, 502, { error: `Postiz scheduling failed: ${err.message}` });
    }
  }

  if (parsedUrl.pathname === '/api/postiz/calendar' && req.method === 'GET') {
    try {
      const posts = await getScheduledCalendarPosts(Object.fromEntries(parsedUrl.searchParams.entries()));
      return sendJson(res, 200, { posts });
    } catch (err) {
      return sendJson(res, 502, { error: `Postiz calendar lookup failed: ${err.message}` });
    }
  }

  if (parsedUrl.pathname === '/api/postiz/analytics' && req.method === 'GET') {
    try {
      const channelId = parsedUrl.searchParams.get('channelId') || parsedUrl.searchParams.get('integrationId') || '';
      const dateRange = parsedUrl.searchParams.get('dateRange') || parsedUrl.searchParams.get('date') || '30';
      const analytics = await getSocialAnalytics(channelId, dateRange);
      return sendJson(res, 200, { analytics });
    } catch (err) {
      return sendJson(res, 502, { error: `Postiz analytics lookup failed: ${err.message}` });
    }
  }

  if (parsedUrl.pathname === '/api/social/accounts' && req.method === 'GET') {
    try {
      const customer = await resolvePostizCustomerId(parsedUrl.searchParams.get('customer') || parsedUrl.searchParams.get('profileId') || '');
      const wantedPlatform = postizPlatform(parsedUrl.searchParams.get('platform') || '');
      const result = await postizFetch('/integrations', 'GET', { group: customer });
      const accounts = extractPostizList(result, 'integrations')
        .filter((account) => !wantedPlatform || postizPlatform(account.identifier || account.providerIdentifier) === wantedPlatform)
        .map((account) => ({
        id: account.id,
        accountId: account.id,
        platform: displayPlatform(account.identifier || account.providerIdentifier),
        platformKey: postizPlatform(account.identifier || account.providerIdentifier),
        username: account.profile || account.name || '',
        displayName: account.name || account.profile || '',
        name: account.name || account.profile || '',
        profileUrl: account.profileUrl || account.picture || '',
        isActive: account.disabled !== true,
        profileId: account.customer?.id || customer || '',
        raw: account,
      }));
      return sendJson(res, 200, { accounts, hasAnalyticsAccess: true, raw: result });
    } catch (err) {
      return sendJson(res, 502, { error: `Postiz accounts lookup failed: ${err.message}` });
    }
  }

  if (parsedUrl.pathname === '/api/auth/connect-link' && req.method === 'GET') {
    try {
      const platform = postizPlatform(parsedUrl.searchParams.get('platform') || 'instagram');
      const result = await postizFetch(`/social/${encodeURIComponent(platform)}`, 'GET', {
        refresh: parsedUrl.searchParams.get('refresh') || '',
      });
      const connectUrl = result?.authUrl || result?.auth_url || result?.connectUrl || result?.url;
      if (!connectUrl) return sendJson(res, 502, { error: 'Postiz did not return a connect URL.', raw: result });
      return sendJson(res, 200, {
        connectUrl: withPostizReturnUrl(connectUrl, parsedUrl.searchParams.get('returnUrl')),
        platform,
        raw: result,
      });
    } catch (err) {
      return sendJson(res, 502, { error: `Could not load Postiz connect-link: ${err.message}` });
    }
  }

  if (parsedUrl.pathname === '/api/schedule-post' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const platforms = Array.isArray(body.platforms) && body.platforms.length
        ? body.platforms
        : [{ platform: postizPlatform(body.platform), accountId: body.accountId || body.socialAccountId }];
      const normalizedPlatforms = platforms
        .map((item) => ({ platform: postizPlatform(item.platform), accountId: item.accountId || item.id }))
        .filter((item) => item.platform && item.accountId);

      if (!normalizedPlatforms.length) {
        return sendJson(res, 400, { error: 'Choose at least one connected Postiz social account before scheduling.' });
      }

      const payload = buildPostizSchedulePayload(body, normalizedPlatforms);
      const content = body.content || body.caption || body.transcript || '';

      const result = await postizFetch('/posts', 'POST', payload);
      const postizPost = result.post || result.data?.post || result.data || result;
      const workspace = ensureWorkspace(getSession(req)?.user, true);
      const platformLabel = Array.from(new Set(normalizedPlatforms.map((item) => displayPlatform(item.platform)))).join(', ');
      const localPost = {
        id: postizPost._id || postizPost.id || `postiz-${Date.now()}`,
        postizPostId: postizPost._id || postizPost.id || null,
        platform: platformLabel || displayPlatform(normalizedPlatforms[0].platform),
        title: body.title || String(content || 'Scheduled post').slice(0, 80),
        transcript: content,
        postType: body.postType || 'text',
        engagement: { likes: 0, comments: 0, shares: 0, reactions: 0, clicks: 0, views: 0, reach: 0, follows: 0 },
        status: payload.type === 'now' ? 'publishing' : payload.type,
        postedAt: payload.date || postizPost.publishDate || Date.now(),
        raw: { request: payload, postiz: result },
      };
      workspace.posts.unshift(localPost);
      recalcMetrics(workspace);
      saveAppState();
      return sendJson(res, 200, { success: true, result, post: localPost });
    } catch (err) {
      return sendJson(res, 502, { error: `Scheduling failed: ${err.message}` });
    }
  }

  if (parsedUrl.pathname === '/api/media/upload' && req.method === 'POST') {
    try {
      const body = await parseBody(req);
      const mediaData = String(body.mediaData || '').trim();
      const originalName = String(body.filename || 'media').trim();
      const match = mediaData.match(/^data:([^;]+);base64,(.+)$/);
      if (!match) return sendJson(res, 400, { message: 'A base64 data URL is required.' });

      const mimeType = match[1];
      const extensionFromMime = {
        'image/jpeg': '.jpg',
        'image/png': '.png',
        'image/gif': '.gif',
        'image/webp': '.webp',
        'video/mp4': '.mp4',
        'video/quicktime': '.mov',
        'application/pdf': '.pdf',
      }[mimeType] || path.extname(originalName).toLowerCase() || '.bin';
      const safeExt = extensionFromMime.replace(/[^.a-z0-9]/gi, '').slice(0, 8) || '.bin';
      const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${safeExt}`;

      fs.mkdirSync(uploadsDir, { recursive: true });
      fs.writeFileSync(path.join(uploadsDir, filename), Buffer.from(match[2], 'base64'));

      const protocol = req.headers['x-forwarded-proto'] || (req.headers.host?.startsWith('localhost') ? 'http' : 'https');
      const baseUrl = PUBLIC_APP_URL || `${protocol}://${req.headers.host}`;
      const url = `${baseUrl}/uploads/${filename}`;
      return sendJson(res, 200, { url, filename, mimeType });
    } catch (err) {
      return sendJson(res, 500, { message: `Media upload failed: ${err.message}` });
    }
  }

  if (parsedUrl.pathname === '/api/newsletter/subscribe' && req.method === 'POST') {
    const { email } = await parseBody(req);
    const normalizedEmail = String(email || '').trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return sendJson(res, 400, { message: 'A valid email address is required.' });
    }

    try {
      const subscriber = upsertNewsletterSubscriber(normalizedEmail);
      await sendResendEmail({
        to: normalizedEmail,
        subject: 'You are subscribed to Elevate Vue updates',
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
            <h2 style="margin:0 0 16px">Welcome to Elevate Vue</h2>
            <p style="margin:0 0 12px">You are now subscribed to our newsletter.</p>
            <p style="margin:0 0 12px">We will send occasional updates, product news, and workflow tips to <strong>${escapeHtml(normalizedEmail)}</strong>.</p>
            <p style="margin:0">Thank you for joining us.</p>
          </div>
        `,
        text: [
          'Welcome to Elevate Vue.',
          '',
          `You are now subscribed to our newsletter with ${normalizedEmail}.`,
          'We will send occasional updates, product news, and workflow tips.',
        ].join('\n'),
        replyTo: RESEND_NEWSLETTER_REPLY_TO || undefined,
      });
      return sendJson(res, 200, { ok: true, subscriber });
    } catch (err) {
      return sendJson(res, 500, { message: 'Failed to subscribe email.', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/generate/caption' && req.method === 'POST') {
    const body = await parseBody(req);
    const safeTopic = String(body.topic || body.title || '').trim();
    if (!safeTopic) return sendJson(res, 400, { message: 'Tell me the topic or post title first, then I can generate a caption.' });
    const prompt = [
      'You are an expert social media copywriter.',
      'Generate one high-quality caption optimized for the target platform and post type.',
      'Avoid generic filler phrases like "designed to stand out", "smart engagement", "vibrant caption", or "strong storytelling".',
      'Use concrete details from the topic, title, audience, offer, or media notes. Make it sound human, specific, and ready to post.',
      'Return JSON only in this exact shape:',
      '{"caption":"string","hashtags":["string","string"]}',
      'Rules: 1-2 short paragraphs, optional CTA, no markdown, no quotation marks around the caption. Provide up to 6 relevant hashtags.',
    ].join('\n');
    const input = `Topic: ${safeTopic}\nTitle: ${body.title || ''}\nAudience: ${body.audience || ''}\nMedia notes: ${body.mediaNotes || body.mediaName || ''}\nPlatform: ${body.platform || 'Instagram'}\nPostType: ${body.postType || 'image'}\nLength: ${body.length || 'short'}`;
    try {
      const raw = await callAiJsonSequence(getCampaignProviderSequence(), prompt, input, 'AI returned an invalid caption payload');
      return sendJson(res, 200, { provider: raw.provider || 'ai', caption: raw.caption || raw.text || '', hashtags: raw.hashtags || raw.tags || [] });
    } catch (err) {
      const fallback = fallbackCaption(body);
      return sendJson(res, 200, { ...fallback, notice: buildContentAiErrorMessage(err, 'Caption Generator') });
    }
  }

  if (parsedUrl.pathname === '/api/generate/ghost' && req.method === 'POST') {
    const body = await parseBody(req);
    const safeTopic = String(body.topic || '').trim();
    if (!safeTopic) return sendJson(res, 400, { message: 'Tell me what you want to write about first.' });
    const prompt = [
      'You are a professional long-form writer and marketing strategist.',
      'Write a complete piece based on the inputs. Highlight how this piece differentiates from competitors and cover the requested key points.',
      'Return JSON only in this exact shape:',
      '{"content":"string","differentiation":"string","keyPointsCovered":["string"]}',
    ].join('\n');
    const input = `Topic: ${safeTopic}\nPlatform: ${body.platform || 'LinkedIn'}\nTone: ${body.tone || 'Professional'}\nLength: ${body.length || 'medium'}\nAudience: ${body.audience || 'Not specified'}\nKeyPoints: ${body.keyPoints || 'Not specified'}`;
    try {
      const raw = await callAiJsonSequence(getCampaignProviderSequence(), prompt, input, 'AI returned an invalid ghost-writing payload');
      return sendJson(res, 200, { provider: raw.provider || 'ai', content: raw.content || raw.article || '', differentiation: raw.differentiation || '', keyPointsCovered: raw.keyPointsCovered || raw.keyPoints || [] });
    } catch (err) {
      const fallback = fallbackGhost(body);
      return sendJson(res, 200, { ...fallback, notice: buildContentAiErrorMessage(err, 'Ghost Writer') });
    }
  }

  if (parsedUrl.pathname === '/api/generate/hooks' && req.method === 'POST') {
    const body = await parseBody(req);
    const safeTopic = String(body.topic || '').trim();
    if (!safeTopic) return sendJson(res, 400, { message: 'Tell me the topic or niche first, then I can generate hooks.' });
    const safeCount = Math.min(12, Math.max(4, Number(body.count) || 8));
    const prompt = [
      'You are a creative marketing copywriter who writes short social hooks.',
      `Generate ${safeCount} unique short hooks optimized for the platform and tone.`,
      'Return JSON only in this exact shape:',
      '{"hooks":["string","string"]}',
    ].join('\n');
    const input = `Topic: ${safeTopic}\nTone: ${body.tone || 'Curiosity'}\nPlatform: ${body.platform || 'Instagram'}\nCount: ${safeCount}`;
    try {
      const raw = await callAiJsonSequence(getCampaignProviderSequence(), prompt, input, 'AI returned an invalid hooks payload');
      return sendJson(res, 200, { provider: raw.provider || 'ai', hooks: raw.hooks || raw.list || [] });
    } catch (err) {
      const fallback = fallbackHooks(body);
      return sendJson(res, 200, { ...fallback, notice: buildContentAiErrorMessage(err, 'Hook Library') });
    }
  }

  if (parsedUrl.pathname === '/api/generate/ideas' && req.method === 'POST') {
    const body = await parseBody(req);
    const safeIndustry = String(body.industry || '').trim();
    if (!safeIndustry) return sendJson(res, 400, { message: 'Tell me the industry or topic first, then I can generate ideas.' });
    const safeCount = Math.min(20, Math.max(6, Number(body.count) || 10));
    const prompt = [
      'You are a senior social media strategist generating actionable content ideas.',
      `Produce ${safeCount} creative content ideas tailored to the industry, platform, and goal.`,
      'Return JSON only in this exact shape:',
      '{"ideas":[{"title":"string","description":"string"}]}',
    ].join('\n');
    const input = `Industry: ${safeIndustry}\nPlatform: ${body.platform || 'Instagram'}\nGoal: ${body.goal || 'More Engagement'}\nCount: ${safeCount}`;
    try {
      const raw = await callAiJsonSequence(getCampaignProviderSequence(), prompt, input, 'AI returned an invalid ideas payload');
      return sendJson(res, 200, { provider: raw.provider || 'ai', ideas: raw.ideas || raw.list || [] });
    } catch (err) {
      const fallback = fallbackIdeas(body);
      return sendJson(res, 200, { ...fallback, notice: buildContentAiErrorMessage(err, 'Drop Ideas') });
    }
  }

  if (parsedUrl.pathname === '/api/email/approval-request' && req.method === 'POST') {
    const { adminEmail, title, caption, scheduledAt, accounts, platforms, hashtags } = await parseBody(req);
    const normalizedEmail = String(adminEmail || '').trim().toLowerCase();

    if (!isValidEmail(normalizedEmail)) {
      return sendJson(res, 400, { message: 'A valid admin approval email is required.' });
    }

    const safeTitle = String(title || 'Untitled post').trim();
    const safeCaption = String(caption || 'No caption provided').trim();
    const safeScheduledAt = String(scheduledAt || 'Not set').trim();
    const accountList = Array.isArray(accounts) ? accounts.filter(Boolean) : [];
    const platformList = Array.isArray(platforms) ? platforms.filter(Boolean) : [];
    const safeHashtags = String(hashtags || '').trim();

    try {
      const result = await sendResendEmail({
        to: normalizedEmail,
        subject: `Approval request: ${safeTitle}`,
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.6;color:#111827">
            <h2 style="margin:0 0 16px">Post approval request</h2>
            <p style="margin:0 0 12px">A scheduled post is ready for your review.</p>
            <table style="border-collapse:collapse;width:100%;max-width:640px">
              <tr><td style="padding:8px 0;font-weight:700">Title</td><td style="padding:8px 0">${escapeHtml(safeTitle)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Scheduled for</td><td style="padding:8px 0">${escapeHtml(safeScheduledAt)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Platforms</td><td style="padding:8px 0">${escapeHtml(platformList.join(', ') || 'Not specified')}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Accounts</td><td style="padding:8px 0">${escapeHtml(accountList.join(', ') || 'Not specified')}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Caption</td><td style="padding:8px 0">${escapeHtml(safeCaption)}</td></tr>
              <tr><td style="padding:8px 0;font-weight:700">Hashtags</td><td style="padding:8px 0">${escapeHtml(safeHashtags || 'None')}</td></tr>
            </table>
            <p style="margin:16px 0 0">Reply to this email once approved.</p>
          </div>
        `,
        text: [
          'Post approval request',
          '',
          `Title: ${safeTitle}`,
          `Scheduled for: ${safeScheduledAt}`,
          `Platforms: ${platformList.join(', ') || 'Not specified'}`,
          `Accounts: ${accountList.join(', ') || 'Not specified'}`,
          `Caption: ${safeCaption}`,
          `Hashtags: ${safeHashtags || 'None'}`,
          '',
          'Reply to this email once approved.',
        ].join('\n'),
      });
      return sendJson(res, 200, { ok: true, email: result });
    } catch (err) {
      return sendJson(res, 500, { message: 'Failed to send approval email.', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/campaign/ad-copy-grade' && req.method === 'POST') {
    const { platform, adCopy } = await parseBody(req);
    const safePlatform = cleanAiText(platform || '');
    const safeAdCopy = String(adCopy || '').trim();

    if (!safePlatform) return sendJson(res, 400, { message: 'Please choose an ad platform.' });
    if (!safeAdCopy) return sendJson(res, 400, { message: 'Please paste ad copy to grade.' });

    const prompt = [
      'You are an expert paid media copy strategist.',
      'Grade the ad copy for the selected platform and return JSON only.',
      'Use this exact JSON shape:',
      '{"platform":"string","scores":{"hookStrength":0,"clarity":0,"callToAction":0,"emotionalPull":0,"platformRelevance":0},"overallScore":0,"strengths":["string"],"improvements":["string"],"rewrittenVersions":["string"]}',
      'Rules:',
      '- Each category score must be an integer from 1 to 10.',
      '- overallScore must be an integer from 1 to 100.',
      '- Provide 3 to 5 strengths and 3 to 5 improvements.',
      '- Provide 1 to 3 rewritten ad copy versions that are ready to use.',
      '- Do not use markdown, asterisks, square brackets, unnecessary quotation marks, or decorative labels inside text values.',
      '- Make the rewrite fit the selected platform norms.',
    ].join('\n');

    const input = `Platform: ${safePlatform}\nAd Copy:\n${safeAdCopy}`;

    try {
      const providerSequence = getCampaignProviderSequence();
      const raw = await callAiJsonSequence(providerSequence, prompt, input, 'AI returned an invalid ad copy grading payload');
      return sendJson(res, 200, { ok: true, result: normalizeAdCopyGradeResult(raw, safePlatform) });
    } catch (err) {
      return sendJson(res, 200, {
        ok: true,
        result: fallbackAdCopyGrade(safePlatform, safeAdCopy),
        notice: buildCampaignAiErrorMessage(err, 'Ad Copy Grader'),
      });
    }
  }

  if (parsedUrl.pathname === '/api/campaign/creative-brief' && req.method === 'POST') {
    const { inputs = {} } = await parseBody(req);
    const safeInputs = {
      campaignName: cleanAiText(inputs.campaignName || ''),
      platforms: cleanAiText(inputs.platforms || ''),
      objective: cleanAiText(inputs.objective || ''),
      audience: cleanAiText(inputs.audience || ''),
      tone: cleanAiText(inputs.tone || 'Professional'),
      budget: cleanAiText(inputs.budget || 'Not specified'),
      deadline: cleanAiText(inputs.deadline || 'Not specified'),
      keyMessage: cleanAiText(inputs.keyMessage || ''),
    };

    if (!safeInputs.campaignName || !safeInputs.objective || !safeInputs.audience || !safeInputs.keyMessage) {
      return sendJson(res, 400, { message: 'Campaign name, objective, target audience, and key message are required.' });
    }

    const prompt = [
      'You are an expert creative strategist for paid and organic campaigns.',
      'Build a professional creative brief and return JSON only.',
      'Use this exact JSON shape:',
      '{"brief":{"campaignOverview":"string","objectivesKpis":"string","targetAudienceDeepDive":"string","creativeDirectionMood":"string","contentFormatRecommendations":"string","keyMessagesHooks":"string","callToActionOptions":"string","successMetrics":"string","conclusion":"string"}}',
      'Rules:',
      '- Write complete polished sections, not markdown.',
      '- Do not use asterisks, square brackets, unnecessary quotation marks, or placeholder labels.',
      '- Include campaign name, platforms, budget, and deadline inside campaignOverview.',
      '- Include practical KPIs, audience motivations, mood, content formats, hooks, CTA options, and success metrics.',
      '- Keep each section concise but useful for a marketing team.',
    ].join('\n');

    const input = [
      `Campaign Name: ${safeInputs.campaignName}`,
      `Platforms: ${safeInputs.platforms}`,
      `Objective: ${safeInputs.objective}`,
      `Target Audience: ${safeInputs.audience}`,
      `Tone: ${safeInputs.tone}`,
      `Budget: ${safeInputs.budget}`,
      `Deadline: ${safeInputs.deadline}`,
      `Key Message: ${safeInputs.keyMessage}`,
    ].join('\n');

    try {
      const providerSequence = getCampaignProviderSequence();
      const raw = await callAiJsonSequence(providerSequence, prompt, input, 'AI returned an invalid creative brief payload');
      return sendJson(res, 200, { ok: true, result: normalizeCreativeBriefResult(raw) });
    } catch (err) {
      return sendJson(res, 200, {
        ok: true,
        result: fallbackCreativeBrief(safeInputs),
        notice: buildCampaignAiErrorMessage(err, 'Creative Brief Builder'),
      });
    }
  }

  if (parsedUrl.pathname === '/api/client-hub' && req.method === 'GET') {
    const session = getSession(req);
    if (!isAdminUser(session?.user)) return sendJson(res, 403, { message: 'Admin access required' });
    return sendJson(res, 200, { clients: listClientHubRecords() });
  }

  if (parsedUrl.pathname === '/api/client-hub/track' && req.method === 'POST') {
    const session = getSession(req);
    if (!session?.user?.email) return sendJson(res, 401, { message: 'Unauthorized' });
    const payload = await parseBody(req);
    const record = upsertClientHubRecord(session.user, payload);
    return sendJson(res, 200, { ok: true, client: record });
  }

  if (parsedUrl.pathname === '/api/client-hub/event' && req.method === 'POST') {
    const session = getSession(req);
    if (!session?.user?.email) return sendJson(res, 401, { message: 'Unauthorized' });
    const payload = await parseBody(req);
    const record = upsertClientHubRecord(session.user, {
      pageFile: payload.pageFile || parsedUrl.pathname,
      pageName: payload.pageName || 'Workspace',
      pageCategory: payload.pageCategory || 'Workspace',
      metrics: payload.metrics || {},
      eventType: payload.eventType || 'activity',
      eventLabel: payload.eventLabel || payload.pageName || 'Activity',
      eventDetail: payload.eventDetail || '',
      eventMeta: payload.eventMeta || {},
      role: session.user.role,
      view: session.user.view,
    });
    return sendJson(res, 200, { ok: true, client: record });
  }

  if (parsedUrl.pathname === '/api/strategy' && req.method === 'POST') {
    const session = getSession(req);
    if (!session?.user?.email) return sendJson(res, 401, { message: 'Unauthorized' });
    const { type, inputs } = await parseBody(req);
    const kind = String(type || '').trim().toLowerCase();
    if (!['scorecard', 'icp', 'positioning'].includes(kind)) {
      return sendJson(res, 400, { message: 'Strategy type must be scorecard, icp, or positioning.' });
    }

    const promptBase = {
      scorecard: [
        'You are an expert brand strategist. Produce a brand scorecard for the brand details below.',
        'Return JSON only with keys: overallScore, scoreBreakdown, summary.',
        'scoreBreakdown must include VisualConsistency, BrandVoiceAlignment, ContentQuality, AudienceEngagement, PlatformPresence, CommunityBuilding.',
        'overallScore should be a number between 0 and 100.',
      ].join('\n'),
      icp: [
        'You are an expert ideal customer profile generator for marketing and brand strategy.',
        'Return JSON only with keys: demographics, psychographics, painPoints, goals, preferredChannels, contentPreferences, buyingBehavior, conclusion.',
        'Write each value as a concise paragraph or list sentence.',
      ].join('\n'),
      positioning: [
        'You are an expert brand positioning strategist.',
        'Return JSON only with keys: positioningStatement, taglines, differentiators, elevatorPitch, messaging, conclusion.',
        'taglines must contain exactly 3 unique brand tagline options.',
        'differentiators must contain 3 to 5 key differentiators.',
        'messaging must contain coreMessage, targetAudiences, supportingMessages, and callToActions.',
        'targetAudiences must be an array of objects with type and description.',
        'The writing must feel modern, polished, strategic, personalized, and aligned with the requested tone.',
      ].join('\n'),
    };

    const inputText = {
      scorecard: `Brand Details:\n${String(inputs?.description || 'No brand details provided. Create a strong modern brand scorecard.').trim()}`,
      icp: `Industry: ${String(inputs?.industry || 'Not specified').trim()}\nTarget Audience: ${String(inputs?.audience || 'Not specified').trim()}\nContext: ${String(inputs?.details || 'Provide the ideal customer profile for this brand.').trim()}`,
      positioning: `Brand Name: ${String(inputs?.brandName || 'Brand').trim()}\nIndustry: ${String(inputs?.industry || 'Not specified').trim()}\nUnique Selling Proposition: ${String(inputs?.usp || 'A clearly differentiated value proposition').trim()}\nTone: ${String(inputs?.tone || 'Professional').trim()}\nBrand Values: ${String(inputs?.values || 'Quality, trust, innovation').trim()}`,
    };

    try {
      const providerSequence = getProviderSequence(AI_SUGGESTIONS_PROVIDER, ['gemini', 'deepseek']);
      const rawResult = await callAiJsonSequence(providerSequence, promptBase[kind], inputText[kind], 'AI returned an invalid strategy payload');
      const result = kind === 'positioning' ? normalizePositioningReport(rawResult, inputs) : rawResult;
      return sendJson(res, 200, { ok: true, result });
    } catch (err) {
      if (kind === 'positioning') {
        return sendJson(res, 200, {
          ok: true,
          result: fallbackPositioningReport(inputs || {}),
          notice: buildContentAiErrorMessage(err, 'Positioning Wizard'),
        });
      }
      return sendJson(res, 500, { message: err.message || 'AI generation failed.' });
    }
  }

  if (parsedUrl.pathname === '/api/strategy/saved' && req.method === 'GET') {
    const session = getSession(req);
    if (!session?.user?.email) return sendJson(res, 401, { message: 'Unauthorized' });
    const kind = String(parsedUrl.searchParams.get('type') || '').trim().toLowerCase();
    if (!['icp'].includes(kind)) return sendJson(res, 400, { message: 'Unsupported saved strategy type.' });
    const workspace = ensureWorkspace(session.user, true);
    return sendJson(res, 200, { report: workspace?.strategyReports?.[kind] || null });
  }

  if (parsedUrl.pathname === '/api/strategy/saved' && req.method === 'POST') {
    const session = getSession(req);
    if (!session?.user?.email) return sendJson(res, 401, { message: 'Unauthorized' });
    const payload = await parseBody(req);
    const kind = String(payload.type || '').trim().toLowerCase();
    if (!['icp'].includes(kind)) return sendJson(res, 400, { message: 'Unsupported saved strategy type.' });
    const workspace = ensureWorkspace(session.user, true);
    if (!workspace.strategyReports || typeof workspace.strategyReports !== 'object') workspace.strategyReports = {};
    const now = new Date().toISOString();
    workspace.strategyReports[kind] = {
      id: String(payload.id || `${kind}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`),
      type: kind,
      inputs: payload.inputs && typeof payload.inputs === 'object' ? payload.inputs : {},
      result: payload.result && typeof payload.result === 'object' ? payload.result : {},
      userEmail: session.user.email,
      createdAt: payload.createdAt || now,
      savedAt: now,
    };
    workspace.updatedAt = now;
    saveAppState();
    return sendJson(res, 200, { ok: true, report: workspace.strategyReports[kind] });
  }

  if (parsedUrl.pathname === '/api/strategy/saved' && req.method === 'DELETE') {
    const session = getSession(req);
    if (!session?.user?.email) return sendJson(res, 401, { message: 'Unauthorized' });
    const kind = String(parsedUrl.searchParams.get('type') || '').trim().toLowerCase();
    if (!['icp'].includes(kind)) return sendJson(res, 400, { message: 'Unsupported saved strategy type.' });
    const workspace = ensureWorkspace(session.user, true);
    if (workspace?.strategyReports?.[kind]) {
      delete workspace.strategyReports[kind];
      workspace.updatedAt = new Date().toISOString();
      saveAppState();
    }
    return sendJson(res, 200, { ok: true });
  }

  if (parsedUrl.pathname === '/api/brand' && req.method === 'POST') {
    const session = getSession(req);
    if (!session?.user?.email) return sendJson(res, 401, { message: 'Unauthorized' });

    const { type, inputs = {} } = await parseBody(req);
    const kind = String(type || '').trim().toLowerCase();
    if (!['voice', 'tagline'].includes(kind)) {
      return sendJson(res, 400, { message: 'Brand tool type must be voice or tagline.' });
    }

    const promptBase = {
      voice: [
        'You are an expert brand voice strategist.',
        'Return JSON only with keys: summary, personality, dos, donts, phrasesToUse, sampleCopy.',
        'dos, donts, and phrasesToUse must be arrays of concise strings.',
        'sampleCopy should be a short paragraph in the recommended brand voice.',
      ].join('\n'),
      tagline: [
        'You are an expert brand copywriter.',
        'Return JSON only with key: taglines.',
        'taglines must be an array of exactly 10 concise, distinct tagline strings.',
      ].join('\n'),
    };

    const inputText = {
      voice: [
        `Brand Name: ${String(inputs.brandName || 'Brand').trim()}`,
        `Industry or Audience: ${String(inputs.industry || 'Not specified').trim()}`,
        `Loved Copy Sample: ${String(inputs.sample || 'None provided').trim()}`,
        `Formality Dial: ${Number(inputs?.dials?.formality ?? 50)} out of 100`,
        `Energy Dial: ${Number(inputs?.dials?.energy ?? 50)} out of 100`,
        `Humor Dial: ${Number(inputs?.dials?.humor ?? 50)} out of 100`,
        `Authority Dial: ${Number(inputs?.dials?.authority ?? 50)} out of 100`,
      ].join('\n'),
      tagline: [
        `Brand Name: ${String(inputs.brandName || 'Brand').trim()}`,
        `Industry: ${String(inputs.industry || 'Not specified').trim()}`,
        `Unique Selling Proposition: ${String(inputs.usp || 'A strong differentiated value proposition').trim()}`,
        `Style: ${String(inputs.style || 'Punchy & Short').trim()}`,
      ].join('\n'),
    };

    try {
      const providerSequence = getProviderSequence(AI_SUGGESTIONS_PROVIDER, ['deepseek', 'gemini']);
      const result = await callAiJsonSequence(providerSequence, promptBase[kind], inputText[kind], 'AI returned an invalid brand payload');
      if (kind === 'tagline') {
        result.taglines = Array.isArray(result.taglines) ? result.taglines.slice(0, 10) : [];
      }
      return sendJson(res, 200, { ok: true, result });
    } catch (err) {
      return sendJson(res, 500, { message: err.message || 'AI generation failed.' });
    }
  }

  if (parsedUrl.pathname.startsWith('/api/client-hub/') && req.method === 'PUT') {
    const session = getSession(req);
    if (!isAdminUser(session?.user)) return sendJson(res, 403, { message: 'Admin access required' });
    const clientId = parsedUrl.pathname.split('/api/client-hub/')[1];
    if (!clientId) return sendJson(res, 400, { message: 'Client ID required' });

    const payload = await parseBody(req);
    const existing = clientHubRecords[clientId];
    if (!existing) return sendJson(res, 404, { message: 'Client not found' });

    // Update allowed fields
    const allowedFields = ['name', 'email', 'companyName', 'accountType', 'role', 'view'];
    allowedFields.forEach(field => {
      if (payload[field] !== undefined) {
        existing[field] = payload[field];
      }
    });

    // Update initials if name changed
    if (payload.name) {
      existing.initials = String(payload.name[0] || existing.email?.[0] || 'C').toUpperCase();
    }

    saveClientHubRecords(clientHubRecords);
    return sendJson(res, 200, { ok: true, client: existing });
  }

  if (parsedUrl.pathname === '/api/google/oauth-url' && req.method === 'GET') {
    if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
      return sendJson(res, 500, { message: 'Google client config missing. Set GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET in .env' });
    }
    const service = parsedUrl.searchParams.get('service') || 'gsc';
    const scopes = service === 'ga4'
      ? ['https://www.googleapis.com/auth/analytics.readonly']
      : ['https://www.googleapis.com/auth/webmasters.readonly'];
    const oauth2 = getOauth2Client(port);
    const url = oauth2.generateAuthUrl({
      access_type: 'offline',
      scope: scopes,
      prompt: 'select_account consent',
      state: service,
    });
    return sendJson(res, 200, { url });
  }

  if (parsedUrl.pathname === '/api/google/oauth-callback' && req.method === 'GET') {
    const code = parsedUrl.searchParams.get('code');
    const service = parsedUrl.searchParams.get('state') || 'gsc';
    const sessionToken = getSessionToken(req);
    if (!code || !sessionToken) return sendJson(res, 400, { message: 'Missing code or session' });

    try {
      const oauth2 = getOauth2Client(port);
      const { tokens } = await oauth2.getToken(code);
      oauth2.setCredentials(tokens);

      if (!googleTokenStore[sessionToken]) googleTokenStore[sessionToken] = {};
      googleTokenStore[sessionToken][service] = tokens;

      res.writeHead(302, { Location: '/connect.html?google-auth=success' });
      return res.end();
    } catch (err) {
      return sendJson(res, 500, { message: 'Google callback error', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/google/status' && req.method === 'GET') {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) return sendJson(res, 401, { message: 'Unauthorized' });
    const store = googleTokenStore[sessionToken] || {};

    const result = { gsc: null, ga4: null };
    try {
      const oauth2 = getOauth2Client(port);
      if (store.gsc) {
        oauth2.setCredentials(store.gsc);
        const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
        const userInfo = await oauth2Api.userinfo.get();
        result.gsc = { connected: true, email: userInfo.data.email, name: userInfo.data.name };
      }
      if (store.ga4) {
        oauth2.setCredentials(store.ga4);
        const oauth2Api = google.oauth2({ version: 'v2', auth: oauth2 });
        const userInfo = await oauth2Api.userinfo.get();
        result.ga4 = { connected: true, email: userInfo.data.email, name: userInfo.data.name };
      }
    } catch (err) {
      console.error('Google status error', err); // do not block UI
    }
    return sendJson(res, 200, result);
  }

  if (parsedUrl.pathname === '/api/google/gsc/sites' && req.method === 'GET') {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) return sendJson(res, 401, { message: 'Unauthorized' });
    const store = googleTokenStore[sessionToken] || {};
    if (!store.gsc) return sendJson(res, 400, { message: 'GSC not connected' });
    try {
      const oauth2 = getOauth2Client(port);
      oauth2.setCredentials(store.gsc);
      const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2 });
      const response = await searchconsole.sites.list();
      return sendJson(res, 200, { sites: response.data.siteEntry || [] });
    } catch (err) {
      return sendJson(res, 500, { message: 'GSC request failed', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/google/gsc/query' && req.method === 'POST') {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) return sendJson(res, 401, { message: 'Unauthorized' });
    const store = googleTokenStore[sessionToken] || {};
    if (!store.gsc) return sendJson(res, 400, { message: 'GSC not connected' });

    const { siteUrl, startDate, endDate, dimensions, metrics } = await parseBody(req);
    if (!siteUrl || !startDate || !endDate) return sendJson(res, 400, { message: 'Missing siteUrl/startDate/endDate' });

    try {
      const oauth2 = getOauth2Client(port);
      oauth2.setCredentials(store.gsc);
      const searchconsole = google.searchconsole({ version: 'v1', auth: oauth2 });
      const response = await searchconsole.searchanalytics.query({
        siteUrl,
        requestBody: {
          startDate,
          endDate,
          dimensions: dimensions || ['date'],
          metrics: metrics || ['impressions', 'clicks', 'ctr', 'position'],
          rowLimit: 25000,
        },
      });
      return sendJson(res, 200, { rows: response.data.rows || [] });
    } catch (err) {
      return sendJson(res, 500, { message: 'GSC query failed', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/google/ga4/properties' && req.method === 'GET') {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) return sendJson(res, 401, { message: 'Unauthorized' });
    const store = googleTokenStore[sessionToken] || {};
    if (!store.ga4) return sendJson(res, 400, { message: 'GA4 not connected' });

    try {
      const oauth2 = getOauth2Client(port);
      oauth2.setCredentials(store.ga4);
      const analyticsadmin = google.analyticsadmin({ version: 'v1beta', auth: oauth2 });
      const accounts = await analyticsadmin.accounts.list();
      const accountItems = accounts.data.accounts || [];
      if (!accountItems.length) return sendJson(res, 200, { properties: [] });
      const firstAccount = accountItems[0].name;
      const properties = await analyticsadmin.properties.list({ parent: firstAccount });
      return sendJson(res, 200, { properties: properties.data.properties || [] });
    } catch (err) {
      return sendJson(res, 500, { message: 'GA4 properties request failed', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/google/ga4/report' && req.method === 'POST') {
    const sessionToken = getSessionToken(req);
    if (!sessionToken) return sendJson(res, 401, { message: 'Unauthorized' });
    const store = googleTokenStore[sessionToken] || {};
    if (!store.ga4) return sendJson(res, 400, { message: 'GA4 not connected' });

    const { propertyId, startDate, endDate, dimensions, metrics } = await parseBody(req);
    if (!propertyId || !startDate || !endDate) return sendJson(res, 400, { message: 'Missing propertyId/startDate/endDate' });

    try {
      const oauth2 = getOauth2Client(port);
      oauth2.setCredentials(store.ga4);
      const analyticsdata = google.analyticsdata({ version: 'v1beta', auth: oauth2 });
      const response = await analyticsdata.properties.runReport({
        property: `properties/${propertyId}`,
        requestBody: {
          dateRanges: [{ startDate, endDate }],
          dimensions: (dimensions || ['date']).map((d) => ({ name: d })),
          metrics: (metrics || ['activeUsers']).map((m) => ({ name: m })),
          limit: 25000,
        },
      });
      return sendJson(res, 200, { rows: response.data.rows || [] });
    } catch (err) {
      return sendJson(res, 500, { message: 'GA4 report request failed', error: err.message });
    }
  }

  // Service account GA4 endpoints
  if (parsedUrl.pathname === '/api/ga4/properties' && req.method === 'GET') {
    try {
      const properties = await getGA4Properties();
      return sendJson(res, 200, { properties });
    } catch (err) {
      return sendJson(res, 500, { message: 'Failed to fetch GA4 properties', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/ga4/report' && req.method === 'POST') {
    try {
      const { propertyId, startDate, endDate, dimensions, metrics } = await parseBody(req);
      if (!propertyId || !startDate || !endDate) {
        return sendJson(res, 400, { message: 'Missing propertyId, startDate, or endDate' });
      }

      const report = await fetchGA4Report(
        propertyId,
        startDate,
        endDate,
        dimensions,
        metrics
      );
      return sendJson(res, 200, report);
    } catch (err) {
      return sendJson(res, 500, { message: 'GA4 report failed', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/ga4/realtime' && req.method === 'GET') {
    try {
      const propertyId = parsedUrl.searchParams.get('propertyId');
      if (!propertyId) {
        return sendJson(res, 400, { message: 'Missing propertyId' });
      }

      const auth = await getGA4ServiceAccountAuth();
      const analyticsdata = google.analyticsdata({ version: 'v1beta', auth });
      const response = await analyticsdata.properties.runRealtimeReport({
        property: `properties/${propertyId}`,
        requestBody: {
          metrics: [{ name: 'activeUsers' }, { name: 'newUsers' }],
        },
      });

      return sendJson(res, 200, response.data);
    } catch (err) {
      return sendJson(res, 500, { message: 'GA4 realtime report failed', error: err.message });
    }
  }

  // Service account GSC endpoints
  if (parsedUrl.pathname === '/api/gsc/sites' && req.method === 'GET') {
    try {
      const sites = await getGSCSites();
      return sendJson(res, 200, { sites });
    } catch (err) {
      return sendJson(res, 500, { message: 'Failed to fetch GSC sites', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/gsc/report' && req.method === 'POST') {
    try {
      const { siteUrl, startDate, endDate, dimensions, metrics } = await parseBody(req);
      if (!siteUrl || !startDate || !endDate) {
        return sendJson(res, 400, { message: 'Missing siteUrl, startDate, or endDate' });
      }

      const report = await fetchGSCReport(
        siteUrl,
        startDate,
        endDate,
        dimensions,
        metrics
      );
      return sendJson(res, 200, report);
    } catch (err) {
      return sendJson(res, 500, { message: 'GSC report failed', error: err.message });
    }
  }

  // Google Sheets endpoint
  if (parsedUrl.pathname === '/api/sheets/data' && req.method === 'POST') {
    try {
      const { spreadsheetId, range } = await parseBody(req);
      if (!spreadsheetId || !range) {
        return sendJson(res, 400, { message: 'Missing spreadsheetId or range' });
      }

      const auth = await getGA4ServiceAccountAuth();
      const sheets = google.sheets({ version: 'v4', auth });
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range,
      });

      const values = response.data.values || [];
      return sendJson(res, 200, { values, range });
    } catch (err) {
      return sendJson(res, 500, { message: 'Sheets request failed', error: err.message });
    }
  }

  // Integrated report endpoint with GA4 + GSC + Sheets
  if (parsedUrl.pathname === '/api/report/integrated' && req.method === 'POST') {
    try {
      const { propertyId, siteUrl, spreadsheetId, startDate, endDate } = await parseBody(req);
      
      const result = {
        ga4: null,
        gsc: null,
        sheets: null,
        errors: []
      };

      // Fetch GA4 data if propertyId is provided
      if (propertyId) {
        try {
          result.ga4 = await fetchGA4Report(
            propertyId,
            startDate,
            endDate,
            ['date'],
            ['activeUsers', 'sessions', 'engagementRate', 'screenPageViews']
          );
        } catch (err) {
          result.errors.push({ source: 'GA4', message: err.message });
        }
      }

      // Fetch GSC data if siteUrl is provided
      if (siteUrl) {
        try {
          result.gsc = await fetchGSCReport(
            siteUrl,
            startDate,
            endDate,
            ['date'],
            ['impressions', 'clicks', 'ctr']
          );
        } catch (err) {
          result.errors.push({ source: 'GSC', message: err.message });
        }
      }

      // Fetch Sheets data if spreadsheetId is provided
      if (spreadsheetId) {
        try {
          const auth = await getGA4ServiceAccountAuth();
          const sheetsApi = google.sheets({ version: 'v4', auth });
          const response = await sheetsApi.spreadsheets.values.get({
            spreadsheetId,
            range: 'Sheet1!A:F',
          });
          result.sheets = { values: response.data.values || [] };
        } catch (err) {
          result.errors.push({ source: 'Sheets', message: err.message });
        }
      }

      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 500, { message: 'Integrated report failed', error: err.message });
    }
  }

  if (parsedUrl.pathname === '/api/metrics' && req.method === 'GET') {
    const workspace = ensureWorkspace(getSession(req)?.user, true);
    if (POSTIZ_API_KEY) {
      try {
        const live = await fetchPostizWorkspaceMetrics(Object.fromEntries(parsedUrl.searchParams.entries()));
        return sendJson(res, 200, {
          metrics: live.metrics,
          lastUploadName: 'Postiz live analytics',
          perPlatform: live.perPlatform,
          platformDashboards: live.platformDashboards,
          dailyData: live.dailyData,
          postiz: live.postiz,
          fallbackMetrics: workspace?.metrics || createEmptyMetrics(),
          fallbackPerPlatform: workspace?.perPlatform || {},
        });
      } catch (err) {
        return sendJson(res, 200, {
          metrics: workspace?.metrics || createEmptyMetrics(),
          lastUploadName: workspace?.lastUploadName || null,
          perPlatform: workspace?.perPlatform || {},
          platformDashboards: workspace?.platformDashboards || {},
          dailyData: buildDailyData(workspace),
          postiz: { error: err.message },
        });
      }
    }
    return sendJson(res, 200, {
      metrics: workspace?.metrics || createEmptyMetrics(),
      lastUploadName: workspace?.lastUploadName || null,
      perPlatform: workspace?.perPlatform || {},
      platformDashboards: workspace?.platformDashboards || {},
      dailyData: buildDailyData(workspace),
    });
  }

  if (parsedUrl.pathname === '/api/reports' && req.method === 'GET') {
    const workspace = ensureWorkspace(getSession(req)?.user, true);
    return sendJson(res, 200, { reports: workspace?.reports || [] });
  }

  if (parsedUrl.pathname === '/api/reports/sync' && req.method === 'POST') {
    const workspace = ensureWorkspace(getSession(req)?.user, true);
    const body = await parseBody(req);
    const nextReports = Array.isArray(body?.reports) ? body.reports.map((report) => sanitizeReport(report)) : null;
    if (!nextReports) return sendJson(res, 400, { message: 'reports array required' });
    workspace.reports = nextReports;
    workspace.updatedAt = new Date().toISOString();
    saveAppState();
    return sendJson(res, 200, { ok: true, reports: workspace.reports });
  }

  if (parsedUrl.pathname === '/api/feedback/ai-suggestions' && req.method === 'POST') {
    const body = await parseBody(req);
    try {
      const workspace = ensureWorkspace(getSession(req)?.user, true);
      const result = await buildAiSuggestionsFromAnalytics(workspace, body);
      return sendJson(res, 200, result);
    } catch (err) {
      return sendJson(res, 400, { message: err.message || 'Failed to generate AI suggestions' });
    }
  }

  if (req.url === '/api/upload' && req.method === 'POST') {
    let body = '';
    req.on('data', (chunk) => (body += chunk));
    req.on('end', async () => {
      try {
        const workspace = ensureWorkspace(getSession(req)?.user, true);
        const parsed = JSON.parse(body || '{}');
        const files = Array.isArray(parsed) ? parsed : parsed.files || [parsed];
        if (!files.length) return sendJson(res, 400, { message: 'no files found' });
        const platformDashboards = buildPlatformDashboards(files);

        let aggregatePosts = [];
        let counter = 0;
        const normalizationSummary = {
          gemini: 0,
          deepseek: 0,
          fallback: 0,
          errors: [],
        };

        for (const fileObj of files) {
          let parsedPosts = [];
          try {
            parsedPosts = parseFileLocally(fileObj, counter);
            normalizationSummary.fallback += 1;
          } catch (localError) {
            normalizationSummary.errors.push({
              filename: fileObj.filename || 'file.csv',
              step: 'local',
              message: localError.message,
            });
            try {
              const normalized = await normalizeFileWithAi(fileObj);
              if (normalized?.rows?.length) {
                parsedPosts = buildPostsFromUploadRows(normalized.rows, fileObj, counter);
                if (normalized.provider === 'gemini') normalizationSummary.gemini += 1;
                if (normalized.provider === 'deepseek') normalizationSummary.deepseek += 1;
              }
            } catch (aiError) {
              normalizationSummary.errors.push({
                filename: fileObj.filename || 'file.csv',
                step: 'ai',
                message: aiError.message,
              });
              parsedPosts = [];
            }
          }

          counter += parsedPosts.length;
          aggregatePosts = aggregatePosts.concat(parsedPosts);
        }

        workspace.posts = aggregatePosts;
        workspace.lastUploadName = files.map((f) => f.filename || 'file.csv').join(', ');
        workspace.platformDashboards = {
          ...(workspace.platformDashboards || {}),
          ...platformDashboards,
        };
        recalcMetrics(workspace);
        saveAppState();
        return sendJson(res, 200, {
          ok: true,
          count: workspace.posts.length,
          metrics: workspace.metrics,
          platformDashboards: workspace.platformDashboards,
          files: files.length,
          normalization: {
            provider: normalizationSummary.gemini
              ? 'gemini'
              : normalizationSummary.deepseek
                ? 'deepseek'
                : 'fallback',
            geminiFiles: normalizationSummary.gemini,
            deepseekFiles: normalizationSummary.deepseek,
            fallbackFiles: normalizationSummary.fallback,
            warnings: normalizationSummary.errors,
          },
        });
      } catch (err) {
        return sendJson(res, 400, { message: err.message || 'Invalid upload' });
      }
    });
    return;
  }

  // Positioning Wizard API Endpoints
  if (req.url === '/api/positioning/generate' && req.method === 'POST') {
    if (!isAuthenticated(req)) return sendJson(res, 401, { message: 'Unauthorized' });
    
    try {
      const { brandName, industry, usp, brandTone, brandValues } = await parseBody(req);
      
      if (!brandName || !industry || !usp || !brandTone || !Array.isArray(brandValues) || brandValues.length < 2) {
        return sendJson(res, 400, { message: 'Missing or invalid required fields' });
      }

      // Create prompt for DeepSeek
      const positioningPrompt = `You are an expert Brand Positioning Strategist. Generate a comprehensive brand positioning report in JSON format with the following structure:
{
  "positioningStatement": "string - compelling positioning statement",
  "taglines": ["array", "of", "tagline", "options"],
  "differentiators": ["array", "of", "key", "differentiators"],
  "elevatorPitch": "string - 80-150 word elevator pitch",
  "messaging": {
    "coreMessage": "string - central brand message",
    "targetAudiences": [{"type": "string", "description": "string"}],
    "supportingMessages": ["array", "of", "supporting", "messages"],
    "callToActions": ["array", "of", "cta", "options"]
  },
  "conclusion": "string - 2-4 sentence strategic conclusion"
}`;

      const input = `Brand Name: ${brandName}
Industry: ${industry}
Unique Selling Proposition: ${usp}
Brand Tone: ${brandTone}
Brand Values: ${brandValues.join(', ')}

Generate a professional, strategic brand positioning report based on this information.`;

      let report;
      try {
        const providerSequence = getProviderSequence(AI_SUGGESTIONS_PROVIDER, ['gemini', 'deepseek']);
        report = await callAiJsonSequence(providerSequence, positioningPrompt, input, 'Failed to generate positioning report');
      } catch (error) {
        report = fallbackPositioningReport({ brandName, industry, usp, brandTone, brandValues });
      }

      const normalizedReport = normalizePositioningReport(report, { brandName, industry, usp, brandTone, brandValues });

      // Add metadata
      const completeReport = {
        id: 'pos-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9),
        brandName,
        industry,
        usp,
        brandTone,
        brandValues,
        positioningStatement: normalizedReport.positioningStatement || '',
        taglines: normalizedReport.taglines || [],
        differentiators: normalizedReport.differentiators || [],
        elevatorPitch: normalizedReport.elevatorPitch || '',
        messaging: normalizedReport.messaging || {},
        conclusion: normalizedReport.conclusion || '',
        createdAt: new Date().toISOString(),
      };

      return sendJson(res, 200, { report: completeReport });
    } catch (err) {
      console.error('Positioning generation error:', err);
      return sendJson(res, 400, { message: err.message || 'Failed to generate positioning' });
    }
  }

  if (req.url === '/api/positioning/save' && req.method === 'POST') {
    if (!isAuthenticated(req)) return sendJson(res, 401, { message: 'Unauthorized' });
    
    try {
      const report = await parseBody(req);
      const session = getSession(req);
      const userEmail = session?.user?.email;

      if (!userEmail) return sendJson(res, 401, { message: 'User email not found' });
      if (!report.brandName || !report.id) return sendJson(res, 400, { message: 'Invalid report' });

      // Add user info and timestamp
      const reportToSave = {
        ...report,
        userEmail,
        savedAt: new Date().toISOString(),
      };

      // Save to positioning reports
      if (!positioningReports.reports) positioningReports.reports = [];
      
      // Check if report already exists and update it
      const existingIndex = positioningReports.reports.findIndex(r => r.id === report.id && r.userEmail === userEmail);
      if (existingIndex >= 0) {
        positioningReports.reports[existingIndex] = reportToSave;
      } else {
        positioningReports.reports.push(reportToSave);
      }

      savePositioningReports(positioningReports);
      return sendJson(res, 200, { ok: true, id: report.id });
    } catch (err) {
      console.error('Save positioning error:', err);
      return sendJson(res, 400, { message: err.message || 'Failed to save report' });
    }
  }

  if (req.url === '/api/positioning/reports' && req.method === 'GET') {
    if (!isAuthenticated(req)) return sendJson(res, 401, { message: 'Unauthorized' });
    
    try {
      const session = getSession(req);
      const userEmail = session?.user?.email;

      if (!userEmail) return sendJson(res, 401, { message: 'User email not found' });

      // Get reports for current user
      const userReports = (positioningReports.reports || []).filter(r => r.userEmail === userEmail);
      return sendJson(res, 200, { reports: userReports });
    } catch (err) {
      console.error('Get reports error:', err);
      return sendJson(res, 400, { message: err.message || 'Failed to load reports' });
    }
  }

  if (req.url.match(/^\/api\/positioning\/delete\//) && req.method === 'DELETE') {
    if (!isAuthenticated(req)) return sendJson(res, 401, { message: 'Unauthorized' });
    
    try {
      const match = req.url.match(/^\/api\/positioning\/delete\/([^/?]+)/);
      const reportId = match ? decodeURIComponent(match[1]) : null;

      if (!reportId) return sendJson(res, 400, { message: 'Report ID required' });

      const session = getSession(req);
      const userEmail = session?.user?.email;

      if (!userEmail) return sendJson(res, 401, { message: 'User email not found' });

      // Find and delete report
      const initialLength = positioningReports.reports.length;
      positioningReports.reports = (positioningReports.reports || []).filter(
        r => !(r.id === reportId && r.userEmail === userEmail)
      );

      if (positioningReports.reports.length === initialLength) {
        return sendJson(res, 404, { message: 'Report not found' });
      }

      savePositioningReports(positioningReports);
      return sendJson(res, 200, { ok: true });
    } catch (err) {
      console.error('Delete report error:', err);
      return sendJson(res, 400, { message: err.message || 'Failed to delete report' });
    }
  }

  if (serveStatic(req, res)) return;

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server running on http://localhost:${port}`));
