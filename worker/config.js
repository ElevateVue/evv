const path = require('path');
const dotenv = require('dotenv');

dotenv.config();
dotenv.config({ path: path.join(__dirname, '..', 'API.env'), override: false });

const config = {
  supabaseUrl: process.env.SUPABASE_URL || process.env.SUPERBASE_URL,
  supabaseKey:
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPERBASE_ANON_KEY,
  graphApiVersion: process.env.META_GRAPH_API_VERSION || 'v19.0',
  pollIntervalMs: Number(process.env.WORKER_POLL_INTERVAL_MS || 60000),
  batchSize: Number(process.env.WORKER_BATCH_SIZE || 10),
  publishRetryAttempts: Number(process.env.WORKER_PUBLISH_RETRY_ATTEMPTS || 3),
  publishRetryDelayMs: Number(process.env.WORKER_PUBLISH_RETRY_DELAY_MS || 5000),
};

function validateConfig() {
  const missing = [];
  if (!config.supabaseUrl) missing.push('SUPABASE_URL');
  if (!config.supabaseKey) missing.push('SUPABASE_SERVICE_ROLE_KEY or SUPABASE_ANON_KEY');

  if (missing.length) {
    const error = new Error(`Missing required environment variable(s): ${missing.join(', ')}`);
    error.code = 'CONFIG_ERROR';
    throw error;
  }

  if (!Number.isFinite(config.pollIntervalMs) || config.pollIntervalMs < 5000) {
    throw new Error('WORKER_POLL_INTERVAL_MS must be at least 5000.');
  }
  if (!Number.isFinite(config.batchSize) || config.batchSize < 1) {
    throw new Error('WORKER_BATCH_SIZE must be at least 1.');
  }
  if (!Number.isFinite(config.publishRetryAttempts) || config.publishRetryAttempts < 1) {
    throw new Error('WORKER_PUBLISH_RETRY_ATTEMPTS must be at least 1.');
  }
}

module.exports = { config, validateConfig };
