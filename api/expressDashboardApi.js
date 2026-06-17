const express = require('express');
const multer = require('multer');
const csvParser = require('csv-parser');
const stream = require('stream');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { URL, URLSearchParams } = require('url');
const {
  getSocialAuthLinks,
  scheduleSocialPost,
  getScheduledCalendarPosts,
  getSocialAnalytics,
} = require('./postizClient');

require('dotenv').config({ path: path.join(__dirname, '..', 'API.env') });

const POSTIZ_API_KEY = process.env.POSTIZ_API_KEY || '';
const POSTIZ_CUSTOMER_ID = process.env.POSTIZ_CUSTOMER_ID || '';
const POSTIZ_API_BASE = process.env.POSTIZ_API_BASE_URL || 'https://api.postiz.com/public/v1';
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

function buildPostizUrl(endpoint, query = {}) {
  const url = new URL(`${POSTIZ_API_BASE}${endpoint}`);
  const params = new URLSearchParams();
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    params.set(key, String(value));
  });
  url.search = params.toString();
  return url.toString();
}

async function postizFetch(endpoint, method = 'GET', body = null) {
  if (!POSTIZ_API_KEY) {
    throw new Error('Postiz API key is required in API.env as POSTIZ_API_KEY');
  }

  const url = buildPostizUrl(endpoint, method === 'GET' ? body || {} : {});
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: POSTIZ_API_KEY,
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

async function resolvePostizCustomerId(preferredCustomerId = '') {
  const customerId = String(preferredCustomerId || POSTIZ_CUSTOMER_ID || '').trim();
  if (customerId) return customerId;
  const groups = await postizFetch('/groups', 'GET').catch(() => []);
  const group = extractPostizList(groups, 'groups')[0];
  return group?.id || '';
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

function normalizeScheduledFor(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return `${text}T09:00:00`;
  return text;
}

function postizMediaItems(body = {}) {
  const items = Array.isArray(body.mediaItems) ? body.mediaItems : [];
  const media = items.map((item) => ({
    id: item.id || crypto.randomBytes(6).toString('hex'),
    path: item.path || item.url,
  })).filter((item) => item.path);
  if (body.mediaUrl) {
    media.push({ id: crypto.randomBytes(6).toString('hex'), path: body.mediaUrl });
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
  const likes = safeNumber(analytics.likes);
  const comments = safeNumber(analytics.comments);
  const shares = safeNumber(analytics.shares);
  const saves = safeNumber(analytics.saves);
  const reactions = safeNumber(analytics.reactions || analytics.likes);
  const clicks = safeNumber(analytics.clicks);
  const views = safeNumber(analytics.views);
  const reach = safeNumber(analytics.reach || analytics.impressions);
  const title = String(item.title || item.content || item.message || 'Postiz post').trim();

  return {
    id: item.postId || item._id || item.latePostId || crypto.randomBytes(8).toString('hex'),
    postizPostId: item.postId || item._id || item.latePostId || null,
    platform,
    source: item.isExternal ? 'Postiz external sync' : 'Postiz',
    title: title.length > 90 ? `${title.slice(0, 87)}...` : title,
    transcript: String(item.content || item.message || '').trim(),
    postedAt: item.publishedAt || item.scheduledFor || null,
    status: item.status || 'published',
    engagement: {
      likes,
      comments,
      shares,
      reactions,
      saves,
      total: likes + comments + shares + reactions + saves,
    },
    reach,
    clicks,
    views,
    followers: 0,
    createdAt: item.publishedAt ? new Date(item.publishedAt).getTime() : Date.now(),
    raw: item,
  };
}

function buildPlatformDashboardsFromPostiz(posts = [], followerStats = null) {
  const dashboards = {};
  posts.forEach((post) => {
    const platform = post.platform || 'Social';
    const row = {
      date: post.postedAt ? formatIsoDate(post.postedAt) : formatIsoDate(Date.now()),
      metrics: {
        Impressions: Number(post.reach || 0),
        Reach: Number(post.reach || 0),
        Interactions: Number(post.engagement?.total || 0),
        Clicks: Number(post.clicks || 0),
        Reactions: Number(post.engagement?.reactions || 0),
        Comments: Number(post.engagement?.comments || 0),
        Shares: Number(post.engagement?.shares || 0),
        Views: Number(post.views || 0),
      },
      raw: post.raw || post,
    };
    dashboards[platform] = dashboards[platform] || {
      platform,
      filename: 'Postiz live analytics',
      uploadedAt: new Date().toISOString(),
      rows: [],
      postizRows: [],
      metricoolRows: [],
    };
    dashboards[platform].rows.push(row);
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
        Follows: safeNumber(account.currentFollowers),
        Followers: safeNumber(account.currentFollowers),
        'Follower Growth': safeNumber(account.growth),
      },
      raw: account,
    });
  });
  return dashboards;
}

function analyticsSeriesValue(series = {}) {
  const points = Array.isArray(series.data) ? series.data : [];
  if (!points.length) return safeNumber(series.total || series.value || 0);
  return points.reduce((total, point) => total + safeNumber(point.total || point.value), 0);
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
      byDate.get(date).metrics[label] = safeNumber(point.total || point.value);
    });
  });
  if (!byDate.size && analytics.length) {
    const metrics = {};
    analytics.forEach((series) => {
      if (series.label) metrics[series.label] = analyticsSeriesValue(series);
    });
    const today = formatIsoDate(Date.now());
    byDate.set(today, { date: today, metrics, raw: { integration, analytics } });
  }
  return { platform, rows: Array.from(byDate.values()) };
}

function buildPostizPost(item = {}) {
  const integration = item.integration || {};
  const platform = displayPlatform(integration.providerIdentifier || integration.identifier || item.platform);
  const title = String(item.title || item.content || item.value?.[0]?.content || 'Postiz post').trim();
  return {
    id: item.id || crypto.randomBytes(8).toString('hex'),
    postizPostId: item.id || null,
    platform,
    title: title.length > 90 ? `${title.slice(0, 87)}...` : title,
    transcript: String(item.content || item.value?.[0]?.content || '').trim(),
    postedAt: item.publishDate || item.date || item.scheduledFor || item.createdAt || Date.now(),
    status: item.state || item.status || 'scheduled',
    engagement: { likes: 0, comments: 0, shares: 0, reactions: 0, total: 0 },
    reach: 0,
    clicks: 0,
    views: 0,
    followers: 0,
    createdAt: item.createdAt ? new Date(item.createdAt).getTime() : Date.now(),
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
  const snapshot = aggregateMetrics(posts);
  return {
    posts,
    metrics: snapshot.totals,
    perPlatform: snapshot.perPlatform,
    platformDashboards,
    postiz: {
      analytics,
      integrations,
      groups,
      followerStats,
      posts: postsResult,
      customer,
    },
  };
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

async function fetchPostizTimeline(platform) {
  const wantedPlatform = postizPlatform(platform);
  const customer = await resolvePostizCustomerId();
  const integrations = extractPostizList(await postizFetch('/integrations', 'GET', { group: customer }), 'integrations')
    .filter((item) => postizPlatform(item.identifier || item.providerIdentifier) === wantedPlatform);
  const rows = [];
  for (const integration of integrations) {
    const analytics = await postizFetch(`/analytics/${encodeURIComponent(integration.id)}`, 'GET', { date: 30 }).catch(() => []);
    rowsFromPostizAnalytics(integration, Array.isArray(analytics) ? analytics : []).rows.forEach((row) => rows.push({
      date: row.date,
      ...row.metrics,
    }));
  }
  return rows;
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
      const metricoolRows = await fetchPostizTimeline(platform).catch(() => []);
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

app.get('/api/metrics', async (req, res) => {
  ensureWorkspaceMetrics();
  if (POSTIZ_API_KEY) {
    try {
      const live = await fetchPostizWorkspaceMetrics(req.query || {});
      return res.json({
        metrics: live.metrics,
        perPlatform: live.perPlatform,
        platformDashboards: live.platformDashboards,
        lastUploadName: 'Postiz live analytics',
        postiz: live.postiz,
        fallbackMetrics: workspace.metrics || {},
        fallbackPerPlatform: workspace.perPlatform || {},
      });
    } catch (error) {
      return res.json({
        metrics: workspace.metrics || {},
        perPlatform: workspace.perPlatform || {},
        lastUploadName: workspace.lastUploadName || '',
        postiz: { error: error.message },
      });
    }
  }
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

app.get('/api/social/accounts', async (req, res) => {
  try {
    const customer = await resolvePostizCustomerId(req.query.customer || req.query.profileId || '');
    const wantedPlatform = postizPlatform(req.query.platform || '');
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
      profileUrl: account.profileUrl || account.picture || '',
      isActive: account.disabled !== true,
      profileId: account.customer?.id || customer || '',
      raw: account,
    }));
    return res.json({ accounts, hasAnalyticsAccess: true, raw: result });
  } catch (error) {
    return res.status(502).json({ error: `Postiz accounts lookup failed: ${error.message}` });
  }
});

app.get('/api/auth/connect-link', async (req, res) => {
  try {
    const platform = postizPlatform(req.query.platform || 'instagram');
    const result = await postizFetch(`/social/${encodeURIComponent(platform)}`, 'GET', { refresh: req.query.refresh || '' });
    const connectUrl = result?.authUrl || result?.auth_url || result?.connectUrl || result?.url;
    if (!connectUrl) return res.status(502).json({ error: 'Postiz did not return a connect URL.', raw: result });
    return res.json({ connectUrl, platform, raw: result });
  } catch (error) {
    return res.status(502).json({ error: `Could not load Postiz connect-link: ${error.message}` });
  }
});

app.post('/api/schedule-post', async (req, res) => {
  try {
    const body = req.body || {};
    if (!body || typeof body !== 'object') {
      return res.status(400).json({ error: 'Scheduling payload must be a valid JSON object.' });
    }

    const platforms = Array.isArray(body.platforms) && body.platforms.length
      ? body.platforms
      : [{
        platform: postizPlatform(body.platform),
        accountId: body.accountId || body.socialAccountId,
      }];
    const normalizedPlatforms = platforms
      .map((item) => ({
        platform: postizPlatform(item.platform),
        accountId: item.accountId || item.id,
      }))
      .filter((item) => item.platform && item.accountId);

    if (!normalizedPlatforms.length) {
      return res.status(400).json({ error: 'Choose at least one connected Postiz social account before scheduling.' });
    }

    const payload = buildPostizSchedulePayload(body, normalizedPlatforms);
    const content = body.content || body.caption || body.transcript || '';

    const result = await postizFetch('/posts', 'POST', payload);
    const postizPost = result.post || result.data?.post || result.data || result;
    const localPost = {
      id: postizPost._id || postizPost.id || crypto.randomBytes(8).toString('hex'),
      postizPostId: postizPost._id || postizPost.id || null,
      platform: displayPlatform(normalizedPlatforms[0].platform),
      title: body.title || String(content || 'Scheduled post').slice(0, 80),
      transcript: content,
      postedAt: payload.date || postizPost.publishDate || new Date().toISOString(),
      status: payload.type === 'now' ? 'publishing' : payload.type,
      engagement: { likes: 0, comments: 0, shares: 0, reactions: 0, total: 0 },
      reach: 0,
      clicks: 0,
      views: 0,
      followers: 0,
      createdAt: Date.now(),
      raw: { request: payload, postiz: result },
    };
    workspace.posts.unshift(localPost);
    persistWorkspace();
    return res.json({ success: true, result, post: localPost });
  } catch (error) {
    return res.status(502).json({ error: `Scheduling failed: ${error.message}` });
  }
});

app.get('/api/content-lab/calendar', async (req, res) => {
  try {
    const { startDate, endDate } = req.query;
    const result = await postizFetch('/posts', 'GET', {
      startDate: startDate || new Date(Date.now() - 30 * 86400000).toISOString(),
      endDate: endDate || new Date(Date.now() + 365 * 86400000).toISOString(),
      customer: req.query.customer || POSTIZ_CUSTOMER_ID,
    });
    return res.json({ calendar: extractPostizList(result, 'posts'), raw: result });
  } catch (error) {
    return res.status(502).json({ error: `Calendar lookup failed: ${error.message}` });
  }
});

app.get('/api/reports/competitors', async (req, res) => {
  try {
    const handles = String(req.query.handles || req.query.competitors || '').split(',').map((item) => item.trim()).filter(Boolean);
    return res.status(501).json({ error: 'Competitor reports are not available in the current Postiz integration.', requestedHandles: handles });
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

    return res.status(501).json({ error: 'Caption generation is handled by the local AI endpoints, not Postiz.' });
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

app.get('/api/postiz/auth-links', async (req, res) => {
  try {
    const links = await getSocialAuthLinks();
    return res.json({ links });
  } catch (error) {
    return res.status(502).json({ error: `Postiz auth links failed: ${error.message}` });
  }
});

app.post('/api/postiz/schedule', async (req, res) => {
  try {
    const result = await scheduleSocialPost(req.body || {});
    return res.json({ success: true, result });
  } catch (error) {
    return res.status(502).json({ error: `Postiz scheduling failed: ${error.message}` });
  }
});

app.get('/api/postiz/calendar', async (req, res) => {
  try {
    const posts = await getScheduledCalendarPosts(req.query || {});
    return res.json({ posts });
  } catch (error) {
    return res.status(502).json({ error: `Postiz calendar lookup failed: ${error.message}` });
  }
});

app.get('/api/postiz/analytics', async (req, res) => {
  try {
    const channelId = req.query.channelId || req.query.integrationId || '';
    const dateRange = req.query.dateRange || req.query.date || '30';
    const analytics = await getSocialAnalytics(channelId, dateRange);
    return res.json({ analytics });
  } catch (error) {
    return res.status(502).json({ error: `Postiz analytics lookup failed: ${error.message}` });
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
