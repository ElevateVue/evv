const { createClient } = require('@supabase/supabase-js');
const { config } = require('./config');

const supabase = createClient(config.supabaseUrl, config.supabaseKey, {
  auth: { persistSession: false },
});

async function claimPost(postId) {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .update({ status: 'publishing' })
    .eq('id', postId)
    .eq('status', 'pending')
    .select()
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Claim post ${postId}: ${error.message}`);
  }

  return data;
}

async function getDuePosts(limit) {
  const { data, error } = await supabase
    .from('scheduled_posts')
    .select('*')
    .eq('status', 'pending')
    .lte('scheduled_at', new Date().toISOString())
    .order('scheduled_at', { ascending: true })
    .limit(limit);

  if (error) throw new Error(`Fetch due posts: ${error.message}`);
  return data || [];
}

async function getAccountsForUser(userEmail, platformList) {
  const normalizedEmail = String(userEmail || '').trim().toLowerCase();
  const normalizedPlatforms = (platformList || [])
    .map((platform) => String(platform || '').trim().toLowerCase())
    .filter(Boolean);
  const expandedPlatforms = [...new Set([
    ...normalizedPlatforms,
    ...(normalizedPlatforms.includes('facebook') ? ['facebook_page'] : []),
  ])];

  if (!normalizedEmail || !expandedPlatforms.length) return [];

  const { data, error } = await supabase
    .from('connected_accounts')
    .select('platform, account_id, access_token, account_name')
    .eq('user_email', normalizedEmail)
    .in('platform', expandedPlatforms);

  if (error) throw new Error(`Fetch connected accounts: ${error.message}`);

  const accounts = data || [];
  const hasFacebookPages = accounts.some((account) => account.platform === 'facebook_page');
  return hasFacebookPages ? accounts.filter((account) => account.platform !== 'facebook') : accounts;
}

async function updatePostStatus(postId, status) {
  const { error } = await supabase
    .from('scheduled_posts')
    .update({ status })
    .eq('id', postId);

  if (error) throw new Error(`Update post ${postId} status: ${error.message}`);
}

async function savePublishResults(postId, results) {
  if (!Array.isArray(results) || !results.length) return;

  const rows = results.map((result) => ({
    post_id: postId,
    platform: result.platform,
    platform_post_id: result.platformPostId || null,
    status: result.status,
    error_message: result.error || null,
  }));

  const { error } = await supabase.from('post_results').insert(rows);
  if (error) throw new Error(`Save post results for ${postId}: ${error.message}`);
}

module.exports = {
  claimPost,
  getAccountsForUser,
  getDuePosts,
  savePublishResults,
  updatePostStatus,
};
