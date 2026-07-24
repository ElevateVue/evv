const https = require('https');
const { config } = require('./config');
const { sleep } = require('./utils/sleep');

function requestJson(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          const parsed = raw ? JSON.parse(raw) : {};
          if (res.statusCode && res.statusCode >= 400) {
            return reject(new Error(parsed.error?.message || `Graph API request failed with status ${res.statusCode}`));
          }
          if (parsed.error) return reject(new Error(parsed.error.message || 'Graph API returned an error'));
          resolve(parsed);
        } catch (err) {
          reject(new Error(`Invalid Graph API response: ${raw.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function graphRequest({ path, method = 'POST', params = {}, accessToken }) {
  if (!accessToken) throw new Error('Meta access token is missing.');
  const body = new URLSearchParams({ ...params, access_token: accessToken }).toString();
  return requestJson({
    hostname: 'graph.facebook.com',
    path: `/${config.graphApiVersion}/${path.replace(/^\/+/, '')}`,
    method,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'Content-Length': Buffer.byteLength(body),
    },
  }, body);
}

function isPublicUrl(url) {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' &&
      !['localhost', '127.0.0.1'].includes(parsed.hostname) &&
      !parsed.hostname.match(/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./);
  } catch (_) {
    return false;
  }
}

function normalizeImageUrl(url) {
  if (url && url.includes('res.cloudinary.com')) {
    return url.replace('/image/upload/', '/image/upload/f_jpg,q_auto/');
  }
  return url;
}

async function publishFacebookPage(pageId, accessToken, { caption, mediaUrls = [], mediaType = 'image' }) {
  if (!pageId || !accessToken) throw new Error('Facebook page credentials are missing.');

  const publicMediaUrls = mediaUrls.filter(isPublicUrl);
  const firstUrl = publicMediaUrls[0] || '';
  if (!firstUrl) {
    return graphRequest({ path: `${pageId}/feed`, params: { message: caption || '' }, accessToken });
  }

  const normalizedType = String(mediaType || '').trim().toLowerCase();
  if (normalizedType === 'video' || normalizedType === 'reel' || /\.(mp4|mov|avi)$/i.test(firstUrl)) {
    return graphRequest({ path: `${pageId}/videos`, params: { file_url: firstUrl, description: caption || '' }, accessToken });
  }

  if (publicMediaUrls.length === 1) {
    return graphRequest({ path: `${pageId}/photos`, params: { url: firstUrl, caption: caption || '' }, accessToken });
  }

  const uploadedIds = [];
  for (const mediaUrl of publicMediaUrls) {
    const photo = await graphRequest({
      path: `${pageId}/photos`,
      params: { url: mediaUrl, published: 'false' },
      accessToken,
    });
    if (photo?.id) uploadedIds.push(photo.id);
  }

  if (!uploadedIds.length) throw new Error('Failed to upload Facebook images.');

  const feedParams = { message: caption || '' };
  uploadedIds.forEach((id, index) => {
    feedParams[`attached_media[${index}]`] = JSON.stringify({ media_fbid: id });
  });

  return graphRequest({ path: `${pageId}/feed`, params: feedParams, accessToken });
}

async function waitForInstagramContainer(creationId, accessToken, isVideo) {
  const maxWaitMs = isVideo ? 60000 : 30000;
  const deadline = Date.now() + maxWaitMs;
  let statusCode = 'IN_PROGRESS';

  while (Date.now() < deadline) {
    await sleep(3000);
    const status = await graphRequest({
      path: creationId,
      method: 'GET',
      params: { fields: 'status_code' },
      accessToken,
    });
    statusCode = status?.status_code || 'IN_PROGRESS';
    if (statusCode === 'FINISHED') return;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`Instagram container processing failed with status: ${statusCode}`);
    }
  }

  throw new Error('Instagram container did not finish processing in time.');
}

async function publishInstagram(igUserId, accessToken, { caption, mediaUrls = [], mediaType = 'image' }) {
  if (!igUserId || !accessToken) throw new Error('Instagram account credentials are missing.');

  const publicMediaUrls = mediaUrls.filter(isPublicUrl);
  if (!publicMediaUrls.length) throw new Error('Instagram publishing requires a publicly accessible media URL.');

  const normalizedType = String(mediaType || '').trim().toLowerCase();
  const isVideo = normalizedType === 'video' || normalizedType === 'reel' || /\.(mp4|mov)$/i.test(publicMediaUrls[0]);

  if (publicMediaUrls.length > 1 && !isVideo) {
    const childIds = [];
    for (const mediaUrl of publicMediaUrls) {
      const child = await graphRequest({
        path: `${igUserId}/media`,
        params: { image_url: normalizeImageUrl(mediaUrl), media_type: 'IMAGE', is_carousel_item: 'true' },
        accessToken,
      });
      if (!child?.id) throw new Error('Failed to create Instagram carousel media item.');
      childIds.push(child.id);
    }

    const container = await graphRequest({
      path: `${igUserId}/media`,
      params: { media_type: 'CAROUSEL', children: childIds.join(','), caption: caption || '' },
      accessToken,
    });
    await waitForInstagramContainer(container.id, accessToken, false);
    return graphRequest({ path: `${igUserId}/media_publish`, params: { creation_id: container.id }, accessToken });
  }

  const mediaUrl = isVideo ? publicMediaUrls[0] : normalizeImageUrl(publicMediaUrls[0]);
  const container = await graphRequest({
    path: `${igUserId}/media`,
    params: isVideo
      ? { media_type: 'REELS', video_url: mediaUrl, caption: caption || '' }
      : { media_type: 'IMAGE', image_url: mediaUrl, caption: caption || '' },
    accessToken,
  });

  await waitForInstagramContainer(container.id, accessToken, isVideo);
  return graphRequest({ path: `${igUserId}/media_publish`, params: { creation_id: container.id }, accessToken });
}

module.exports = { publishFacebookPage, publishInstagram };
