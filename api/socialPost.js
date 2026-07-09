const https = require('https');
const supabase = require('../lib/supabase');

// ── HTTP helpers ──────────────────────────────────────────────────────────────

function httpsRequest(options, body) {
  return new Promise((resolve, reject) => {
    const req = https.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve({ status: res.statusCode, data: JSON.parse(raw) }); }
        catch { resolve({ status: res.statusCode, data: raw }); }
      });
    });
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

function graphPost(path, params, token) {
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  return httpsRequest({
    hostname: 'graph.facebook.com',
    path: `/v19.0${path}?${qs}`,
    method: 'POST',
    headers: { 'Content-Length': 0 },
  });
}

function graphGet(path, params, token) {
  const qs = new URLSearchParams({ ...params, access_token: token }).toString();
  return new Promise((resolve, reject) => {
    https.get(`https://graph.facebook.com/v19.0${path}?${qs}`, (res) => {
      let raw = '';
      res.on('data', (c) => { raw += c; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Bad JSON: ${raw.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

// ── Platform post functions ───────────────────────────────────────────────────

function isPublicUrl(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !['localhost', '127.0.0.1'].includes(u.hostname) &&
      !u.hostname.match(/^(192\.168|10\.|172\.(1[6-9]|2\d|3[01]))\./);
  } catch { return false; }
}

async function postToFacebookPage(pageId, pageToken, caption, mediaUrl) {
  // Facebook servers can't reach localhost — strip local URLs and fall back to text-only
  const effectiveMedia = isPublicUrl(mediaUrl) ? mediaUrl : null;
  if (effectiveMedia && /\.(jpg|jpeg|png|gif|webp)$/i.test(effectiveMedia)) {
    // Photo post
    const r = await graphPost(`/${pageId}/photos`, { url: effectiveMedia, caption }, pageToken);
    if (r.data.error) throw new Error(`FB photo: ${r.data.error.message}`);
    return { platform: 'facebook_page', id: r.data.id };
  }
  if (effectiveMedia && /\.(mp4|mov|avi)$/i.test(effectiveMedia)) {
    // Video post
    const r = await graphPost(`/${pageId}/videos`, { file_url: effectiveMedia, description: caption }, pageToken);
    if (r.data.error) throw new Error(`FB video: ${r.data.error.message}`);
    return { platform: 'facebook_page', id: r.data.id };
  }
  // Text-only post (no media, or media was local/unreachable)
  const params = { message: caption };
  const r = await graphPost(`/${pageId}/feed`, params, pageToken);
  if (r.data.error) throw new Error(`FB feed: ${r.data.error.message}`);
  return { platform: 'facebook_page', id: r.data.id };
}

function toJpegUrl(url) {
  // Cloudinary: insert f_jpg,q_auto transformation to force JPEG output
  if (url && url.includes('res.cloudinary.com')) {
    return url.replace('/image/upload/', '/image/upload/f_jpg,q_auto/');
  }
  return url;
}

async function postToInstagram(igUserId, pageToken, caption, mediaUrl) {
  const effectiveMedia = isPublicUrl(mediaUrl) ? mediaUrl : null;
  if (!effectiveMedia) throw new Error('Instagram requires a publicly accessible image URL (localhost URLs cannot be used).');

  const isVideo = /\.(mp4|mov)$/i.test(effectiveMedia);
  // Instagram only accepts JPEG images — convert PNG/WebP via Cloudinary transformation
  const imageUrl = isVideo ? effectiveMedia : toJpegUrl(effectiveMedia);
  const mediaParams = isVideo
    ? { video_url: imageUrl, caption, media_type: 'REELS' }
    : { image_url: imageUrl, caption, media_type: 'IMAGE' };

  console.log('[Instagram] Posting image URL:', imageUrl);
  // Step 1: create media container
  const container = await graphPost(`/${igUserId}/media`, mediaParams, pageToken);
  if (container.data.error) throw new Error(`IG media container: ${container.data.error.message}`);
  const creationId = container.data.id;

  // Step 2: poll until container is FINISHED (max 30s)
  const maxWait = isVideo ? 60000 : 30000;
  const pollInterval = 3000;
  const deadline = Date.now() + maxWait;
  let statusCode = 'IN_PROGRESS';
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, pollInterval));
    const statusRes = await graphGet(`/${creationId}`, { fields: 'status_code' }, pageToken);
    statusCode = statusRes?.status_code || statusRes?.data?.status_code || 'IN_PROGRESS';
    console.log('[Instagram] Container status:', statusCode, '| raw:', JSON.stringify(statusRes).slice(0, 200));
    if (statusCode === 'FINISHED') break;
    if (statusCode === 'ERROR' || statusCode === 'EXPIRED') {
      throw new Error(`IG container processing failed with status: ${statusCode}`);
    }
  }
  if (statusCode !== 'FINISHED') throw new Error('IG container did not finish processing in time. Try again.');

  // Step 3: publish
  const publish = await graphPost(`/${igUserId}/media_publish`, { creation_id: creationId }, pageToken);
  if (publish.data.error) throw new Error(`IG publish: ${publish.data.error.message}`);
  return { platform: 'instagram', id: publish.data.id };
}

// ── Main publish function ─────────────────────────────────────────────────────

// accounts: [{ platform, account_id, access_token }]
async function publishPost({ userEmail, content, mediaUrl, accounts }) {
  const results = [];

  for (const acct of accounts) {
    try {
      let result;
      if (acct.platform === 'facebook_page') {
        result = await postToFacebookPage(acct.account_id, acct.access_token, content, mediaUrl);
      } else if (acct.platform === 'instagram') {
        result = await postToInstagram(acct.account_id, acct.access_token, content, mediaUrl);
      } else if (acct.platform === 'facebook') {
        // Personal profile (limited — prefer pages)
        result = await postToFacebookPage(acct.account_id, acct.access_token, content, mediaUrl);
      } else {
        results.push({ platform: acct.platform, status: 'skipped', error: 'Platform not yet supported for direct posting' });
        continue;
      }
      results.push({ platform: acct.platform, status: 'published', platformPostId: result.id });
    } catch (err) {
      console.error(`[socialPost] ${acct.platform} error:`, err.message);
      results.push({ platform: acct.platform, status: 'error', error: err.message });
    }
  }

  return results;
}

// ── Fetch connected accounts for a user from Supabase ────────────────────────

async function getAccountsForUser(userEmail, platformList) {
  const normalizedEmail = String(userEmail || '').trim().toLowerCase();
  // When user selects 'facebook', also fetch 'facebook_page' — page tokens are required for posting
  const expanded = [...new Set([
    ...platformList,
    ...(platformList.includes('facebook') ? ['facebook_page'] : []),
  ])];

  const { data, error } = await supabase
    .from('connected_accounts')
    .select('platform, account_id, access_token, account_name')
    .eq('user_email', normalizedEmail)
    .in('platform', expanded);

  if (error) throw new Error(`Supabase lookup: ${error.message}`);

  // Prefer facebook_page accounts over personal facebook for posting
  const accounts = data || [];
  const hasPages = accounts.some((a) => a.platform === 'facebook_page');
  if (hasPages) return accounts.filter((a) => a.platform !== 'facebook');
  return accounts;
}

// ── Save scheduled post to Supabase + optionally publish now ─────────────────

async function saveAndMaybePublish({ userEmail, content, mediaUrl, platforms, scheduledAt }) {
  const isNow = !scheduledAt || new Date(scheduledAt) <= new Date(Date.now() + 60000);

  const { data: savedPost, error: insertErr } = await supabase
    .from('scheduled_posts')
    .insert({
      user_email: userEmail,
      content,
      media_urls: mediaUrl ? [mediaUrl] : [],
      platforms,
      scheduled_at: scheduledAt || new Date().toISOString(),
      status: isNow ? 'publishing' : 'pending',
    })
    .select()
    .single();

  if (insertErr) throw new Error(`Save post: ${insertErr.message}`);

  if (isNow) {
    const accounts = await getAccountsForUser(userEmail, platforms.map((p) => p.toLowerCase()));
    console.log(`[socialPost] Publishing for ${userEmail}, found ${accounts.length} accounts:`, accounts.map((a) => `${a.platform}:${a.account_id}`));
    if (!accounts.length) {
      await supabase.from('scheduled_posts').update({ status: 'failed' }).eq('id', savedPost.id);
      throw new Error('No connected accounts found for the selected platforms. Please reconnect from the Connect page.');
    }
    const results = await publishPost({ userEmail, content, mediaUrl, accounts });

    const hasSuccess = results.some((r) => r.status === 'published');
    await supabase.from('scheduled_posts').update({ status: hasSuccess ? 'published' : 'failed' }).eq('id', savedPost.id);

    for (const r of results) {
      try {
        await supabase.from('post_results').insert({
          post_id: savedPost.id,
          platform: r.platform,
          platform_post_id: r.platformPostId || null,
          status: r.status,
          error_message: r.error || null,
        });
      } catch (_) {}
    }

    return { post: savedPost, results };
  }

  return { post: savedPost, results: [], scheduled: true };
}

// ── Scheduler: run due posts (call this on an interval) ───────────────────────

async function runDuePosts() {
  const now = new Date().toISOString();
  const { data: duePosts } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', now);

  if (!duePosts || !duePosts.length) return;

  for (const post of duePosts) {
    console.log(`[Scheduler] Running post ${post.id} for ${post.user_email}`);
    await supabase.from('scheduled_posts').update({ status: 'publishing' }).eq('id', post.id);

    try {
      const accounts = await getAccountsForUser(post.user_email, (post.platforms || []).map((p) => p.toLowerCase()));
      const results = await publishPost({
        userEmail: post.user_email,
        content: post.content,
        mediaUrl: (post.media_urls || [])[0] || '',
        accounts,
      });

      const hasSuccess = results.some((r) => r.status === 'published');
      await supabase.from('scheduled_posts').update({ status: hasSuccess ? 'published' : 'failed' }).eq('id', post.id);

      for (const r of results) {
        try {
          await supabase.from('post_results').insert({
            post_id: post.id,
            platform: r.platform,
            platform_post_id: r.platformPostId || null,
            status: r.status,
            error_message: r.error || null,
          });
        } catch (_) {}
      }
    } catch (err) {
      console.error(`[Scheduler] Failed post ${post.id}:`, err.message);
      await supabase.from('scheduled_posts').update({ status: 'failed' }).eq('id', post.id);
    }
  }
}

module.exports = { saveAndMaybePublish, runDuePosts, publishPost };
