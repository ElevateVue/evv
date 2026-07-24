const supabase = require('../lib/supabase');

function normalizePlatforms(platforms) {
  return (Array.isArray(platforms) ? platforms : [])
    .map((platform) => String(platform || '').trim().toLowerCase())
    .filter(Boolean);
}

async function getAccountsForUser(userEmail, platformList) {
  const normalizedEmail = String(userEmail || '').trim().toLowerCase();
  const normalizedPlatforms = normalizePlatforms(platformList);
  const expanded = [...new Set([
    ...normalizedPlatforms,
    ...(normalizedPlatforms.includes('facebook') ? ['facebook_page'] : []),
  ])];

  if (!normalizedEmail || !expanded.length) return [];

  const { data, error } = await supabase
    .from('connected_accounts')
    .select('platform, account_id, access_token, account_name')
    .eq('user_email', normalizedEmail)
    .in('platform', expanded);

  if (error) throw new Error(`Supabase lookup: ${error.message}`);

  const accounts = data || [];
  const hasPages = accounts.some((account) => account.platform === 'facebook_page');
  return hasPages ? accounts.filter((account) => account.platform !== 'facebook') : accounts;
}

async function saveAndMaybePublish({ userEmail, content, mediaUrl, platforms, scheduledAt }) {
  const scheduledFor = scheduledAt || new Date().toISOString();

  const { data: savedPost, error: insertErr } = await supabase
    .from('scheduled_posts')
    .insert({
      user_email: userEmail,
      content,
      media_urls: mediaUrl ? [mediaUrl] : [],
      platforms: normalizePlatforms(platforms),
      scheduled_at: scheduledFor,
      status: 'pending',
    })
    .select()
    .single();

  if (insertErr) throw new Error(`Save post: ${insertErr.message}`);

  return { post: savedPost, results: [], scheduled: true };
}

module.exports = { getAccountsForUser, saveAndMaybePublish };
