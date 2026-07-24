const { config } = require('./config');
const logger = require('./logger');
const { publishPost } = require('./publisher');
const { claimPost, getDuePosts, savePublishResults, updatePostStatus } = require('./supabase');
const { sleep } = require('./utils/sleep');

let stopped = false;
let running = false;

function stopScheduler() {
  stopped = true;
}

async function publishWithRetry(post) {
  let lastResults = [];
  let lastError;

  for (let attempt = 1; attempt <= config.publishRetryAttempts; attempt += 1) {
    try {
      lastResults = await publishPost(post);
      if (lastResults.some((result) => result.status === 'published')) return lastResults;
      lastError = new Error(lastResults.map((result) => result.error || result.status).join('; ') || 'No platform published.');
    } catch (err) {
      lastError = err;
    }

    if (attempt < config.publishRetryAttempts) {
      logger.warn('Publish attempt failed; retrying', { postId: post.id, attempt, error: lastError.message });
      await sleep(config.publishRetryDelayMs);
    }
  }

  if (lastResults.length) return lastResults;
  throw lastError || new Error('Publishing failed.');
}

async function processPost(candidate) {
  const post = await claimPost(candidate.id);
  if (!post) return;

  logger.info('Publishing scheduled post', { postId: post.id, userEmail: post.user_email });

  try {
    const results = await publishWithRetry(post);
    await savePublishResults(post.id, results);

    const hasSuccess = results.some((result) => result.status === 'published');
    await updatePostStatus(post.id, hasSuccess ? 'published' : 'failed');

    logger.info('Finished scheduled post', {
      postId: post.id,
      status: hasSuccess ? 'published' : 'failed',
      resultCount: results.length,
    });
  } catch (err) {
    logger.error('Scheduled post failed', { postId: post.id, error: err.message });
    await updatePostStatus(post.id, 'failed');
  }
}

async function runOnce() {
  if (running) return;
  running = true;

  try {
    const duePosts = await getDuePosts(config.batchSize);
    if (duePosts.length) logger.info('Found due scheduled posts', { count: duePosts.length });

    for (const post of duePosts) {
      if (stopped) break;
      await processPost(post);
    }
  } finally {
    running = false;
  }
}

async function startScheduler() {
  logger.info('Worker scheduler started', {
    pollIntervalMs: config.pollIntervalMs,
    batchSize: config.batchSize,
  });

  while (!stopped) {
    try {
      await runOnce();
    } catch (err) {
      logger.error('Scheduler tick failed', { error: err.message });
    }

    if (!stopped) await sleep(config.pollIntervalMs);
  }

  logger.info('Worker scheduler stopped');
}

module.exports = { runOnce, startScheduler, stopScheduler };
