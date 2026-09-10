require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fetch = require('node-fetch');
const { v2: cloudinary } = require('cloudinary');
const { pool, ready } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(session({
  secret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 24 * 7 }
}));

// Block direct access to internal/source files - everything else in this
// folder is served as-is, flat, no subfolders.
const blockedFiles = ['/server.js', '/db.js', '/package.json', '/package-lock.json', '/.env', '/.env.example', '/README.md', '/node_modules'];
app.use((req, res, next) => {
  if (blockedFiles.some(f => req.path === f || req.path.startsWith(f + '/'))) {
    return res.status(404).send('Not found');
  }
  next();
});
app.use(express.static(path.join(__dirname)));

// Reads a secret from the database first (set via the admin panel's
// Integrations tab); falls back to Render's environment variables if
// nothing's been entered in the panel yet.
async function getSecret(key, envVarName) {
  const result = await pool.query('SELECT value FROM integrations WHERE key = $1', [key]);
  if (result.rows[0]?.value) return result.rows[0].value;
  return process.env[envVarName] || '';
}

async function configureCloudinary() {
  cloudinary.config({
    cloud_name: await getSecret('cloudinary_cloud_name', 'CLOUDINARY_CLOUD_NAME'),
    api_key: await getSecret('cloudinary_api_key', 'CLOUDINARY_API_KEY'),
    api_secret: await getSecret('cloudinary_api_secret', 'CLOUDINARY_API_SECRET')
  });
}
const upload = multer({ storage: multer.memoryStorage() });
function uploadToCloudinary(buffer) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder: 'jemiahs-products' },
      (err, result) => err ? reject(err) : resolve(result.secure_url)
    );
    stream.end(buffer);
  });
}

function requireAuth(req, res, next) {
  if (req.session && req.session.adminId) return next();
  return res.status(401).json({ error: 'Not logged in' });
}

function parseProduct(row) {
  return { ...row, sizes: JSON.parse(row.sizes || '[]'), images: JSON.parse(row.images || '[]') };
}

// ===================== AUTH =====================
app.post('/api/admin/login', async (req, res) => {
  const { username, password } = req.body;
  const result = await pool.query('SELECT * FROM admin_users WHERE username = $1', [username]);
  const user = result.rows[0];
  if (!user || !bcrypt.compareSync(password || '', user.password_hash)) {
    return res.status(401).json({ error: 'Invalid username or password' });
  }
  req.session.adminId = user.id;
  res.json({ ok: true, username: user.username });
});

app.post('/api/admin/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/admin/me', (req, res) => {
  if (!req.session.adminId) return res.status(401).json({ loggedIn: false });
  res.json({ loggedIn: true });
});

// ===================== PRODUCTS =====================
app.get('/api/products', async (req, res) => {
  const result = await pool.query('SELECT * FROM products WHERE active = 1 ORDER BY created_at DESC');
  res.json(result.rows.map(parseProduct));
});

app.get('/api/admin/products', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM products ORDER BY created_at DESC');
  res.json(result.rows.map(parseProduct));
});

app.post('/api/admin/products', requireAuth, async (req, res) => {
  const { name, description, price, old_price, category, badge, sizes, images, printify_product_id } = req.body;
  const result = await pool.query(
    `INSERT INTO products (name, description, price, old_price, category, badge, sizes, images, printify_product_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
    [name, description || '', price, old_price || null, category || '', badge || '',
     JSON.stringify(sizes || []), JSON.stringify(images || []), printify_product_id || null]
  );
  res.json({ id: result.rows[0].id });
});

app.put('/api/admin/products/:id', requireAuth, async (req, res) => {
  const { name, description, price, old_price, category, badge, sizes, images, active } = req.body;
  await pool.query(
    `UPDATE products SET name=$1, description=$2, price=$3, old_price=$4, category=$5, badge=$6, sizes=$7, images=$8, active=$9 WHERE id=$10`,
    [name, description || '', price, old_price || null, category || '', badge || '',
     JSON.stringify(sizes || []), JSON.stringify(images || []), active === false ? 0 : 1, req.params.id]
  );
  res.json({ ok: true });
});

app.delete('/api/admin/products/:id', requireAuth, async (req, res) => {
  await pool.query('DELETE FROM products WHERE id = $1', [req.params.id]);
  res.json({ ok: true });
});

app.post('/api/admin/upload', requireAuth, upload.array('images', 6), async (req, res) => {
  try {
    await configureCloudinary();
    const urls = await Promise.all((req.files || []).map(f => uploadToCloudinary(f.buffer)));
    res.json({ urls });
  } catch (err) {
    console.error('Cloudinary upload failed:', err.message);
    res.status(500).json({ error: 'Photo upload failed. Check your Cloudinary keys in Integrations.' });
  }
});

// ===================== SETTINGS =====================
app.get('/api/settings', async (req, res) => {
  const result = await pool.query('SELECT * FROM settings');
  const settings = {};
  result.rows.forEach(r => settings[r.key] = r.value);
  res.json(settings);
});

app.put('/api/admin/settings', requireAuth, async (req, res) => {
  for (const [k, v] of Object.entries(req.body)) {
    await pool.query(
      'INSERT INTO settings (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
      [k, String(v)]
    );
  }
  res.json({ ok: true });
});

// ===================== ORDERS / CUSTOMERS =====================
app.get('/api/admin/orders', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM orders ORDER BY created_at DESC');
  res.json(result.rows.map(r => ({ ...r, items: JSON.parse(r.items) })));
});

app.patch('/api/admin/orders/:id', requireAuth, async (req, res) => {
  await pool.query('UPDATE orders SET status=$1 WHERE id=$2', [req.body.status, req.params.id]);
  res.json({ ok: true });
});

app.get('/api/admin/customers', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT * FROM customers ORDER BY created_at DESC');
  res.json(result.rows);
});

// ===================== CHECKOUT (Paystack) =====================
app.post('/api/checkout', async (req, res) => {
  const { items, subtotal, customer } = req.body;
  if (!items || !subtotal || !customer?.email) {
    return res.status(400).json({ error: 'Missing order details' });
  }

  let customerRow;
  const existingCustomer = await pool.query('SELECT * FROM customers WHERE email = $1', [customer.email]);
  if (existingCustomer.rows.length) {
    customerRow = existingCustomer.rows[0];
  } else {
    const inserted = await pool.query(
      'INSERT INTO customers (name, email, phone) VALUES ($1,$2,$3) RETURNING id',
      [customer.name || '', customer.email, customer.phone || '']
    );
    customerRow = { id: inserted.rows[0].id };
  }

  const orderInsert = await pool.query(
    `INSERT INTO orders (customer_id, customer_name, customer_email, phone, address, items, subtotal, status)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'pending') RETURNING id`,
    [customerRow.id, customer.name || '', customer.email, customer.phone || '', customer.address || '',
     JSON.stringify(items), subtotal]
  );
  const orderId = orderInsert.rows[0].id;

  try {
    const paystackSecret = await getSecret('paystack_secret_key', 'PAYSTACK_SECRET_KEY');
    const psRes = await fetch('https://api.paystack.co/transaction/initialize', {
      method: 'POST',
      headers: { Authorization: `Bearer ${paystackSecret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email: customer.email,
        amount: Math.round(subtotal * 100), // Paystack expects the smallest currency unit (cents for USD)
        currency: 'USD',
        reference: `jemiahs_${orderId}_${Date.now()}`,
        callback_url: `${req.protocol}://${req.get('host')}/checkout-success.html`,
        metadata: { order_id: orderId }
      })
    });
    const psData = await psRes.json();
    if (!psData.status) throw new Error(psData.message || 'Paystack init failed');

    await pool.query('UPDATE orders SET paystack_reference=$1 WHERE id=$2', [psData.data.reference, orderId]);
    res.json({ authorization_url: psData.data.authorization_url, order_id: orderId });
  } catch (err) {
    console.error('Paystack error:', err.message);
    res.status(500).json({ error: 'Could not start payment. Check your Paystack keys in .env.' });
  }
});

// ===================== PAYSTACK WEBHOOK =====================
app.post('/api/paystack/webhook', express.json(), async (req, res) => {
  const event = req.body;
  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    const result = await pool.query('SELECT * FROM orders WHERE paystack_reference = $1', [reference]);
    const order = result.rows[0];
    if (order) {
      await pool.query('UPDATE orders SET status=$1 WHERE id=$2', ['paid', order.id]);
      try { await sendOrderToPrintify(order); }
      catch (err) { console.error('Printify order creation failed:', err.message); }
    }
  }
  res.sendStatus(200);
});

async function sendOrderToPrintify(order) {
  const printifyToken = await getSecret('printify_api_token', 'PRINTIFY_API_TOKEN');
  const printifyShopId = await getSecret('printify_shop_id', 'PRINTIFY_SHOP_ID');
  const items = JSON.parse(order.items);
  const line_items = items.map(item => ({
    product_id: item.printify_product_id,
    variant_id: item.printify_variant_id,
    quantity: item.quantity || 1
  }));

  const resp = await fetch(`https://api.printify.com/v1/shops/${printifyShopId}/orders.json`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${printifyToken}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      external_id: `jemiahs_order_${order.id}`,
      line_items,
      shipping_method: 1,
      send_shipping_notification: true,
      address_to: {
        first_name: (order.customer_name || '').split(' ')[0] || 'Customer',
        last_name: (order.customer_name || '').split(' ').slice(1).join(' ') || '',
        email: order.customer_email,
        phone: order.phone,
        address1: order.address
      }
    })
  });
  const data = await resp.json();
  if (data.id) await pool.query('UPDATE orders SET printify_order_id=$1 WHERE id=$2', [data.id, order.id]);
}

// ===================== INTEGRATIONS (API keys, entered via admin panel) =====================
const INTEGRATION_KEYS = [
  'paystack_secret_key', 'paystack_public_key',
  'printify_api_token', 'printify_shop_id',
  'cloudinary_cloud_name', 'cloudinary_api_key', 'cloudinary_api_secret',
  'anthropic_api_key'
];

app.get('/api/admin/integrations', requireAuth, async (req, res) => {
  const result = await pool.query('SELECT key, value FROM integrations');
  const stored = {};
  result.rows.forEach(r => stored[r.key] = r.value);
  // Tell the admin panel which keys are set (via panel or via Render env vars)
  // without ever sending the actual secret values back to the browser.
  const status = {};
  for (const key of INTEGRATION_KEYS) {
    const envName = key.toUpperCase();
    status[key] = { setInPanel: !!stored[key], setInEnv: !!process.env[envName] };
  }
  res.json(status);
});

app.put('/api/admin/integrations', requireAuth, async (req, res) => {
  for (const key of INTEGRATION_KEYS) {
    if (req.body[key] !== undefined && req.body[key] !== '') {
      await pool.query(
        'INSERT INTO integrations (key, value) VALUES ($1, $2) ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value',
        [key, req.body[key]]
      );
    }
  }
  res.json({ ok: true });
});

app.get('/api/admin/status/paystack', requireAuth, async (req, res) => {
  try {
    const key = await getSecret('paystack_secret_key', 'PAYSTACK_SECRET_KEY');
    if (!key) return res.json({ connected: false, message: 'No Paystack key set yet.' });
    const resp = await fetch('https://api.paystack.co/transaction?perPage=1', {
      headers: { Authorization: `Bearer ${key}` }
    });
    const data = await resp.json();
    if (resp.ok && data.status) res.json({ connected: true, message: 'Paystack key is valid.' });
    else res.json({ connected: false, message: data.message || 'Paystack rejected this key.' });
  } catch (err) {
    res.json({ connected: false, message: 'Could not reach Paystack.' });
  }
});

app.get('/api/admin/status/printify', requireAuth, async (req, res) => {
  try {
    const token = await getSecret('printify_api_token', 'PRINTIFY_API_TOKEN');
    const shopId = await getSecret('printify_shop_id', 'PRINTIFY_SHOP_ID');
    if (!token) return res.json({ connected: false, message: 'No Printify token set yet.' });
    const resp = await fetch('https://api.printify.com/v1/shops.json', {
      headers: { Authorization: `Bearer ${token}` }
    });
    const shops = await resp.json();
    if (!resp.ok) return res.json({ connected: false, message: 'Printify rejected this token.' });
    const match = shops.find(s => String(s.id) === String(shopId));
    if (match) res.json({ connected: true, message: `Linked to shop "${match.title}".` });
    else if (shops.length) res.json({ connected: false, message: `Token works, but Shop ID ${shopId || '(not set)'} doesn't match any of your shops: ${shops.map(s => s.id + ' - ' + s.title).join(', ')}` });
    else res.json({ connected: false, message: 'Token works, but no store exists in your Printify account yet - add one first (My Profile > My Stores > Add a new store > API).' });
  } catch (err) {
    res.json({ connected: false, message: 'Could not reach Printify.' });
  }
});

// ===================== PRINTIFY CATALOG =====================
app.get('/api/admin/printify/products', requireAuth, async (req, res) => {
  try {
    const printifyToken = await getSecret('printify_api_token', 'PRINTIFY_API_TOKEN');
    const printifyShopId = await getSecret('printify_shop_id', 'PRINTIFY_SHOP_ID');
    const resp = await fetch(`https://api.printify.com/v1/shops/${printifyShopId}/products.json`, {
      headers: { Authorization: `Bearer ${printifyToken}` }
    });
    res.json(await resp.json());
  } catch (err) {
    res.status(500).json({ error: 'Could not reach Printify. Check your API token/shop ID in Integrations.' });
  }
});

// ===================== AI ASSISTANT =====================
app.post('/api/admin/ai/chat', requireAuth, async (req, res) => {
  const { message, history } = req.body;
  try {
    const anthropicKey = await getSecret('anthropic_api_key', 'ANTHROPIC_API_KEY');
    const resp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': anthropicKey, 'anthropic-version': '2023-06-01', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 1000,
        system: 'You are an assistant helping the owner of JeMiahs, a streetwear brand, manage their store: writing product descriptions, tweaking copy, and answering questions about their store data.',
        messages: [...(history || []), { role: 'user', content: message }]
      })
    });
    const data = await resp.json();
    const text = (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
    res.json({ reply: text || 'No response.' });
  } catch (err) {
    res.status(500).json({ error: 'AI assistant unavailable. Check your Anthropic key in Integrations.' });
  }
});

ready.then(() => {
  app.listen(PORT, () => console.log(`JeMiahs store running on http://localhost:${PORT}`));
}).catch(err => {
  console.error('Database setup failed:', err);
  process.exit(1);
});
