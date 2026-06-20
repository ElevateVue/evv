const https = require('https');
const supabase = require('../lib/supabase');

const META_APP_ID = process.env.FACEBOOK_META_APP_ID || '';
const META_APP_SECRET = process.env.FACEBOOK_META_APP_SECRET || process.env.INSTAGRAM_APP_SECRET || '';

function getBaseUrl(req) {
  const proto = req.headers['x-forwarded-proto'] || 'http';
  const host = req.headers['x-forwarded-host'] || req.headers.host || 'localhost:3000';
  return `${proto}://${host}`;
}

function httpsGet(url) {
  return new Promise((resolve, reject) => {
    https.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(raw)); }
        catch { reject(new Error(`Invalid JSON response: ${raw.slice(0, 200)}`)); }
      });
    }).on('error', reject);
  });
}

// ── ROUTE HANDLERS ────────────────────────────────────────────────────────────

// GET /auth/facebook  — redirects user to Facebook login
async function handleFacebookConnect(req, res, getSession) {
  if (!META_APP_ID) {
    res.writeHead(302, { Location: '/connect.html?error=' + encodeURIComponent('Facebook App ID not configured') });
    return res.end();
  }

  const session = getSession(req);
  if (!session) {
    res.writeHead(302, { Location: '/landing.html' });
    return res.end();
  }

  const baseUrl = getBaseUrl(req);
  const redirectUri = encodeURIComponent(`${baseUrl}/auth/facebook/callback`);
  const scope = [
    'pages_show_list',
    'pages_read_engagement',
    'pages_manage_posts',
    'instagram_basic',
    'instagram_content_publish',
    'instagram_manage_insights',
  ].join(',');

  // Store email in state so we know who is connecting after redirect
  const state = encodeURIComponent(Buffer.from(JSON.stringify({ email: session.user.email })).toString('base64'));
  const url = `https://www.facebook.com/v19.0/dialog/oauth?client_id=${META_APP_ID}&redirect_uri=${redirectUri}&scope=${scope}&state=${state}&response_type=code`;

  res.writeHead(302, { Location: url });
  res.end();
}

// GET /auth/facebook/callback  — Facebook redirects here after user approves
async function handleFacebookCallback(req, res, sessions, sendJson) {
  const urlObj = new URL(req.url, 'http://localhost');
  const code = urlObj.searchParams.get('code');
  const state = urlObj.searchParams.get('state');
  const error = urlObj.searchParams.get('error');
  const errorDesc = urlObj.searchParams.get('error_description');

  if (error) {
    const msg = errorDesc || error;
    res.writeHead(302, { Location: '/connect.html?error=' + encodeURIComponent(msg) });
    return res.end();
  }

  if (!code) {
    res.writeHead(302, { Location: '/connect.html?error=No+authorization+code+received' });
    return res.end();
  }

  // Decode state to get user email
  let userEmail = '';
  try {
    const decoded = JSON.parse(Buffer.from(decodeURIComponent(state), 'base64').toString('utf8'));
    userEmail = decoded.email || '';
  } catch {
    res.writeHead(302, { Location: '/connect.html?error=Invalid+state+parameter' });
    return res.end();
  }

  if (!userEmail) {
    res.writeHead(302, { Location: '/connect.html?error=Session+expired.+Please+log+in+again.' });
    return res.end();
  }

  const baseUrl = getBaseUrl(req);
  const redirectUri = encodeURIComponent(`${baseUrl}/auth/facebook/callback`);

  try {
    // Exchange code for short-lived token
    const tokenUrl = `https://graph.facebook.com/v19.0/oauth/access_token?client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&redirect_uri=${redirectUri}&code=${code}`;
    const tokenData = await httpsGet(tokenUrl);
    if (tokenData.error) throw new Error(tokenData.error.message);

    // Upgrade to long-lived token (60 days)
    const longLivedUrl = `https://graph.facebook.com/v19.0/oauth/access_token?grant_type=fb_exchange_token&client_id=${META_APP_ID}&client_secret=${META_APP_SECRET}&fb_exchange_token=${tokenData.access_token}`;
    const longLivedData = await httpsGet(longLivedUrl);
    const longToken = longLivedData.access_token || tokenData.access_token;
    const expiresIn = longLivedData.expires_in || 5184000;
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Get the Facebook user's name
    const userInfo = await httpsGet(`https://graph.facebook.com/me?fields=id,name&access_token=${longToken}`);

    // Get pages this user manages
    const pagesData = await httpsGet(`https://graph.facebook.com/v19.0/me/accounts?access_token=${longToken}`);
    const pages = Array.isArray(pagesData.data) ? pagesData.data : [];

    // Save the base Facebook account
    await supabase.from('connected_accounts').upsert({
      user_email: userEmail,
      platform: 'facebook',
      account_name: userInfo.name || 'Facebook User',
      account_id: userInfo.id,
      access_token: longToken,
      expires_at: expiresAt,
    }, { onConflict: 'user_email,platform,account_id' });

    // Save each Facebook Page + linked Instagram Business account
    for (const page of pages) {
      await supabase.from('connected_accounts').upsert({
        user_email: userEmail,
        platform: 'facebook_page',
        account_name: page.name,
        account_id: page.id,
        access_token: page.access_token,
        expires_at: null,
      }, { onConflict: 'user_email,platform,account_id' });

      // Check if this Facebook Page has a linked Instagram Business account
      const igData = await httpsGet(
        `https://graph.facebook.com/v19.0/${page.id}?fields=instagram_business_account&access_token=${page.access_token}`
      ).catch(() => ({}));

      const igId = igData?.instagram_business_account?.id;
      if (igId) {
        const igInfo = await httpsGet(
          `https://graph.facebook.com/v19.0/${igId}?fields=id,name,username&access_token=${page.access_token}`
        ).catch(() => ({}));

        await supabase.from('connected_accounts').upsert({
          user_email: userEmail,
          platform: 'instagram',
          account_name: igInfo.username ? `@${igInfo.username}` : (igInfo.name || 'Instagram'),
          account_id: igId,
          access_token: page.access_token,
          expires_at: null,
        }, { onConflict: 'user_email,platform,account_id' });
      }
    }

    const connectedName = encodeURIComponent(userInfo.name || 'Facebook');
    res.writeHead(302, { Location: `/connect.html?connected=facebook&name=${connectedName}` });
    res.end();
  } catch (err) {
    console.error('[Facebook OAuth]', err.message);
    res.writeHead(302, { Location: '/connect.html?error=' + encodeURIComponent(err.message) });
    res.end();
  }
}

// GET /api/social/accounts  — returns all connected accounts for logged-in user
async function handleGetAccounts(req, res, getSession, sendJson) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: 'Not authenticated' });

  const { data, error } = await supabase
    .from('connected_accounts')
    .select('id, platform, account_name, account_id, expires_at, created_at')
    .eq('user_email', session.user.email);

  if (error) return sendJson(res, 500, { error: error.message });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ accounts: data || [] }));
}

// DELETE /api/social/accounts/:id  — disconnects an account
async function handleDeleteAccount(req, res, getSession, sendJson) {
  const session = getSession(req);
  if (!session) return sendJson(res, 401, { error: 'Not authenticated' });

  const id = req.url.split('/').pop();
  const { error } = await supabase
    .from('connected_accounts')
    .delete()
    .eq('id', id)
    .eq('user_email', session.user.email);

  if (error) return sendJson(res, 500, { error: error.message });
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ success: true }));
}

module.exports = {
  handleFacebookConnect,
  handleFacebookCallback,
  handleGetAccounts,
  handleDeleteAccount,
};
