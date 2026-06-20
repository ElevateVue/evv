const { createClient } = require('@supabase/supabase-js');

// Accept both correct spelling (SUPABASE) and common typo (SUPERBASE)
const url = process.env.SUPABASE_URL || process.env.SUPERBASE_URL;
const key = process.env.SUPABASE_ANON_KEY || process.env.SUPERBASE_ANON_KEY;

const supabase = createClient(url, key);

module.exports = supabase;
