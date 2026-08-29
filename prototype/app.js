const formatIDR = (amount) => `Rp ${new Intl.NumberFormat("id-ID").format(Math.max(0, Math.round(amount)))}`;

const productCatalog = {
  "kopi-susu": {
    name: "Es Kopi Susu",
    art: "art-coffee-milk",
    variants: { Reguler: 22000, Besar: 26000 },
  },
  americano: {
    name: "Americano",
    art: "art-americano",
    variants: { Reguler: 18000, Besar: 22000 },
  },
  "caramel-latte": {
    name: "Caramel Latte",
    art: "art-caramel",
    variants: { Reguler: 24000, Besar: 28000 },
  },
  "matcha-cloud": {
    name: "Matcha Cloud",
    art: "art-matcha",
    variants: { Reguler: 25000, Besar: 29000 },
  },
  chocolate: {
    name: "Dark Chocolate",
    art: "art-chocolate",
    variants: { Reguler: 23000, Besar: 27000 },
  },
  croffle: {
    name: "Croffle Butter",
    art: "art-croffle-mini",
    variants: { Original: 18000, Keju: 22000 },
  },
};

let cart = [
  { key: "kopi-susu-reguler", productId: "kopi-susu", variant: "Reguler", quantity: 1 },
  { key: "croffle-original", productId: "croffle", variant: "Original", quantity: 1 },
];

let paymentMethod = "cash";
let currentRevenue = 8420000;
let currentOrders = 124;
let toastTimer;

const cartItems = document.querySelector("#cartItems");
const cartCount = document.querySelector("#cartCount");
const subtotalValue = document.querySelector("#subtotalValue");
const taxValue = document.querySelector("#taxValue");
const totalValue = document.querySelector("#totalValue");
const payButtonTotal = document.querySelector("#payButtonTotal");
const cashReceived = document.querySelector("#cashReceived");
const changeValue = document.querySelector("#changeValue");
const changeRow = document.querySelector(".change-row");
const cashPayment = document.querySelector("#cashPayment");
const digitalPayment = document.querySelector("#digitalPayment");
const payButton = document.querySelector("#payButton");
const toast = document.querySelector("#toast");
const toastMessage = document.querySelector("#toastMessage");

const getItemPrice = (item) => productCatalog[item.productId].variants[item.variant];

const getSubtotal = () => cart.reduce((sum, item) => sum + getItemPrice(item) * item.quantity, 0);

const getTotal = () => {
  const subtotal = getSubtotal();
  return subtotal + subtotal * 0.1;
};

const getCartKey = (productId, variant) => `${productId}-${variant.toLowerCase().replace(/\s+/g, "-")}`;

function showToast(message) {
  window.clearTimeout(toastTimer);
  toastMessage.textContent = message;
  toast.classList.add("show");
  toastTimer = window.setTimeout(() => toast.classList.remove("show"), 3000);
}

function renderCart() {
  const itemCount = cart.reduce((sum, item) => sum + item.quantity, 0);
  cartCount.textContent = `${itemCount} item`;

  if (!cart.length) {
    cartItems.innerHTML = `
      <div class="cart-empty">
        <span class="cart-empty-icon">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 8h14v12H5zM8 8V6a4 4 0 0 1 8 0v2M9 12h6" /></svg>
        </span>
        <strong>Keranjang masih kosong</strong>
        <p>Pilih menu untuk mulai membuat pesanan.</p>
      </div>
    `;
  } else {
    cartItems.innerHTML = cart
      .map((item) => {
        const product = productCatalog[item.productId];
        const lineTotal = getItemPrice(item) * item.quantity;
        return `
          <div class="cart-item" data-cart-key="${item.key}">
            <span class="mini-art ${product.art}" aria-hidden="true"></span>
            <div class="cart-item-info">
              <strong>${product.name}</strong>
              <small>${item.variant} · ${formatIDR(getItemPrice(item))}</small>
            </div>
            <div class="cart-item-side">
              <strong>${formatIDR(lineTotal)}</strong>
              <div class="quantity-control" aria-label="Jumlah ${product.name}">
                <button type="button" data-cart-action="decrease" data-cart-key="${item.key}" aria-label="Kurangi ${product.name}">−</button>
                <span>${item.quantity}</span>
                <button type="button" data-cart-action="increase" data-cart-key="${item.key}" aria-label="Tambah ${product.name}">+</button>
              </div>
            </div>
          </div>
        `;
      })
      .join("");
  }

  updateTotals();
}

function updateTotals() {
  const subtotal = getSubtotal();
  const tax = subtotal * 0.1;
  const total = subtotal + tax;

  subtotalValue.textContent = formatIDR(subtotal);
  taxValue.textContent = formatIDR(tax);
  totalValue.textContent = formatIDR(total);
  payButtonTotal.textContent = formatIDR(total);
  updateChange();
}

function updateChange() {
  const total = getTotal();
  const received = Number(cashReceived.value) || 0;
  const difference = received - total;
  const insufficient = total > 0 && difference < 0;

  changeRow.classList.toggle("insufficient", insufficient);
  if (insufficient) {
    changeValue.textContent = `Kurang ${formatIDR(Math.abs(difference))}`;
  } else {
    changeValue.textContent = formatIDR(difference);
  }
}

function addToCart(productId, variant) {
  const key = getCartKey(productId, variant);
  const existingItem = cart.find((item) => item.key === key);

  if (existingItem) {
    existingItem.quantity += 1;
  } else {
    cart.push({ key, productId, variant, quantity: 1 });
  }

  renderCart();
  showToast(`${productCatalog[productId].name} (${variant}) ditambahkan`);
}

function updateCartQuantity(key, action) {
  const item = cart.find((cartItem) => cartItem.key === key);
  if (!item) return;

  if (action === "increase") {
    item.quantity += 1;
  } else if (action === "decrease") {
    item.quantity -= 1;
    if (item.quantity <= 0) {
      cart = cart.filter((cartItem) => cartItem.key !== key);
    }
  }

  renderCart();
}

function setPaymentMethod(method) {
  paymentMethod = method;
  document.querySelectorAll(".payment-method").forEach((button) => {
    const isActive = button.dataset.payment === method;
    button.classList.toggle("active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });

  const isCash = method === "cash";
  cashPayment.hidden = !isCash;
  digitalPayment.hidden = isCash;
}

function completePayment(method = paymentMethod) {
  const total = getTotal();
  const completedMethod = method;
  const methodNames = { cash: "tunai", qris: "QRIS", debit: "kartu debit" };
  currentRevenue += total;
  currentOrders += 1;

  document.querySelector("#revenueValue").textContent = formatIDR(currentRevenue);
  document.querySelector("#ordersValue").innerHTML = `${currentOrders} <small>transaksi</small>`;
  cart = [];
  cashReceived.value = "50000";
  setPaymentMethod("cash");
  renderCart();
  showToast(`Pembayaran ${methodNames[completedMethod]} berhasil. Stok resep dipotong otomatis.`);
}

document.querySelector("#productGrid").addEventListener("click", (event) => {
  const addButton = event.target.closest(".add-product");
  if (!addButton) return;

  const productCard = addButton.closest(".product-card");
  const variantSelect = productCard.querySelector(".variant-select");
  addToCart(addButton.dataset.product, variantSelect.value);
});

cartItems.addEventListener("click", (event) => {
  const quantityButton = event.target.closest("[data-cart-action]");
  if (!quantityButton) return;
  updateCartQuantity(quantityButton.dataset.cartKey, quantityButton.dataset.cartAction);
});

document.querySelectorAll(".payment-method").forEach((button) => {
  button.addEventListener("click", () => setPaymentMethod(button.dataset.payment));
});

cashReceived.addEventListener("input", updateChange);

document.querySelectorAll("[data-cash]").forEach((button) => {
  button.addEventListener("click", () => {
    cashReceived.value = button.dataset.cash;
    updateChange();
  });
});

document.querySelector("#clearCartButton").addEventListener("click", () => {
  if (!cart.length) {
    showToast("Keranjang sudah kosong");
    return;
  }
  cart = [];
  renderCart();
  showToast("Keranjang sudah dikosongkan");
});

payButton.addEventListener("click", () => {
  if (!cart.length) {
    showToast("Pilih menu terlebih dahulu untuk membuat pesanan");
    return;
  }

  const total = getTotal();
  if (paymentMethod === "cash" && Number(cashReceived.value) < total) {
    changeRow.classList.add("insufficient");
    showToast(`Uang diterima masih kurang ${formatIDR(total - Number(cashReceived.value || 0))}`);
    cashReceived.focus();
    return;
  }

  if (paymentMethod !== "cash") {
    const checkoutMethod = paymentMethod;
    const buttonLabel = payButton.querySelector("span");
    const originalLabel = buttonLabel.textContent;
    payButton.disabled = true;
    buttonLabel.textContent = "Menunggu konfirmasi...";
    window.setTimeout(() => {
      payButton.disabled = false;
      buttonLabel.textContent = originalLabel;
      completePayment(checkoutMethod);
    }, 700);
    return;
  }

  completePayment(paymentMethod);
});

const searchInput = document.querySelector("#menuSearch");
const emptySearch = document.querySelector("#emptySearch");
let activeCategory = "all";

function filterProducts() {
  const query = searchInput.value.trim().toLowerCase();
  let visibleProducts = 0;

  document.querySelectorAll(".product-card").forEach((card) => {
    const matchesCategory = activeCategory === "all" || card.dataset.category === activeCategory;
    const matchesQuery = card.dataset.name.toLowerCase().includes(query);
    const isVisible = matchesCategory && matchesQuery;
    card.hidden = !isVisible;
    if (isVisible) visibleProducts += 1;
  });

  emptySearch.hidden = visibleProducts > 0;
}

searchInput.addEventListener("input", filterProducts);

document.querySelectorAll(".category-tab").forEach((tab) => {
  tab.addEventListener("click", () => {
    activeCategory = tab.dataset.category;
    document.querySelectorAll(".category-tab").forEach((categoryTab) => {
      const isActive = categoryTab === tab;
      categoryTab.classList.toggle("active", isActive);
      categoryTab.setAttribute("aria-selected", String(isActive));
    });
    filterProducts();
  });
});

document.querySelectorAll("[data-toast]").forEach((element) => {
  if (element.id === "clearCartButton") return;
  element.addEventListener("click", () => showToast(element.dataset.toast));
});

document.querySelectorAll(".nav-item").forEach((item) => {
  item.addEventListener("click", () => {
    if (item.classList.contains("active")) {
      document.querySelector(".menu-panel").scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }
    showToast(`${item.dataset.module} akan hadir di fase berikutnya`);
  });
});

document.querySelector("#closeShiftButton").addEventListener("click", () => {
  showToast("Rekap shift siap ditinjau sebelum ditutup");
});

let syncSeconds = 2;
window.setInterval(() => {
  syncSeconds += 1;
  document.querySelector("#syncTime").textContent = syncSeconds < 60 ? `${syncSeconds} detik lalu` : "1 menit lalu";
}, 10000);

renderCart();
setPaymentMethod("cash");
