// ===== AUTH CHECK =====
fetch('/api/admin/me').then(r => { if (!r.ok) window.location.href = '/admin-login.html'; });

document.getElementById('logoutBtn').onclick = async () => {
  await fetch('/api/admin/logout', { method: 'POST' });
  window.location.href = '/admin-login.html';
};

// ===== TAB SWITCHING =====
document.querySelectorAll('.nav-item').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
    document.getElementById('tab-' + btn.dataset.tab).classList.remove('hidden');
    if (btn.dataset.tab === 'products') loadProducts();
    if (btn.dataset.tab === 'orders') loadOrders();
    if (btn.dataset.tab === 'customers') loadCustomers();
    if (btn.dataset.tab === 'design' || btn.dataset.tab === 'settings') loadSettings();
    if (btn.dataset.tab === 'integrations') loadIntegrations();
  };
});

// ===== PRODUCTS =====
let uploadedImageUrls = [];

async function loadProducts() {
  const products = await (await fetch('/api/admin/products')).json();
  const list = document.getElementById('productList');
  if (!products.length) { list.innerHTML = '<div class="row">No products yet. Click "New Product" to add your first one.</div>'; return; }
  list.innerHTML = `<div class="row head"><span></span><span>Name</span><span>Price</span><span>Status</span><span>Actions</span></div>` +
    products.map(p => `
      <div class="row">
        <img src="${p.images[0] || ''}" onerror="this.style.opacity=0">
        <span>${p.name}</span>
        <span>$${Number(p.price).toLocaleString()}</span>
        <span>${p.active ? 'Active' : 'Hidden'}</span>
        <span><button onclick="editProduct(${p.id})">Edit</button></span>
      </div>`).join('');
}

document.getElementById('newProductBtn').onclick = () => openProductEditor(null);
document.getElementById('backToProducts').onclick = () => {
  document.getElementById('tab-product-editor').classList.add('hidden');
  document.getElementById('tab-products').classList.remove('hidden');
};

async function openProductEditor(id) {
  document.getElementById('tab-products').classList.add('hidden');
  document.getElementById('tab-product-editor').classList.remove('hidden');
  document.getElementById('productForm').reset();
  document.getElementById('pImagePreview').innerHTML = '';
  uploadedImageUrls = [];
  document.getElementById('deleteProductBtn').style.display = 'none';

  if (id) {
    const products = await (await fetch('/api/admin/products')).json();
    const p = products.find(x => x.id === id);
    document.getElementById('editorTitle').textContent = 'Edit Product';
    document.getElementById('productId').value = p.id;
    document.getElementById('pName').value = p.name;
    document.getElementById('pCategory').value = p.category;
    document.getElementById('pPrice').value = p.price;
    document.getElementById('pOldPrice').value = p.old_price || '';
    document.getElementById('pBadge').value = p.badge;
    document.getElementById('pSizes').value = p.sizes.join(', ');
    document.getElementById('pDescription').value = p.description;
    document.getElementById('pPrintifyId').value = p.printify_product_id || '';
    uploadedImageUrls = p.images;
    renderImagePreview();
    document.getElementById('deleteProductBtn').style.display = 'inline-block';
  } else {
    document.getElementById('editorTitle').textContent = 'New Product';
    document.getElementById('productId').value = '';
  }
}
window.editProduct = (id) => openProductEditor(id);

function renderImagePreview() {
  document.getElementById('pImagePreview').innerHTML = uploadedImageUrls.map(u => `<img src="${u}">`).join('');
}

document.getElementById('pImages').onchange = async (e) => {
  const files = e.target.files;
  if (!files.length) return;
  const formData = new FormData();
  for (const f of files) formData.append('images', f);
  const res = await fetch('/api/admin/upload', { method: 'POST', body: formData });
  const data = await res.json();
  uploadedImageUrls = uploadedImageUrls.concat(data.urls || []);
  renderImagePreview();
};

document.getElementById('productForm').onsubmit = async (e) => {
  e.preventDefault();
  const id = document.getElementById('productId').value;
  const payload = {
    name: document.getElementById('pName').value,
    category: document.getElementById('pCategory').value,
    price: Number(document.getElementById('pPrice').value),
    old_price: document.getElementById('pOldPrice').value ? Number(document.getElementById('pOldPrice').value) : null,
    badge: document.getElementById('pBadge').value,
    sizes: document.getElementById('pSizes').value.split(',').map(s => s.trim()).filter(Boolean),
    description: document.getElementById('pDescription').value,
    images: uploadedImageUrls,
    printify_product_id: document.getElementById('pPrintifyId').value
  };
  if (id) {
    await fetch('/api/admin/products/' + id, { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  } else {
    await fetch('/api/admin/products', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  }
  document.getElementById('backToProducts').click();
  loadProducts();
};

document.getElementById('deleteProductBtn').onclick = async () => {
  const id = document.getElementById('productId').value;
  if (!id || !confirm('Delete this product?')) return;
  await fetch('/api/admin/products/' + id, { method: 'DELETE' });
  document.getElementById('backToProducts').click();
  loadProducts();
};

// ===== ORDERS =====
async function loadOrders() {
  const orders = await (await fetch('/api/admin/orders')).json();
  const list = document.getElementById('orderList');
  if (!orders.length) { list.innerHTML = '<div class="row">No orders yet.</div>'; return; }
  list.innerHTML = `<div class="row head"><span>#</span><span>Customer</span><span>Amount</span><span>Status</span><span>Date</span></div>` +
    orders.map(o => `
      <div class="row">
        <span>${o.id}</span>
        <span>${o.customer_name || o.customer_email}</span>
        <span>$${Number(o.subtotal).toLocaleString()}</span>
        <span>${o.status}</span>
        <span>${new Date(o.created_at).toLocaleDateString()}</span>
      </div>`).join('');
}

// ===== CUSTOMERS =====
async function loadCustomers() {
  const customers = await (await fetch('/api/admin/customers')).json();
  const list = document.getElementById('customerList');
  if (!customers.length) { list.innerHTML = '<div class="row">No customers yet.</div>'; return; }
  list.innerHTML = `<div class="row head" style="grid-template-columns:1fr 1fr 1fr;"><span>Name</span><span>Email</span><span>Joined</span></div>` +
    customers.map(c => `
      <div class="row" style="grid-template-columns:1fr 1fr 1fr;">
        <span>${c.name || '—'}</span>
        <span>${c.email}</span>
        <span>${new Date(c.created_at).toLocaleDateString()}</span>
      </div>`).join('');
}

// ===== DESIGN + SETTINGS =====
async function loadSettings() {
  const s = await (await fetch('/api/settings')).json();
  document.getElementById('themeBg').value = s.theme_bg || '#ffffff';
  document.getElementById('themeInk').value = s.theme_ink || '#0d0d0d';
  document.getElementById('themeAccent').value = s.theme_accent || '#ff2e92';
  document.getElementById('tickerEnabled').checked = s.ticker_enabled === 'true';
  document.getElementById('tickerText').value = s.ticker_text || '';
  document.getElementById('tickerSpeed').value = s.ticker_speed_seconds || 22;
  document.getElementById('tickerLogoSize').value = s.ticker_logo_size_px || 20;
  document.getElementById('heroHeadline').value = s.hero_headline || '';
  document.getElementById('heroSubtext').value = s.hero_subtext || '';
  document.getElementById('socialYoutube').value = s.social_youtube || '';
  document.getElementById('socialTiktok').value = s.social_tiktok || '';
  document.getElementById('socialInstagram').value = s.social_instagram || '';
  document.getElementById('socialTwitter').value = s.social_twitter || '';
}

document.getElementById('designForm').onsubmit = async (e) => {
  e.preventDefault();
  await fetch('/api/admin/settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({
    theme_bg: document.getElementById('themeBg').value,
    theme_ink: document.getElementById('themeInk').value,
    theme_accent: document.getElementById('themeAccent').value,
    ticker_enabled: document.getElementById('tickerEnabled').checked,
    ticker_text: document.getElementById('tickerText').value,
    ticker_speed_seconds: document.getElementById('tickerSpeed').value,
    ticker_logo_size_px: document.getElementById('tickerLogoSize').value,
    hero_headline: document.getElementById('heroHeadline').value,
    hero_subtext: document.getElementById('heroSubtext').value,
  })});
  alert('Design saved. Refresh your storefront to see changes.');
};

document.getElementById('settingsForm').onsubmit = async (e) => {
  e.preventDefault();
  await fetch('/api/admin/settings', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify({
    social_youtube: document.getElementById('socialYoutube').value,
    social_tiktok: document.getElementById('socialTiktok').value,
    social_instagram: document.getElementById('socialInstagram').value,
    social_twitter: document.getElementById('socialTwitter').value,
  })});
  alert('Settings saved.');
};

// ===== AI ASSISTANT =====
let aiHistory = [];
document.getElementById('aiForm').onsubmit = async (e) => {
  e.preventDefault();
  const input = document.getElementById('aiInput');
  const message = input.value.trim();
  if (!message) return;
  appendAiMessage('user', message);
  input.value = '';
  aiHistory.push({ role: 'user', content: message });
  const res = await fetch('/api/admin/ai/chat', {
    method: 'POST', headers: {'Content-Type':'application/json'},
    body: JSON.stringify({ message, history: aiHistory.slice(0, -1) })
  });
  const data = await res.json();
  const reply = data.reply || data.error || 'Something went wrong.';
  appendAiMessage('assistant', reply);
  aiHistory.push({ role: 'assistant', content: reply });
};

function appendAiMessage(role, text) {
  const div = document.createElement('div');
  div.className = 'ai-msg ' + role;
  div.textContent = text;
  document.getElementById('aiMessages').appendChild(div);
  div.scrollIntoView({ behavior: 'smooth' });
}

// Initial load

// ===== INTEGRATIONS =====
function statusLine(field) {
  if (field.setInPanel) return '✓ set here in the admin panel';
  if (field.setInEnv) return '✓ set in Render (fallback)';
  return '— not set yet';
}

async function loadIntegrations() {
  const s = await (await fetch('/api/admin/integrations')).json();
  document.getElementById('paystackSecretKey').placeholder = statusLine(s.paystack_secret_key);
  document.getElementById('paystackPublicKey').placeholder = statusLine(s.paystack_public_key);
  document.getElementById('printifyApiToken').placeholder = statusLine(s.printify_api_token);
  document.getElementById('printifyShopId').placeholder = statusLine(s.printify_shop_id);
  document.getElementById('cloudinaryCloudName').placeholder = statusLine(s.cloudinary_cloud_name);
  document.getElementById('cloudinaryApiKey').placeholder = statusLine(s.cloudinary_api_key);
  document.getElementById('cloudinaryApiSecret').placeholder = statusLine(s.cloudinary_api_secret);
  document.getElementById('anthropicApiKey').placeholder = statusLine(s.anthropic_api_key);
  document.getElementById('paystackStatus').textContent = '';
  document.getElementById('printifyStatus').textContent = '';
}

document.getElementById('integrationsForm').onsubmit = async (e) => {
  e.preventDefault();
  const payload = {
    paystack_secret_key: document.getElementById('paystackSecretKey').value,
    paystack_public_key: document.getElementById('paystackPublicKey').value,
    printify_api_token: document.getElementById('printifyApiToken').value,
    printify_shop_id: document.getElementById('printifyShopId').value,
    cloudinary_cloud_name: document.getElementById('cloudinaryCloudName').value,
    cloudinary_api_key: document.getElementById('cloudinaryApiKey').value,
    cloudinary_api_secret: document.getElementById('cloudinaryApiSecret').value,
    anthropic_api_key: document.getElementById('anthropicApiKey').value,
  };
  await fetch('/api/admin/integrations', { method: 'PUT', headers: {'Content-Type':'application/json'}, body: JSON.stringify(payload) });
  alert('Integrations saved.');
  loadIntegrations();
};

document.getElementById('checkPaystackBtn').onclick = async () => {
  const el = document.getElementById('paystackStatus');
  el.textContent = 'Checking...';
  const res = await (await fetch('/api/admin/status/paystack')).json();
  el.textContent = (res.connected ? '✓ ' : '✗ ') + res.message;
  el.style.color = res.connected ? '#2a7a2a' : '#c0392b';
};

document.getElementById('checkPrintifyBtn').onclick = async () => {
  const el = document.getElementById('printifyStatus');
  el.textContent = 'Checking...';
  const res = await (await fetch('/api/admin/status/printify')).json();
  el.textContent = (res.connected ? '✓ ' : '✗ ') + res.message;
  el.style.color = res.connected ? '#2a7a2a' : '#c0392b';
};

loadProducts();
