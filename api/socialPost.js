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

async function postToFacebookPage(pageId, pageToken, caption, mediaUrl) {
  if (mediaUrl && /\.(jpg|jpeg|png|gif|webp)$/i.test(mediaUrl)) {
    // Photo post
    const r = await graphPost(`/${pageId}/photos`, { url: mediaUrl, caption }, pageToken);
    if (r.data.error) throw new Error(`FB photo: ${r.data.error.message}`);
    return { platform: 'facebook_page', id: r.data.id };
  }
  if (mediaUrl && /\.(mp4|mov|avi)$/i.test(mediaUrl)) {
    // Video post
    const r = await graphPost(`/${pageId}/videos`, { file_url: mediaUrl, description: caption }, pageToken);
    if (r.data.error) throw new Error(`FB video: ${r.data.error.message}`);
    return { platform: 'facebook_page', id: r.data.id };
  }
  // Text / link post
  const params = { message: caption };
  if (mediaUrl) params.link = mediaUrl;
  const r = await graphPost(`/${pageId}/feed`, params, pageToken);
  if (r.data.error) throw new Error(`FB feed: ${r.data.error.message}`);
  return { platform: 'facebook_page', id: r.data.id };
}

async function postToInstagram(igUserId, pageToken, caption, mediaUrl) {
  if (!mediaUrl) throw new Error('Instagram requires an image or video URL.');

  const isVideo = /\.(mp4|mov)$/i.test(mediaUrl);
  const mediaParams = isVideo
    ? { video_url: mediaUrl, caption, media_type: 'REELS' }
    : { image_url: mediaUrl, caption };

  // Step 1: create media container
  const container = await graphPost(`/${igUserId}/media`, mediaParams, pageToken);
  if (container.data.error) throw new Error(`IG media container: ${container.data.error.message}`);
  const creationId = container.data.id;

  // Step 2: wait for processing (videos need longer)
  if (isVideo) {
    await new Promise((r) => setTimeout(r, 8000));
  }

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
  const { data, error } = await supabase
    .from('connected_accounts')
    .select('platform, account_id, access_token')
    .eq('user_email', userEmail)
    .in('platform', platformList);

  if (error) throw new Error(`Supabase lookup: ${error.message}`);
  return data || [];
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
    const results = await publishPost({ userEmail, content, mediaUrl, accounts });

    const hasSuccess = results.some((r) => r.status === 'published');
    await supabase.from('scheduled_posts').update({ status: hasSuccess ? 'published' : 'failed' }).eq('id', savedPost.id);

    for (const r of results) {
      await supabase.from('post_results').insert({
        post_id: savedPost.id,
        platform: r.platform,
        platform_post_id: r.platformPostId || null,
        status: r.status,
        error_message: r.error || null,
      }).catch(() => {});
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
        await supabase.from('post_results').insert({
          post_id: post.id,
          platform: r.platform,
          platform_post_id: r.platformPostId || null,
          status: r.status,
          error_message: r.error || null,
        }).catch(() => {});
      }
    } catch (err) {
      console.error(`[Scheduler] Failed post ${post.id}:`, err.message);
      await supabase.from('scheduled_posts').update({ status: 'failed' }).eq('id', post.id);
    }
  }
}

module.exports = { saveAndMaybePublish, runDuePosts, publishPost };
