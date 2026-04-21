const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

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
};

const staticDir = path.join(__dirname, '..', 'public');
const sessionsFile = path.join(__dirname, 'sessions.json');
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

let sessions = loadSessions();
let posts = [];
let metrics = {
  reach: 0,
  interactions: 0,
  clicks: 0,
  reactions: 0,
  views: 0,
  follows: 0,
  engagementRate: 0,
};
let perPlatform = {};
let lastUploadName = null;

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID || '';
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET || '';
const GEMINI_API_KEY =
  process.env.GEMINI_API_KEY ||
  process.env.GOOGLE_API_KEY ||
  'AIzaSyDXwYj32Ylt72cR_iNOyzGZpk1TsgERx_I';
const GEMINI_UPLOAD_MODEL = process.env.GEMINI_UPLOAD_MODEL || 'gemini-2.0-flash';
const googleTokenStore = {}; // keyed by session token
const geminiClient = GEMINI_API_KEY ? new GoogleGenerativeAI(GEMINI_API_KEY) : null;

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

function platformFromFilename(filename = '') {
  const base = String(filename).toLowerCase();
  if (base.startsWith('ig_') || base.includes('instagram')) return 'Instagram';
  if (base.startsWith('fb_') || base.includes('facebook')) return 'Facebook';
  if (base.startsWith('link_') || base.startsWith('linkedin_') || base.includes('linkedin')) return 'LinkedIn';
  if (base.startsWith('tiktok_') || base.includes('tiktok')) return 'TikTok';
  if (base.startsWith('snap_') || base.includes('snapchat')) return 'Snapchat';
  return 'Upload';
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
          platform: getRowValue(row, keyMap, 'platform') || platformFromFilename(filename),
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
        platformFromFilename(filename)
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
          platform: platformFromFilename(filename),
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
        platformFromFilename(filename)
      );
    });
  }

  throw new Error('Unsupported CSV format');
}

async function normalizeFileWithGemini(fileObj) {
  if (!geminiClient) return null;
  const { filename, csv } = fileObj;
  if (!csv) throw new Error('csv required');

  const model = geminiClient.getGenerativeModel({ model: GEMINI_UPLOAD_MODEL });
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

  const result = await model.generateContent(`${prompt}\n\nFilename: ${filename || 'upload.csv'}\nCSV:\n${csv}`);
  const text = result?.response?.text?.() || '';
  const jsonText = extractJsonPayload(text);
  if (!jsonText) throw new Error('Gemini returned an invalid normalization payload');

  const parsed = JSON.parse(jsonText);
  const rows = Array.isArray(parsed?.rows) ? parsed.rows : [];
  if (!rows.length) throw new Error('Gemini did not return any normalized rows');

  return {
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

function buildLocalAiSuggestions() {
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

async function buildAiSuggestionsFromAnalytics({ start, end, platform, metrics: requestMetrics, perPlatform: requestPerPlatform, recentPosts: requestRecentPosts } = {}) {
  if (!posts.length && !requestMetrics) throw new Error('Upload analytics data first');
  if (!geminiClient) return buildLocalAiSuggestions();

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

  const model = geminiClient.getGenerativeModel({ model: GEMINI_UPLOAD_MODEL });
  try {
    const result = await model.generateContent(`${prompt}\n\nAnalytics JSON:\n${JSON.stringify(payload)}`);
    const text = result?.response?.text?.() || '';
    const jsonText = extractJsonPayload(text);
    if (!jsonText) throw new Error('Gemini returned an invalid suggestions payload');

    const parsed = JSON.parse(jsonText);
    const takeaways = Array.isArray(parsed?.takeaways)
      ? parsed.takeaways.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
      : [];
    const actions = Array.isArray(parsed?.actions)
      ? parsed.actions.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 5)
      : [];

    if (!takeaways.length || !actions.length) throw new Error('Gemini did not return valid takeaways/actions');

    return {
      title: String(parsed?.title || 'AI Report').trim(),
      summary: String(parsed?.summary || '').trim(),
      takeaways,
      actions,
    };
  } catch (error) {
    console.error('AI suggestions fallback:', error.message);
    const fallback = buildLocalAiSuggestions();
    return {
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

function buildDailyData() {
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

const recalcMetrics = () => {
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
  perPlatform = agg;
};

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

const isAuthenticated = (req) => {
  const cookies = parseCookies(req);
  if (!cookies.session) return false;
  return sessions.some((s) => s.token === cookies.session);
};

const PUBLIC_ROUTES = new Set(['/landing.html', '/login.html']);

const serveStatic = (req, res) => {
  const safePath = req.url === '/' ? '/landing.html' : req.url.split('?')[0];
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
    const { email, password } = await parseBody(req);
    if (!email || !password) return sendJson(res, 400, { message: 'Email and password required' });
    const token = 'sess-' + crypto.randomBytes(12).toString('hex');
    const user = { name: 'Demo User', email, createdAt: Date.now() };
    sessions.push({ token, user, createdAt: Date.now() });
    saveSessions(sessions);
    return sendJson(res, 200, { token, user });
  }

  // All API routes except login and health require a valid session
  if (req.url.startsWith('/api') && req.url !== '/api/login' && req.url !== '/api/health') {
    if (!isAuthenticated(req)) return sendJson(res, 401, { message: 'Unauthorized' });
  }

  if (req.url === '/api/posts' && req.method === 'GET') {
    return sendJson(res, 200, { posts });
  }

  if (req.url === '/api/posts' && req.method === 'POST') {
    const { platform, title, transcript } = await parseBody(req);
    if (!platform || !title) return sendJson(res, 400, { message: 'platform and title required' });
    const post = {
      id: 'p' + (posts.length + 1),
      platform,
      title,
      transcript: transcript || '',
      engagement: { likes: 0, comments: 0, shares: 0 },
      status: 'scheduled',
      postedAt: null,
    };
    posts.unshift(post);
    return sendJson(res, 201, { post });
  }

  if (req.url.startsWith('/api/posts/') && req.url.endsWith('/publish') && req.method === 'POST') {
    const id = req.url.split('/')[3];
    const post = posts.find((p) => p.id === id);
    if (!post) return sendJson(res, 404, { message: 'not found' });
    post.status = 'posted';
    post.postedAt = Date.now();
    return sendJson(res, 200, { post });
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

  if (parsedUrl.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
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
    return sendJson(res, 200, { metrics, lastUploadName, perPlatform, dailyData: buildDailyData() });
  }

  if (parsedUrl.pathname === '/api/feedback/ai-suggestions' && req.method === 'POST') {
    const body = await parseBody(req);
    try {
      const result = await buildAiSuggestionsFromAnalytics(body);
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
        const parsed = JSON.parse(body || '{}');
        const files = Array.isArray(parsed) ? parsed : parsed.files || [parsed];
        if (!files.length) return sendJson(res, 400, { message: 'no files found' });

        let aggregatePosts = [];
        let counter = 0;
        const normalizationSummary = {
          gemini: 0,
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
              const normalized = await normalizeFileWithGemini(fileObj);
              if (normalized?.rows?.length) {
                parsedPosts = buildPostsFromNormalizedRows(normalized.rows, fileObj.filename, counter);
                normalizationSummary.gemini += 1;
              }
            } catch (geminiError) {
              normalizationSummary.errors.push({
                filename: fileObj.filename || 'file.csv',
                step: 'gemini',
                message: geminiError.message,
              });
              throw localError;
            }
          }

          counter += parsedPosts.length;
          aggregatePosts = aggregatePosts.concat(parsedPosts);
        }

        posts = aggregatePosts;
        lastUploadName = files.map((f) => f.filename || 'file.csv').join(', ');
        recalcMetrics();
        return sendJson(res, 200, {
          ok: true,
          count: posts.length,
          metrics,
          files: files.length,
          normalization: {
            provider: normalizationSummary.gemini ? 'gemini' : 'fallback',
            geminiFiles: normalizationSummary.gemini,
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

  if (serveStatic(req, res)) return;

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server running on http://localhost:${port}`));
