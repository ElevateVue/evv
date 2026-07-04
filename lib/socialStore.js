const fs = require('fs');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');

const storePath = path.join(__dirname, '..', 'connected-accounts.json');

const supabaseUrl = process.env.SUPABASE_URL || process.env.SUPERBASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY || process.env.SUPERBASE_ANON_KEY;
const supabase = supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

function loadLocalStore() {
  try {
    if (!fs.existsSync(storePath)) {
      fs.writeFileSync(storePath, JSON.stringify([], null, 2), 'utf8');
      return [];
    }
    const raw = fs.readFileSync(storePath, 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('[socialStore] Failed to load local store:', err.message);
    return [];
  }
}

function saveLocalStore(rows) {
  try {
    fs.writeFileSync(storePath, JSON.stringify(Array.isArray(rows) ? rows : [], null, 2), 'utf8');
    return true;
  } catch (err) {
    console.error('[socialStore] Failed to save local store:', err.message);
    return false;
  }
}

function createLocalId() {
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function normalizeRow(row = {}) {
  return {
    id: row.id || row.localId || createLocalId(),
    user_email: String(row.user_email || row.userEmail || '').trim().toLowerCase(),
    platform: String(row.platform || '').trim(),
    account_name: String(row.account_name || row.accountName || row.accountName || '').trim(),
    account_id: String(row.account_id || row.accountId || row.accountId || '').trim(),
    access_token: String(row.access_token || row.accessToken || '').trim(),
    expires_at: row.expires_at || row.expiresAt || null,
    created_at: row.created_at || row.createdAt || new Date().toISOString(),
  };
}

async function upsertConnectedAccount(row = {}) {
  const normalized = normalizeRow(row);
  if (!normalized.user_email || !normalized.platform || !normalized.account_id) {
    throw new Error('Missing required connected account fields');
  }

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('connected_accounts')
        .upsert({
          user_email: normalized.user_email,
          platform: normalized.platform,
          account_name: normalized.account_name,
          account_id: normalized.account_id,
          access_token: normalized.access_token,
          expires_at: normalized.expires_at,
          created_at: normalized.created_at,
        }, { onConflict: 'user_email,platform,account_id' });
      if (error) throw error;
      if (Array.isArray(data) && data[0]) return normalizeRow(data[0]);
    } catch (err) {
      console.warn('[socialStore] Supabase upsert failed, falling back to local store:', err.message);
    }
  }

  const rows = loadLocalStore();
  const existingIndex = rows.findIndex((item) =>
    item.user_email === normalized.user_email &&
    item.platform === normalized.platform &&
    item.account_id === normalized.account_id
  );
  if (existingIndex >= 0) {
    rows[existingIndex] = { ...rows[existingIndex], ...normalized };
  } else {
    rows.push(normalized);
  }
  saveLocalStore(rows);
  return normalized;
}

async function selectConnectedAccounts(userEmail) {
  const normalizedEmail = String(userEmail || '').trim().toLowerCase();
  if (!normalizedEmail) return [];

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('connected_accounts')
        .select('id,platform,account_name,account_id,expires_at,created_at')
        .eq('user_email', normalizedEmail);
      if (error) throw error;
      if (Array.isArray(data)) return data.map((row) => normalizeRow(row));
    } catch (err) {
      console.warn('[socialStore] Supabase select failed, falling back to local store:', err.message);
    }
  }

  const rows = loadLocalStore();
  return rows.filter((item) => item.user_email === normalizedEmail).map((row) => normalizeRow(row));
}

async function deleteConnectedAccount(id, userEmail) {
  const normalizedEmail = String(userEmail || '').trim().toLowerCase();
  if (!id || !normalizedEmail) return false;

  if (supabase) {
    try {
      const { error } = await supabase
        .from('connected_accounts')
        .delete()
        .eq('id', id)
        .eq('user_email', normalizedEmail);
      if (!error) return true;
      throw error;
    } catch (err) {
      console.warn('[socialStore] Supabase delete failed, falling back to local store:', err.message);
    }
  }

  const rows = loadLocalStore();
  const nextRows = rows.filter((item) => !(item.id === id && item.user_email === normalizedEmail));
  saveLocalStore(nextRows);
  return nextRows.length !== rows.length;
}

async function getConnectedAccount(userEmail, accountId) {
  const normalizedEmail = String(userEmail || '').trim().toLowerCase();
  if (!normalizedEmail || !accountId) return null;

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('connected_accounts')
        .select('id,platform,account_name,account_id,access_token,expires_at,created_at')
        .eq('user_email', normalizedEmail)
        .eq('account_id', String(accountId).trim())
        .limit(1)
        .single();
      if (error) throw error;
      return normalizeRow(data);
    } catch (err) {
      console.warn('[socialStore] Supabase get failed, falling back to local store:', err.message);
    }
  }

  const rows = loadLocalStore();
  const normalizedId = String(accountId || '').trim();
  const match = rows.find((item) =>
    item.user_email === normalizedEmail &&
    (item.account_id === normalizedId || item.id === normalizedId)
  );
  return match ? normalizeRow(match) : null;
}

async function getConnectedAccountById(accountId) {
  if (!accountId) return null;
  const normalizedId = String(accountId || '').trim();

  if (supabase) {
    try {
      const { data, error } = await supabase
        .from('connected_accounts')
        .select('id,platform,account_name,account_id,access_token,expires_at,created_at')
        .eq('account_id', normalizedId)
        .limit(1)
        .single();
      if (error) throw error;
      return normalizeRow(data);
    } catch (err) {
      console.warn('[socialStore] Supabase id lookup failed, falling back to local store:', err.message);
    }
  }

  const rows = loadLocalStore();
  const match = rows.find((item) => item.account_id === normalizedId || item.id === normalizedId);
  return match ? normalizeRow(match) : null;
}

module.exports = {
  upsertConnectedAccount,
  selectConnectedAccounts,
  deleteConnectedAccount,
  getConnectedAccount,
  getConnectedAccountById,
};
