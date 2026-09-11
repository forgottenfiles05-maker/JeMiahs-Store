// ===== FALLBACK SAMPLE DATA (used only if the backend isn't reachable) =====
const sampleProducts = [
  { id: 1, name: "Chrome Static Hoodie", price: 68, old_price: 85, views: ["🧥","🔙","↔️"], badge: "New", category: "hoodies", sizes: ["S","M","L","XL"] },
  { id: 2, name: "Y2K Flame Tee", price: 34, views: ["👕","🔙","↔️"], badge: "Limited", category: "tees", sizes: ["S","M","L","XL"] },
  { id: 3, name: "Loud Silence Cargo", price: 60, views: ["👖","🔙"], category: "hoodies", sizes: ["30","32","34","36"] },
  { id: 4, name: "Static Visor Cap", price: 22, views: ["🧢","↔️"], category: "accessories", sizes: ["One Size"] },
];
const defaultSettings = {
  ticker_enabled: 'true', ticker_text: '', ticker_speed_seconds: '22', ticker_logo_size_px: '20',
  theme_bg: '#ffffff', theme_ink: '#0d0d0d', theme_accent: '#ff2e92',
  hero_headline: 'JEMIAHŜ', hero_subtext: 'Bold graphics. Unusual silhouettes. Built to be seen.',
  social_youtube: '', social_tiktok: '', social_instagram: '', social_twitter: ''
};

// All prices are in USD. Enter prices in your admin panel as plain USD
// numbers (e.g. 42 for $42). Actually charging in USD at checkout depends
// on your Paystack account being enabled for USD - check that in Paystack's
// own dashboard, this display doesn't control that.
const CURRENCY_SYMBOL = '$';

let allProducts = [];
let filteredProducts = [];
let settings = defaultSettings;
let cart = [];
let activeCategories = new Set();
let currentSort = 'featured';
let currentSearch = '';
let currentPage = 1;
const PRODUCTS_PER_PAGE = 7;

function fmt(amount) {
  return CURRENCY_SYMBOL + Number(amount).toLocaleString(undefined, { maximumFractionDigits: 2 });
}

function visualsFor(p) {
  if (p.images && p.images.length) return p.images.map(u => `<img src="${u}" loading="lazy" style="width:100%;height:100%;object-fit:cover;">`);
  return (p.views || ["📦"]);
}

async function init() {
  try {
    const [prodRes, settingsRes] = await Promise.all([fetch('/api/products'), fetch('/api/settings')]);
    if (prodRes.ok) allProducts = await prodRes.json();
    if (settingsRes.ok) settings = { ...defaultSettings, ...(await settingsRes.json()) };
  } catch (e) { /* fall back to sample data below */ }
  if (!allProducts.length) allProducts = sampleProducts;

  applySettings();
  buildFilterPanel();
  applyFiltersSortSearch();
  renderCart();
}

function applySettings() {
  document.documentElement.style.setProperty('--bg', settings.theme_bg);
  document.documentElement.style.setProperty('--ink', settings.theme_ink);
  document.documentElement.style.setProperty('--accent', settings.theme_accent);

  const ticker = document.querySelector('.ticker');
  if (ticker) {
    ticker.style.display = (settings.ticker_enabled === 'true' || settings.ticker_enabled === true) ? 'block' : 'none';
    const track = ticker.querySelector('.ticker-track');
    // The loop animation moves the track by exactly -50%, which only looks
    // seamless if the track contains the logo pattern duplicated TWICE back
    // to back. Do that duplication once here, so it always lines up no
    // matter how many logos or what size they're set to.
    if (!track.dataset.duplicated) {
      track.innerHTML += track.innerHTML;
      track.dataset.duplicated = 'true';
    }
    track.style.animationDuration = (settings.ticker_speed_seconds || 22) + 's';
    track.querySelectorAll('img').forEach(img => img.style.height = (settings.ticker_logo_size_px || 20) + 'px');
  }

  const heroTag = document.querySelector('.hero-tag');
  const heroHint = document.querySelector('.hero-hint');
  if (heroTag) heroTag.textContent = settings.hero_headline || 'JEMIAHŜ';
  if (heroHint) heroHint.textContent = settings.hero_subtext || '';

  // Hide social entries that haven't been filled in yet
  const socialLinks = { youtube: settings.social_youtube, tiktok: settings.social_tiktok, instagram: settings.social_instagram, twitter: settings.social_twitter };
  document.querySelectorAll('[data-social]').forEach(el => {
    const key = el.dataset.social;
    if (!socialLinks[key]) el.style.display = 'none';
    else { el.style.display = ''; el.href = socialLinks[key]; }
  });
}

// ===== FILTER PANEL =====
function buildFilterPanel() {
  const categories = [...new Set(allProducts.map(p => p.category).filter(Boolean))];
  const body = document.getElementById('filterPanelBody');
  body.innerHTML = `<p class="filter-group-label">Category</p>` + categories.map(cat => `
    <label class="filter-checkbox">
      <input type="checkbox" value="${cat}" class="cat-checkbox">
      ${cat.charAt(0).toUpperCase() + cat.slice(1)}
    </label>
  `).join('') + `<label class="filter-checkbox all-products"><input type="checkbox" id="allProductsCheck" checked> All Products</label>`;

  document.querySelectorAll('.cat-checkbox').forEach(cb => {
    cb.onchange = () => {
      document.getElementById('allProductsCheck').checked = false;
      if (cb.checked) activeCategories.add(cb.value); else activeCategories.delete(cb.value);
    };
  });
  document.getElementById('allProductsCheck').onchange = (e) => {
    if (e.target.checked) {
      activeCategories.clear();
      document.querySelectorAll('.cat-checkbox').forEach(cb => cb.checked = false);
    }
  };
}

const filterBtn = document.getElementById("filterBtn");
const filterPanel = document.getElementById("filterPanel");
const filterPanelOverlay = document.getElementById("filterPanelOverlay");
filterBtn.onclick = () => { filterPanel.classList.add("open"); filterPanelOverlay.classList.add("open"); };
document.getElementById("closeFilterPanel").onclick = closeFilterPanel;
filterPanelOverlay.onclick = closeFilterPanel;
function closeFilterPanel() { filterPanel.classList.remove("open"); filterPanelOverlay.classList.remove("open"); }
document.getElementById("seeResultsBtn").onclick = () => { closeFilterPanel(); currentPage = 1; applyFiltersSortSearch(); };

// ===== SORT =====
const sortBtn = document.getElementById("sortBtn");
const sortPanel = document.getElementById("sortPanel");
sortBtn.onclick = (e) => { e.stopPropagation(); sortPanel.classList.toggle("open"); };
document.addEventListener("click", () => sortPanel.classList.remove("open"));
sortPanel.querySelectorAll("div").forEach(opt => {
  opt.onclick = () => { currentSort = opt.dataset.sort; sortPanel.classList.remove("open"); currentPage = 1; applyFiltersSortSearch(); };
});

// ===== SEARCH =====
const searchBar = document.getElementById("searchBar");
document.getElementById("searchBtn").onclick = () => {
  searchBar.classList.toggle("open");
  if (searchBar.classList.contains("open")) document.getElementById("searchInput").focus();
};
document.getElementById("searchClose").onclick = () => searchBar.classList.remove("open");
document.getElementById("searchInput").oninput = (e) => {
  currentSearch = e.target.value.toLowerCase();
  currentPage = 1;
  applyFiltersSortSearch();
};

// ===== APPLY FILTER + SORT + SEARCH + PAGINATION =====
function applyFiltersSortSearch() {
  filteredProducts = allProducts.filter(p => {
    const matchesCategory = activeCategories.size === 0 || activeCategories.has(p.category);
    const matchesSearch = !currentSearch || p.name.toLowerCase().includes(currentSearch);
    return matchesCategory && matchesSearch;
  });

  if (currentSort === 'price-low') filteredProducts.sort((a, b) => a.price - b.price);
  else if (currentSort === 'price-high') filteredProducts.sort((a, b) => b.price - a.price);
  else if (currentSort === 'newest') filteredProducts.sort((a, b) => new Date(b.created_at || 0) - new Date(a.created_at || 0));

  renderGrid();
  renderPagination();
}

// ===== RENDER PRODUCT GRID (paginated) =====
const grid = document.getElementById("productGrid");
function renderGrid() {
  const start = (currentPage - 1) * PRODUCTS_PER_PAGE;
  const pageItems = filteredProducts.slice(start, start + PRODUCTS_PER_PAGE);

  if (!pageItems.length) {
    grid.innerHTML = `<p style="grid-column:1/-1;text-align:center;color:#999;padding:40px 0;">No products found.</p>`;
    return;
  }

  grid.innerHTML = pageItems.map(p => `
    <div class="product-card" data-id="${p.id}">
      <div class="product-img">
        ${p.badge ? `<span class="badge">${p.badge}</span>` : ""}
        ${visualsFor(p)[0]}
      </div>
      <div class="product-info">
        <h4>${p.name}</h4>
        <div>
          ${p.old_price ? `<span class="old-price">${fmt(p.old_price)}</span>` : ""}
          <span class="product-price">${fmt(p.price)}</span>
        </div>
      </div>
    </div>
  `).join("");
}

function renderPagination() {
  const totalPages = Math.ceil(filteredProducts.length / PRODUCTS_PER_PAGE);
  const el = document.getElementById("pagination");
  if (totalPages <= 1) { el.innerHTML = ""; return; }

  let html = "";
  for (let i = 1; i <= totalPages; i++) {
    html += `<button class="page-btn ${i === currentPage ? 'active' : ''}" data-page="${i}">${i}</button>`;
  }
  el.innerHTML = html;
  el.querySelectorAll(".page-btn").forEach(btn => {
    btn.onclick = () => {
      currentPage = Number(btn.dataset.page);
      renderGrid();
      renderPagination();
      document.querySelector('.shop').scrollIntoView({ behavior: 'smooth' });
    };
  });
}

// ===== SIDE MENU =====
const sideMenu = document.getElementById("sideMenu");
const sideMenuOverlay = document.getElementById("sideMenuOverlay");
function openSideMenu(){ sideMenu.classList.add("open"); sideMenuOverlay.classList.add("open"); }
function closeSideMenu(){ sideMenu.classList.remove("open"); sideMenuOverlay.classList.remove("open"); }
document.getElementById("menuBtn").onclick = openSideMenu;
document.getElementById("closeSideMenu").onclick = closeSideMenu;
sideMenuOverlay.onclick = closeSideMenu;

// ===== NEWSLETTER =====
const subscribeBtn = document.getElementById("subscribeBtn");
if (subscribeBtn) {
  subscribeBtn.onclick = () => {
    const email = document.getElementById("newsletterEmail").value;
    if (email) {
      subscribeBtn.textContent = "Subscribed";
      document.getElementById("newsletterEmail").value = "";
      setTimeout(() => { subscribeBtn.textContent = "Subscribe"; }, 2200);
    }
  };
}

// ===== QUICK VIEW MODAL =====
const modalOverlay = document.getElementById("modalOverlay");
const productModal = document.getElementById("productModal");
let activeProduct = null;
let selectedSize = null;
let activeVisuals = [];
let activeVisualIndex = 0;

grid.addEventListener("click", (e) => {
  const card = e.target.closest(".product-card");
  if (!card) return;
  openQuickView(Number(card.dataset.id));
});

function openQuickView(id) {
  const p = allProducts.find(x => x.id === id);
  activeProduct = p;
  selectedSize = null;
  activeVisuals = visualsFor(p);
  activeVisualIndex = 0;

  productModal.innerHTML = `
    <div class="pm-gallery">
      <div class="pm-logo-header"><img src="jm-logo.png" alt="JeMiahŝ"></div>
      <div class="pm-visual" id="pmVisual">
        ${activeVisuals[0]}
        <button class="pm-expand" id="pmExpand">&#43;</button>
      </div>
      ${activeVisuals.length > 1 ? `
      <div class="pm-thumbs">
        ${activeVisuals.map((v, i) => `<div class="pm-thumb ${i===0?'active':''}" data-view="${i}">${v}</div>`).join("")}
      </div>` : ""}
    </div>
    <div class="pm-info">
      <button class="pm-close" id="pmClose">&times;</button>
      <h3>${p.name}</h3>
      <span class="product-price">${fmt(p.price)}</span>
      <p class="desc">${p.description || "Part of the Static collection. Bold graphics, unusual cut, limited run — once it's archived, it's gone."}</p>
      <div class="size-row" id="sizeRow">
        ${(p.sizes || ["One Size"]).map(s => `<div class="size-chip" data-size="${s}">${s}</div>`).join("")}
      </div>
      <button class="btn btn-primary" id="addToCartBtn" style="width:100%;text-align:center;">Add to Bag</button>
    </div>
  `;
  modalOverlay.classList.add("open");

  document.getElementById("pmClose").onclick = () => modalOverlay.classList.remove("open");
  document.getElementById("pmExpand").onclick = () => openLightbox(activeVisualIndex);
  document.querySelectorAll(".pm-thumb").forEach(thumb => {
    thumb.onclick = () => {
      document.querySelectorAll(".pm-thumb").forEach(t => t.classList.remove("active"));
      thumb.classList.add("active");
      activeVisualIndex = Number(thumb.dataset.view);
      document.getElementById("pmVisual").innerHTML = activeVisuals[activeVisualIndex] + `<button class="pm-expand" id="pmExpand">&#43;</button>`;
      document.getElementById("pmExpand").onclick = () => openLightbox(activeVisualIndex);
    };
  });
  document.querySelectorAll(".size-chip").forEach(chip => {
    chip.onclick = () => {
      document.querySelectorAll(".size-chip").forEach(c => c.classList.remove("selected"));
      chip.classList.add("selected");
      selectedSize = chip.dataset.size;
    };
  });
  document.getElementById("addToCartBtn").onclick = () => {
    if (!selectedSize) { alert("Pick a size first."); return; }
    addToCart(p, selectedSize);
    modalOverlay.classList.remove("open");
    openCart();
  };
}

modalOverlay.addEventListener("click", (e) => { if (e.target === modalOverlay) modalOverlay.classList.remove("open"); });

// ===== FULLSCREEN LIGHTBOX =====
const lightboxOverlay = document.getElementById("lightboxOverlay");
const lightboxImage = document.getElementById("lightboxImage");
const lightboxEmoji = document.getElementById("lightboxEmoji");

function openLightbox(index) {
  activeVisualIndex = index;
  updateLightboxImage();
  lightboxOverlay.classList.add("open");
}
function updateLightboxImage() {
  const visual = activeVisuals[activeVisualIndex];
  const match = /src="([^"]+)"/.exec(visual);
  if (match) {
    lightboxImage.src = match[1]; lightboxImage.style.display = '';
    lightboxEmoji.style.display = 'none';
  } else {
    lightboxImage.style.display = 'none';
    lightboxEmoji.style.display = ''; lightboxEmoji.textContent = visual.replace(/<[^>]+>/g, '');
  }
}
document.getElementById("lightboxClose").onclick = () => lightboxOverlay.classList.remove("open");
document.getElementById("lightboxPrev").onclick = () => {
  activeVisualIndex = (activeVisualIndex - 1 + activeVisuals.length) % activeVisuals.length;
  updateLightboxImage();
};
document.getElementById("lightboxNext").onclick = () => {
  activeVisualIndex = (activeVisualIndex + 1) % activeVisuals.length;
  updateLightboxImage();
};
lightboxOverlay.addEventListener("click", (e) => { if (e.target === lightboxOverlay) lightboxOverlay.classList.remove("open"); });
// swipe support
let touchStartX = 0;
lightboxOverlay.addEventListener("touchstart", (e) => touchStartX = e.touches[0].clientX);
lightboxOverlay.addEventListener("touchend", (e) => {
  const diff = e.changedTouches[0].clientX - touchStartX;
  if (diff > 50) document.getElementById("lightboxPrev").click();
  else if (diff < -50) document.getElementById("lightboxNext").click();
});

// ===== CART LOGIC =====
function addToCart(product, size) {
  const existing = cart.find(i => i.id === product.id && i.size === size);
  if (existing) existing.qty += 1;
  else cart.push({ ...product, size, qty: 1 });
  renderCart();
}
function removeFromCart(index) { cart.splice(index, 1); renderCart(); }

function renderCart() {
  const drawerItems = document.getElementById("drawerItems");
  const cartCount = document.getElementById("cartCount");
  const cartSubtotal = document.getElementById("cartSubtotal");
  cartCount.textContent = cart.reduce((sum, i) => sum + i.qty, 0);

  if (cart.length === 0) {
    drawerItems.innerHTML = `<div class="empty-cart">Your bag is empty.<br>Go find something loud.</div>`;
  } else {
    drawerItems.innerHTML = cart.map((item, idx) => `
      <div class="drawer-item">
        <div class="drawer-item-visual">${visualsFor(item)[0]}</div>
        <div class="drawer-item-info">
          <h5>${item.name}</h5>
          <span>Size ${item.size} &middot; Qty ${item.qty}</span><br>
          <span class="remove-item" data-idx="${idx}">Remove</span>
        </div>
        <div class="drawer-item-price">${fmt(item.price * item.qty)}</div>
      </div>
    `).join("");
    document.querySelectorAll(".remove-item").forEach(btn => { btn.onclick = () => removeFromCart(Number(btn.dataset.idx)); });
  }
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  cartSubtotal.textContent = fmt(subtotal);
}

// ===== CART DRAWER OPEN/CLOSE =====
const cartDrawer = document.getElementById("cartDrawer");
const drawerOverlay = document.getElementById("drawerOverlay");
function openCart() { cartDrawer.classList.add("open"); drawerOverlay.classList.add("open"); }
function closeCart() { cartDrawer.classList.remove("open"); drawerOverlay.classList.remove("open"); }
document.getElementById("cartBtn").onclick = openCart;
document.getElementById("closeCart").onclick = closeCart;
drawerOverlay.onclick = closeCart;

// ===== CHECKOUT =====
// Real payment fields (card number etc.) are never built by us - that's
// Paystack's hosted page/popup, for PCI security reasons. We collect the
// shipping/contact info on our own real page below, then hand off to
// Paystack for the actual payment step.
const checkoutPage = document.getElementById("checkoutPage");

document.getElementById("checkoutBtn").onclick = () => {
  if (cart.length === 0) { alert("Your bag is empty."); return; }
  closeCart();
  openCheckoutPage();
};
document.getElementById("checkoutBack").onclick = () => checkoutPage.classList.remove("open");

function openCheckoutPage() {
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);
  document.getElementById("checkoutSummaryTotal").textContent = fmt(subtotal);
  document.getElementById("checkoutOrderItems").innerHTML = cart.map(item => `
    <div class="checkout-order-line">
      <span>${item.name} (${item.size}) &times; ${item.qty}</span>
      <span>${fmt(item.price * item.qty)}</span>
    </div>
  `).join("");
  checkoutPage.classList.add("open");
  window.scrollTo(0, 0);
}

document.getElementById("checkoutForm").onsubmit = async (e) => {
  e.preventDefault();
  const btn = document.getElementById("checkoutContinueBtn");
  btn.disabled = true; btn.textContent = "Processing...";

  const email = document.getElementById("coEmail").value;
  const firstName = document.getElementById("coFirstName").value;
  const lastName = document.getElementById("coLastName").value;
  const address = document.getElementById("coAddress").value;
  const apartment = document.getElementById("coApartment").value;
  const city = document.getElementById("coCity").value;
  const state = document.getElementById("coState").value;
  const zip = document.getElementById("coZip").value;
  const phone = document.getElementById("coPhone").value;
  const fullAddress = [address, apartment, city, state, zip].filter(Boolean).join(", ");
  const subtotal = cart.reduce((sum, i) => sum + i.price * i.qty, 0);

  try {
    const res = await fetch('/api/checkout', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        items: cart.map(i => ({ id: i.id, name: i.name, size: i.size, quantity: i.qty, printify_product_id: i.printify_product_id, printify_variant_id: i.printify_variant_id })),
        subtotal,
        customer: { email, name: `${firstName} ${lastName}`.trim(), phone, address: fullAddress }
      })
    });
    if (!res.ok) throw new Error('checkout failed');
    const data = await res.json();
    window.location.href = data.authorization_url; // Paystack's own hosted payment page
  } catch (err) {
    btn.disabled = false; btn.textContent = "Continue to Payment";
    console.error("Checkout failed - check Paystack connection in the admin Integrations tab:", err);
    alert("Sorry, checkout isn't available right now. Please try again shortly.");
  }
};

// init
init();
