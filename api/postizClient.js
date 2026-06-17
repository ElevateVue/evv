const DEFAULT_POSTIZ_API_BASE_URL = 'http://127.0.0.1:4007/api/public/v1';

const SUPPORTED_SOCIAL_CHANNELS = [
  'instagram',
  'instagram-standalone',
  'facebook',
  'linkedin',
  'linkedin-page',
  'x',
  'tiktok',
  'youtube',
  'threads',
  'pinterest',
  'gmb',
];

/**
 * @typedef {Object} PostizIntegration
 * @property {string} id
 * @property {string=} name
 * @property {string=} identifier
 * @property {string=} providerIdentifier
 * @property {string=} profile
 * @property {string=} picture
 * @property {boolean=} disabled
 * @property {{ id?: string, name?: string }=} customer
 */

/**
 * @typedef {Object} SocialAuthLink
 * @property {string} platform
 * @property {string} label
 * @property {string} connectUrl
 * @property {string=} integrationId
 * @property {boolean=} connected
 */

/**
 * @typedef {Object} SchedulePostData
 * @property {string} content
 * @property {string} publishDate
 * @property {string[]} integrationIds
 * @property {string[]=} mediaUrls
 */

function normalizePostizBaseUrl(value = process.env.POSTIZ_API_BASE_URL || DEFAULT_POSTIZ_API_BASE_URL) {
  let base = String(value || '').trim() || DEFAULT_POSTIZ_API_BASE_URL;
  if (base === 'http://127.0.0' || base === 'http://127.0.0.1' || base === 'http://localhost') {
    base = DEFAULT_POSTIZ_API_BASE_URL;
  }
  base = base.replace(/\/api\/v1\/?$/i, '/api/public/v1');
  return base.replace(/\/+$/, '');
}

function getPostizApiKey() {
  const key = String(process.env.POSTIZ_API_KEY || '').trim();
  if (!key) {
    throw new Error('POSTIZ_API_KEY is missing. Add it to API.env before calling Postiz.');
  }
  return key;
}

function buildUrl(endpoint, query = {}) {
  const base = normalizePostizBaseUrl();
  const path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  const url = new URL(`${base}${path}`);
  Object.entries(query || {}).forEach(([key, value]) => {
    if (value === undefined || value === null || value === '') return;
    url.searchParams.set(key, String(value));
  });
  return url;
}

async function parsePostizResponse(response) {
  const text = await response.text();
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

function errorMessageFromPayload(payload, fallback) {
  if (!payload) return fallback;
  if (typeof payload === 'string') return payload || fallback;
  return payload.msg || payload.message || payload.error || JSON.stringify(payload);
}

/**
 * Low-level Postiz request wrapper. It sends Bearer auth first, then retries once
 * with raw Authorization for self-hosted Postiz builds that reject Bearer tokens.
 *
 * @template T
 * @param {string} endpoint
 * @param {{ method?: string, query?: Record<string, unknown>, body?: unknown, retryRawAuth?: boolean }} options
 * @returns {Promise<T>}
 */
async function postizRequest(endpoint, options = {}) {
  const method = options.method || 'GET';
  const url = buildUrl(endpoint, options.query);
  const apiKey = getPostizApiKey();
  const body = options.body === undefined ? undefined : JSON.stringify(options.body);

  const requestOptions = (authorization) => ({
    method,
    headers: {
      Authorization: authorization,
      'Content-Type': 'application/json',
    },
    ...(body ? { body } : {}),
  });

  let response;
  try {
    response = await fetch(url, requestOptions(`Bearer ${apiKey}`));
  } catch (error) {
    console.error(`[Postiz] Connection failed: ${method} ${url.toString()} - ${error.message}`);
    throw new Error(`Postiz connection failed: ${error.message}`);
  }

  let payload = await parsePostizResponse(response);

  if (response.status === 401 && options.retryRawAuth !== false) {
    console.warn('[Postiz] Bearer auth was rejected. Retrying with raw Authorization for self-hosted compatibility.');
    response = await fetch(url, requestOptions(apiKey));
    payload = await parsePostizResponse(response);
  }

  if (!response.ok) {
    const message = errorMessageFromPayload(payload, response.statusText);
    console.error(`[Postiz] ${method} ${url.toString()} failed (${response.status}): ${message}`);
    throw new Error(message);
  }

  return /** @type {T} */ (payload);
}

function asArray(value, key) {
  if (Array.isArray(value)) return value;
  if (Array.isArray(value?.[key])) return value[key];
  if (Array.isArray(value?.data)) return value.data;
  if (Array.isArray(value?.items)) return value.items;
  if (Array.isArray(value?.posts)) return value.posts;
  return [];
}

function platformIdentifier(value = '') {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'twitter') return 'x';
  if (normalized === 'google business' || normalized === 'googlebusiness' || normalized === 'googlebusinessprofile') return 'gmb';
  if (normalized === 'linkedin page' || normalized === 'linkedinpage') return 'linkedin-page';
  return normalized.replace(/\s+/g, '');
}

function platformLabel(value = '') {
  const labels = {
    'instagram': 'Instagram',
    'instagram-standalone': 'Instagram',
    'facebook': 'Facebook',
    'linkedin': 'LinkedIn',
    'linkedin-page': 'LinkedIn Page',
    'x': 'X',
    'tiktok': 'TikTok',
    'youtube': 'YouTube',
    'threads': 'Threads',
    'pinterest': 'Pinterest',
    'gmb': 'Google Business',
  };
  const id = platformIdentifier(value);
  return labels[id] || String(value || 'Social').trim() || 'Social';
}

function settingsForPlatform(platform, mediaUrls = []) {
  const type = platformIdentifier(platform);
  if (type === 'instagram' || type === 'instagram-standalone') {
    return { __type: type, post_type: 'post', is_trial_reel: false, collaborators: [] };
  }
  if (type === 'x') return { __type: 'x', who_can_reply_post: 'everyone', community: '' };
  if (type === 'linkedin' || type === 'linkedin-page') return { __type: type, post_as_images_carousel: mediaUrls.length > 1 };
  if (type === 'facebook') return { __type: 'facebook' };
  if (type === 'youtube') return { __type: 'youtube', title: 'Scheduled video', type: 'public', selfDeclaredMadeForKids: 'no' };
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

function mediaItems(mediaUrls = []) {
  return mediaUrls.filter(Boolean).map((url, index) => ({
    id: `media-${index + 1}`,
    path: url,
  }));
}

/**
 * Fetch available connect links and connected integrations for Orbit's Connect UI.
 *
 * @returns {Promise<SocialAuthLink[]>}
 */
async function getSocialAuthLinks() {
  const integrations = asArray(await postizRequest('/integrations'), 'integrations');
  const connectedByPlatform = new Map();
  integrations.forEach((integration) => {
    const platform = platformIdentifier(integration.identifier || integration.providerIdentifier);
    if (platform) connectedByPlatform.set(platform, integration);
  });

  const platforms = Array.from(new Set([...SUPPORTED_SOCIAL_CHANNELS, ...connectedByPlatform.keys()]));
  const links = await Promise.all(platforms.map(async (platform) => {
    const integration = connectedByPlatform.get(platform);
    const response = await postizRequest(`/social/${encodeURIComponent(platform)}`, {
      query: integration?.id ? { refresh: integration.id } : {},
    }).catch((error) => {
      console.error(`[Postiz] OAuth link unavailable for ${platform}: ${error.message}`);
      return null;
    });

    return {
      platform,
      label: platformLabel(platform),
      connectUrl: response?.url || response?.connectUrl || response?.authUrl || '',
      integrationId: integration?.id,
      connected: Boolean(integration && !integration.disabled),
    };
  }));

  return links.filter((link) => link.connectUrl);
}

/**
 * Schedule an Orbit-composed social post into the Postiz background queue.
 *
 * @param {SchedulePostData} postData
 * @returns {Promise<unknown>}
 */
async function scheduleSocialPost(postData) {
  if (!postData?.content?.trim()) throw new Error('scheduleSocialPost requires postData.content.');
  if (!postData?.publishDate) throw new Error('scheduleSocialPost requires postData.publishDate.');
  if (!Array.isArray(postData.integrationIds) || !postData.integrationIds.length) {
    throw new Error('scheduleSocialPost requires at least one integration ID.');
  }

  const integrations = asArray(await postizRequest('/integrations'), 'integrations');
  const integrationsById = new Map(integrations.map((integration) => [integration.id, integration]));
  const images = mediaItems(postData.mediaUrls || []);

  const payload = {
    type: 'schedule',
    date: new Date(postData.publishDate).toISOString(),
    shortLink: false,
    tags: [],
    posts: postData.integrationIds.map((integrationId) => {
      const integration = integrationsById.get(integrationId);
      const platform = platformIdentifier(integration?.identifier || integration?.providerIdentifier || '');
      return {
        integration: { id: integrationId },
        value: [{ content: postData.content, image: images }],
        settings: settingsForPlatform(platform, postData.mediaUrls || []),
      };
    }),
  };

  return postizRequest('/posts', { method: 'POST', body: payload });
}

/**
 * Fetch posts for Orbit's custom content calendar.
 *
 * @param {Record<string, unknown>=} filters
 * @returns {Promise<unknown[]>}
 */
async function getScheduledCalendarPosts(filters = {}) {
  const now = new Date();
  const defaultStart = new Date(now.getTime() - 90 * 86400000).toISOString();
  const defaultEnd = new Date(now.getTime() + 365 * 86400000).toISOString();
  const query = {
    startDate: filters.startDate || filters.fromDate || defaultStart,
    endDate: filters.endDate || filters.toDate || defaultEnd,
    customer: filters.customer || filters.group || filters.customerId,
  };
  const response = await postizRequest('/posts', { query });
  return asArray(response, 'posts');
}

/**
 * Fetch analytics for one channel or aggregate analytics for all integrations.
 *
 * @param {string=} channelId
 * @param {string=} dateRange
 * @returns {Promise<unknown>}
 */
async function getSocialAnalytics(channelId, dateRange = '30') {
  if (channelId) {
    return postizRequest(`/analytics/${encodeURIComponent(channelId)}`, { query: { date: dateRange } });
  }

  const integrations = asArray(await postizRequest('/integrations'), 'integrations').filter((integration) => !integration.disabled);
  const analytics = {};
  for (const integration of integrations) {
    analytics[integration.id] = await postizRequest(`/analytics/${encodeURIComponent(integration.id)}`, {
      query: { date: dateRange },
    }).catch((error) => ({ error: error.message }));
  }
  return { integrations, analytics };
}

module.exports = {
  getSocialAuthLinks,
  scheduleSocialPost,
  getScheduledCalendarPosts,
  getSocialAnalytics,
  postizRequest,
  normalizePostizBaseUrl,
  platformIdentifier,
  platformLabel,
};
