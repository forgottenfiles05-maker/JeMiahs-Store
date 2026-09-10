// db.js — Postgres connection + schema setup.
// Render gives you a DATABASE_URL when you add a Postgres database and link
// it to this service — that's the only thing this file needs from your env.
const { Pool } = require('pg');
const bcrypt = require('bcryptjs');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.DATABASE_URL?.includes('neon.tech') || process.env.DATABASE_URL?.includes('render.com') || process.env.NODE_ENV === 'production'
    ? { rejectUnauthorized: false } : false
});

const ready = (async () => {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS admin_users (
      id SERIAL PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price INTEGER NOT NULL,
      old_price INTEGER,
      category TEXT DEFAULT '',
      badge TEXT DEFAULT '',
      sizes TEXT DEFAULT '[]',
      images TEXT DEFAULT '[]',
      printify_product_id TEXT,
      printify_variant_map TEXT DEFAULT '{}',
      active INTEGER DEFAULT 1,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS customers (
      id SERIAL PRIMARY KEY,
      name TEXT,
      email TEXT UNIQUE,
      phone TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS orders (
      id SERIAL PRIMARY KEY,
      customer_id INTEGER,
      customer_name TEXT,
      customer_email TEXT,
      phone TEXT,
      address TEXT,
      items TEXT NOT NULL,
      subtotal INTEGER NOT NULL,
      status TEXT DEFAULT 'pending',
      paystack_reference TEXT,
      printify_order_id TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS integrations (
      key TEXT PRIMARY KEY,
      value TEXT
    );
  `);

  const defaultSettings = {
    ticker_enabled: 'true', ticker_text: '', ticker_speed_seconds: '22', ticker_logo_size_px: '20',
    theme_bg: '#ffffff', theme_ink: '#0d0d0d', theme_accent: '#ff2e92',
    social_youtube: '', social_tiktok: '', social_instagram: '', social_twitter: '',
    hero_headline: 'JEMIAHŜ', hero_subtext: 'Bold graphics. Unusual silhouettes. Built to be seen.'
  };
  for (const [k, v] of Object.entries(defaultSettings)) {
    await pool.query('INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO NOTHING', [k, v]);
  }

  const adminUsername = process.env.ADMIN_USERNAME || 'admin';
  const existing = await pool.query('SELECT id FROM admin_users WHERE username = $1', [adminUsername]);
  if (existing.rows.length === 0) {
    const hash = bcrypt.hashSync(process.env.ADMIN_PASSWORD || 'change-this-password', 10);
    await pool.query('INSERT INTO admin_users (username, password_hash) VALUES ($1, $2)', [adminUsername, hash]);
    console.log('Created admin user:', adminUsername);
  }
})();

module.exports = { pool, ready };
