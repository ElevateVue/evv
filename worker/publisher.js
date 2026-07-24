const { publishFacebookPage, publishInstagram } = require('./meta');
const { getAccountsForUser } = require('./supabase');

function normalizePlatforms(platforms) {
  if (!Array.isArray(platforms)) return [];
  return platforms.map((platform) => String(platform || '').trim().toLowerCase()).filter(Boolean);
}

function getPostMediaUrls(post) {
  if (Array.isArray(post.media_urls)) return post.media_urls.map((url) => String(url || '').trim()).filter(Boolean);
  if (post.media_url) return [String(post.media_url).trim()].filter(Boolean);
  return [];
}

async function publishPost(post) {
  const platforms = normalizePlatforms(post.platforms);
  const accounts = await getAccountsForUser(post.user_email, platforms);
  if (!accounts.length) {
    throw new Error('No connected accounts found for this post.');
  }

  const caption = String(post.content || post.caption || post.title || '').trim();
  const mediaUrls = getPostMediaUrls(post);
  const mediaType = String(post.media_type || post.post_type || 'image').trim().toLowerCase();
  const results = [];

  for (const account of accounts) {
    try {
      let published;
      if (account.platform === 'facebook_page' || account.platform === 'facebook') {
        published = await publishFacebookPage(account.account_id, account.access_token, { caption, mediaUrls, mediaType });
      } else if (account.platform === 'instagram') {
        published = await publishInstagram(account.account_id, account.access_token, { caption, mediaUrls, mediaType });
      } else {
        results.push({ platform: account.platform, status: 'skipped', error: 'Platform is not supported by this worker.' });
        continue;
      }

      results.push({
        platform: account.platform,
        status: 'published',
        platformPostId: published.id || published.post_id || null,
      });
    } catch (err) {
      results.push({ platform: account.platform, status: 'error', error: err.message });
    }
  }

  return results;
}

module.exports = { publishPost };
