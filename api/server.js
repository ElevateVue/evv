const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { google } = require('googleapis');
const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

const rootEnvPath = path.join(__dirname, '..', 'API.env');
if (fs.existsSync(rootEnvPath)) {
  require('dotenv').config({ path: rootEnvPath, override: true });
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
};

const staticDir = path.join(__dirname, '..', 'public');
const sessionsFile = path.join(__dirname, 'sessions.json');
const clientHubFile = path.join(__dirname, 'client-hub-records.json');
const newsletterSubscribersFile = path.join(__dirname, 'newsletter-subscribers.json');
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

let sessions = loadSessions();
let clientHubRecords = loadClientHubRecords();
let newsletterSubscribers = loadNewsletterSubscribers();
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

function normalizeCsvComparisonRows(fileObj = {}) {
  const { filename, csv } = fileObj;
  const parsed = parseCsvTable(csv || '');
  const headers = parsed.headers || [];
  const rows = parsed.rows || [];
  const keyMap = headers.reduce((acc, header, index) => {
    acc[normalizeKey(header)] = index;
    return acc;
  }, {});

  return rows.map((row, index) => ({
    id: `cmp-${index + 1}`,
    platform: getRowValue(row, keyMap, ['platform', 'Platform', 'Network']) || platformFromFilename(filename),
    title: getRowValue(row, keyMap, ['title', 'Title', 'post title', 'content']) || `Row ${index + 1}`,
    reach: coerceNumber(getRowValue(row, keyMap, ['reach', 'impressions', 'views', 'reach/impressions'])),
    interactions: coerceNumber(getRowValue(row, keyMap, ['interactions', 'engagements', 'total interactions', 'total engagements'])),
    clicks: coerceNumber(getRowValue(row, keyMap, ['clicks', 'link clicks', 'profile visits', 'ctr'])),
    reactions: coerceNumber(getRowValue(row, keyMap, ['reactions', 'likes', 'love', 'thumbs up'])),
    follows: coerceNumber(getRowValue(row, keyMap, ['follows', 'followers', 'new followers'])),
    postedAt: parsePostedAt(getRowValue(row, keyMap, ['postedAt', 'Posted At', 'date', 'Date', 'timestamp'])),
  }));
}

function summarizeComparisonPosts(posts = []) {
  const totals = {
    totalRows: posts.length,
    totalReach: 0,
    totalInteractions: 0,
    totalClicks: 0,
    totalReactions: 0,
    totalFollows: 0,
    tops: [],
    byPlatform: {},
  };

  posts.forEach((post) => {
    const platform = post.platform || 'Unknown';
    totals.totalReach += post.reach || 0;
    totals.totalInteractions += post.interactions || 0;
    totals.totalClicks += post.clicks || 0;
    totals.totalReactions += post.reactions || 0;
    totals.totalFollows += post.follows || 0;

    if (!totals.byPlatform[platform]) {
      totals.byPlatform[platform] = {
        count: 0,
        reach: 0,
        interactions: 0,
        clicks: 0,
        reactions: 0,
        follows: 0,
      };
    }

    totals.byPlatform[platform].count += 1;
    totals.byPlatform[platform].reach += post.reach || 0;
    totals.byPlatform[platform].interactions += post.interactions || 0;
    totals.byPlatform[platform].clicks += post.clicks || 0;
    totals.byPlatform[platform].reactions += post.reactions || 0;
    totals.byPlatform[platform].follows += post.follows || 0;
  });

  totals.tops = posts
    .slice()
    .sort((a, b) => (b.reach || 0) - (a.reach || 0))
    .slice(0, 3)
    .map((post) => ({ title: post.title, platform: post.platform, reach: post.reach, interactions: post.interactions }));

  totals.averageReach = totals.totalRows ? Number((totals.totalReach / totals.totalRows).toFixed(2)) : 0;
  totals.averageInteractions = totals.totalRows ? Number((totals.totalInteractions / totals.totalRows).toFixed(2)) : 0;
  totals.averageClicks = totals.totalRows ? Number((totals.totalClicks / totals.totalRows).toFixed(2)) : 0;
  totals.averageReactions = totals.totalRows ? Number((totals.totalReactions / totals.totalRows).toFixed(2)) : 0;
  totals.averageFollows = totals.totalRows ? Number((totals.totalFollows / totals.totalRows).toFixed(2)) : 0;

  return totals;
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
  return {
    platform,
    scores,
    overallScore: Object.values(scores).reduce((sum, score) => sum + score, 0) * 2,
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
  return {
    provider: 'local-fallback',
    caption: `A clear ${postType || 'post'} for ${platform || 'Instagram'}: ${subject}.\n\nKeep the message focused, show the value fast, and end with one simple action your audience can take today.`,
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
  return {
    provider: 'local-fallback',
    hooks: [
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
    ].slice(0, safeCount),
  };
}

function fallbackIdeas({ industry, platform, goal, count }) {
  const safeIndustry = cleanAiText(industry || 'your niche');
  const safeGoal = cleanAiText(goal || 'engagement');
  const safeCount = Math.min(20, Math.max(6, Number(count) || 10));
  return {
    provider: 'local-fallback',
    ideas: Array.from({ length: safeCount }, (_, index) => ({
      title: `${safeIndustry} idea ${index + 1}`,
      description: `Create a ${platform || 'social'} post that supports ${safeGoal.toLowerCase()} by showing one audience problem, one useful insight, and one clear next step.`,
    })),
  };
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
    const fallback = buildLocalAiSuggestions();
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

const getSession = (req) => {
  const cookies = parseCookies(req);
  if (!cookies.session) return null;
  return sessions.find((s) => s.token === cookies.session) || null;
};

const isAuthenticated = (req) => {
  return Boolean(getSession(req));
};

function getUserIdentity(user = {}) {
  const email = String(user?.email || '').trim().toLowerCase();
  return email;
}

function listClientHubRecords() {
  return Object.values(clientHubRecords).sort((a, b) => (b.lastActive || 0) - (a.lastActive || 0));
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
  const role = String(payload.role || sessionUser.role || existing.role || 'client').trim();
  const view = String(payload.view || sessionUser.view || existing.view || 'client').trim();
  const accountType = String(payload.accountType || sessionUser.accountType || existing.accountType || 'individual').trim();
  const companyName = String(payload.companyName || sessionUser.companyName || existing.companyName || '').trim();

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
  };

  clientHubRecords[identity] = nextRecord;
  saveClientHubRecords(clientHubRecords);
  return nextRecord;
}

const PUBLIC_ROUTES = new Set(['/landing.html', '/login.html', '/signin.html']);
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

  const parsedUrl = new URL(req.url, `http://${req.headers.host}`);

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
    const user = {
      name: resolvedName,
      email: normalizedEmail,
      firstName: resolvedFirstName,
      lastName: resolvedLastName,
      accountType: String(accountType || existingRecord.accountType || 'individual').trim(),
      companyName: resolvedCompanyName,
      role: String(role || existingRecord.role || 'client').trim(),
      view: String(view || existingRecord.view || 'client').trim(),
      createdAt: Date.now(),
    };
    sessions.push({ token, user, createdAt: Date.now() });
    saveSessions(sessions);
    return sendJson(res, 200, { token, user });
  }

  // All API routes except login and health require a valid session
  if (req.url.startsWith('/api') && req.url !== '/api/login' && !PUBLIC_API_ROUTES.has(req.url.split('?')[0])) {
    if (!isAuthenticated(req)) return sendJson(res, 401, { message: 'Unauthorized' });
  }

  if (req.url === '/api/posts' && req.method === 'GET') {
    return sendJson(res, 200, { posts });
  }

  if (req.url === '/api/posts' && req.method === 'POST') {
    const { platform, title, transcript, postType, scheduledAt, mediaName, mediaType, mediaData } = await parseBody(req);
    if (!platform || !title) return sendJson(res, 400, { message: 'platform and title required' });
    const scheduledTs = scheduledAt ? Date.parse(String(scheduledAt)) : null;
    const post = {
      id: 'p' + (posts.length + 1),
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
    posts.unshift(post);
    return sendJson(res, 201, { post });
  }

  // AI generation endpoints for Content Lab
  if (parsedUrl.pathname === '/api/generate/caption' && req.method === 'POST') {
    try {
      const { topic, title, platform, postType, length } = await parseBody(req);
      const safeTopic = String(topic || title || 'No topic').trim();
      const safePlatform = String(platform || 'Instagram').trim();
      const safePostType = String(postType || 'image').trim();
      const safeLength = String(length || 'short').trim();

      const prompt = [
        'You are an expert social media copywriter.',
        'Generate one high-quality caption optimized for the target platform and post type.',
        'Return JSON only in this exact shape:',
        '{"caption":"string","hashtags":["string","string"]}',
        'Rules:',
        '- Keep the caption concise and engaging.',
        '- Use appropriate tone and emojis for the platform (do not overuse).',
        '- Provide up to 6 relevant hashtags in an array.',
        '- Do not include any markdown or backticks.',
      ].join('\n');

      const input = `Topic: ${safeTopic}\nPlatform: ${safePlatform}\nPostType: ${safePostType}\nLength: ${safeLength}`;
      const providers = ['gemini', 'deepseek'];
      const raw = await callAiJsonSequence(providers, prompt, input, 'AI returned an invalid caption payload');
      return sendJson(res, 200, { provider: raw.provider || 'gemini', caption: raw.caption || raw.text || '', hashtags: raw.hashtags || raw.tags || [] });
    } catch (err) {
      const fallback = fallbackCaption({});
      return sendJson(res, 200, { ...fallback, notice: buildContentAiErrorMessage(err, 'Caption Generator') });
    }
  }

  if (parsedUrl.pathname === '/api/generate/ghost' && req.method === 'POST') {
    try {
      const { topic, platform, tone, length, audience, keyPoints } = await parseBody(req);
      const safeTopic = String(topic || '').trim();
      const safePlatform = String(platform || 'LinkedIn').trim();
      const safeTone = String(tone || 'Professional').trim();
      const safeLength = String(length || 'medium').trim();
      const safeAudience = String(audience || '').trim();
      const safeKeyPoints = Array.isArray(keyPoints) ? keyPoints.join(', ') : String(keyPoints || '').trim();

      const prompt = [
        'You are a professional long-form writer and marketing strategist.',
        'Write a complete piece based on the inputs. Highlight how this piece differentiates from competitors and cover the requested key points.',
        'Return JSON only in this exact shape:',
        '{"content":"string","differentiation":"string","keyPointsCovered":["string"]}',
        'Rules:',
        '- Produce clear headings and well-structured paragraphs.',
        '- Mention competitor-differentiation in the differentiation field.',
        '- Ensure keyPointsCovered is an array listing the key points covered.',
      ].join('\n');

      const input = `Topic: ${safeTopic}\nPlatform: ${safePlatform}\nTone: ${safeTone}\nLength: ${safeLength}\nAudience: ${safeAudience}\nKeyPoints: ${safeKeyPoints}`;
      const providers = ['gemini', 'deepseek'];
      const raw = await callAiJsonSequence(providers, prompt, input, 'AI returned an invalid ghost-writing payload');
      return sendJson(res, 200, { provider: raw.provider || 'gemini', content: raw.content || raw.article || '', differentiation: raw.differentiation || '', keyPointsCovered: raw.keyPointsCovered || raw.keyPoints || [] });
    } catch (err) {
      const fallback = fallbackGhost({});
      return sendJson(res, 200, { ...fallback, notice: buildContentAiErrorMessage(err, 'Ghost Writer') });
    }
  }

  if (parsedUrl.pathname === '/api/generate/hooks' && req.method === 'POST') {
    try {
      const { topic, tone, platform, count } = await parseBody(req);
      const safeTopic = String(topic || '').trim();
      const safeTone = String(tone || 'Curiosity').trim();
      const safePlatform = String(platform || 'Instagram').trim();
      const safeCount = Math.min(12, Math.max(4, Number(count) || 8));

      const prompt = [
        'You are a creative marketing copywriter who writes short social hooks.',
        `Generate ${safeCount} unique short hooks optimized for the platform and tone.`,
        'Return JSON only in this exact shape:',
        '{"hooks":["string","string"]}',
        'Rules:',
        '- Keep each hook under 12 words.',
        '- Make hooks punchy, curiosity-driven or emotional depending on tone.',
      ].join('\n');

      const input = `Topic: ${safeTopic}\nTone: ${safeTone}\nPlatform: ${safePlatform}\nCount: ${safeCount}`;
      const providers = ['gemini', 'deepseek'];
      const raw = await callAiJsonSequence(providers, prompt, input, 'AI returned an invalid hooks payload');
      return sendJson(res, 200, { provider: raw.provider || 'gemini', hooks: raw.hooks || raw.list || [] });
    } catch (err) {
      const fallback = fallbackHooks({});
      return sendJson(res, 200, { ...fallback, notice: buildContentAiErrorMessage(err, 'Hook Library') });
    }
  }

  if (parsedUrl.pathname === '/api/generate/ideas' && req.method === 'POST') {
    try {
      const { industry, platform, goal, count } = await parseBody(req);
      const safeIndustry = String(industry || '').trim();
      const safePlatform = String(platform || 'Instagram').trim();
      const safeGoal = String(goal || 'More Engagement').trim();
      const safeCount = Math.min(20, Math.max(6, Number(count) || 10));

      const prompt = [
        'You are a senior social media strategist generating actionable content ideas.',
        `Produce ${safeCount} creative content ideas tailored to the industry, platform, and goal.`,
        'Return JSON only in this exact shape:',
        '{"ideas":[{"title":"string","description":"string"}]}',
        'Rules:',
        '- Each idea should be concise and include a short execution note in description.',
      ].join('\n');

      const input = `Industry: ${safeIndustry}\nPlatform: ${safePlatform}\nGoal: ${safeGoal}\nCount: ${safeCount}`;
      const providers = ['gemini', 'deepseek'];
      const raw = await callAiJsonSequence(providers, prompt, input, 'AI returned an invalid ideas payload');
      return sendJson(res, 200, { provider: raw.provider || 'gemini', ideas: raw.ideas || raw.list || [] });
    } catch (err) {
      const fallback = fallbackIdeas({});
      return sendJson(res, 200, { ...fallback, notice: buildContentAiErrorMessage(err, 'Drop Ideas') });
    }
  }

  if (parsedUrl.pathname === '/api/compare-metrics' && req.method === 'POST') {
    try {
      const { platform, fileOne, fileTwo } = await parseBody(req);
      if (!platform || !fileOne || !fileTwo) {
        return sendJson(res, 400, { message: 'Platform and both CSV files are required.' });
      }

      const fileOneRows = normalizeCsvComparisonRows({ filename: `${platform}-one.csv`, csv: fileOne });
      const fileTwoRows = normalizeCsvComparisonRows({ filename: `${platform}-two.csv`, csv: fileTwo });

      const fileOneSummary = summarizeComparisonPosts(fileOneRows);
      const fileTwoSummary = summarizeComparisonPosts(fileTwoRows);

      const prompt = [
        'You are an analytics consultant skilled at comparing social media reporting exports.',
        'Compare the two CSV summaries and explain the main differences, strengths, weaknesses, and recommendations for the next campaign.',
        'Return JSON only in this exact shape:',
        '{"strengths":["string"],"weaknesses":["string"],"recommendations":["string"]}',
        'Rules:',
        '- Focus on the platform and file comparison context.',
        '- Mention which file is stronger on reach, engagement, clicks, and audience growth.',
        '- Provide at least 3 strengths and 3 weaknesses, plus 3 practical recommendations.',
        '- Do not include markdown, backticks, or extra wrappers in the values.',
      ].join('\n');

      const input = `Platform: ${platform}\nFile One Summary: ${JSON.stringify(fileOneSummary)}\nFile Two Summary: ${JSON.stringify(fileTwoSummary)}`;
      const providers = ['deepseek', 'gemini'];
      const raw = await callAiJsonSequence(providers, prompt, input, 'AI returned an invalid comparison payload');

      return sendJson(res, 200, {
        fileOneSummary,
        fileTwoSummary,
        strengths: raw.strengths || raw.strongPoints || raw.strength || [],
        weaknesses: raw.weaknesses || raw.weakness || raw.weakPoints || [],
        recommendations: raw.recommendations || raw.nextSteps || raw.actionItems || [],
      });
    } catch (err) {
      return sendJson(res, 500, { message: err.message || 'Failed to compare metrics' });
    }
  }

  if (req.url.startsWith('/api/posts/') && req.url.endsWith('/publish') && req.method === 'POST') {
    const id = req.url.split('/')[3];
    const post = posts.find((p) => p.id === id);
    if (!post) return sendJson(res, 404, { message: 'not found' });
    post.status = 'posted';
    post.postedAt = Date.now();
    return sendJson(res, 200, { post });
  }

  if (parsedUrl.pathname === '/api/health') {
    return sendJson(res, 200, { ok: true, time: new Date().toISOString() });
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
    return sendJson(res, 200, { clients: listClientHubRecords() });
  }

  if (parsedUrl.pathname === '/api/client-hub/track' && req.method === 'POST') {
    const session = getSession(req);
    if (!session?.user?.email) return sendJson(res, 401, { message: 'Unauthorized' });
    const payload = await parseBody(req);
    const record = upsertClientHubRecord(session.user, payload);
    return sendJson(res, 200, { ok: true, client: record });
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
                parsedPosts = buildPostsFromNormalizedRows(normalized.rows, fileObj.filename, counter);
                if (normalized.provider === 'gemini') normalizationSummary.gemini += 1;
                if (normalized.provider === 'deepseek') normalizationSummary.deepseek += 1;
              }
            } catch (aiError) {
              normalizationSummary.errors.push({
                filename: fileObj.filename || 'file.csv',
                step: 'ai',
                message: aiError.message,
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

  if (serveStatic(req, res)) return;

  res.writeHead(404, { 'Content-Type': 'text/plain' });
  res.end('Not found');
});

const port = process.env.PORT || 3000;
server.listen(port, () => console.log(`Server running on http://localhost:${port}`));
