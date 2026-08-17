const state = {
  menu: [],
  cart: JSON.parse(localStorage.getItem("sabor-da-casa-cart") || "[]"),
};

const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const elements = {
  menuGrid: $("#menuGrid"),
  menuLoading: $("#menuLoading"),
  cartButton: $("#cartButton"),
  closeCart: $("#closeCart"),
  cartDrawer: $("#cartDrawer"),
  overlay: $("#overlay"),
  cartCount: $("#cartCount"),
  cartItems: $("#cartItems"),
  emptyCart: $("#emptyCart"),
  cartSummary: $("#cartSummary"),
  cartTotal: $("#cartTotal"),
  checkoutButton: $("#checkoutButton"),
  checkoutDialog: $("#checkoutDialog"),
  checkoutForm: $("#checkoutForm"),
  closeCheckout: $("#closeCheckout"),
  checkoutError: $("#checkoutError"),
  submitOrder: $("#submitOrder"),
  deliveryMethod: $("#deliveryMethod"),
  addressField: $("#addressField"),
  toast: $("#toast"),
};

function saveCart() {
  localStorage.setItem("sabor-da-casa-cart", JSON.stringify(state.cart));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(showToast.timer);
  showToast.timer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2200);
}

function restrictionLabel(value) {
  const labels = {
    ANIMAL_DERIVED: "Origem animal",
    ANIMAL_MEAT: "Contém carne",
    SEAFOOD: "Frutos do mar",
    LACTOSE: "Contém lactose",
    GLUTEN: "Contém glúten",
  };
  return labels[value] || value;
}

function renderMenu() {
  elements.menuGrid.innerHTML = "";
  elements.menuLoading.hidden = true;

  if (!state.menu.length) {
    elements.menuGrid.innerHTML = `
      <div class="menu-empty">
        <strong>Cardápio temporariamente indisponível.</strong>
        <p>Fale com a Vanuza pelo WhatsApp para consultar os pratos do dia.</p>
      </div>`;
    return;
  }

  state.menu.forEach((dish) => {
    const article = document.createElement("article");
    article.className = "menu-card";
    article.innerHTML = `
      <div class="menu-card__visual" aria-hidden="true"><span>🍝</span></div>
      <div class="menu-card__body">
        <div class="menu-card__title-row">
          <h3>${escapeHtml(dish.dish_name)}</h3>
          <span class="menu-card__price">${money.format(dish.price)}</span>
        </div>
        <p class="menu-card__ingredients">${escapeHtml(dish.ingredients.join(", "))}</p>
        <div class="menu-card__tags">
          ${dish.restrictions.map((item) => `<span class="menu-card__tag">${escapeHtml(restrictionLabel(item))}</span>`).join("")}
        </div>
        <button class="button button--primary" type="button" data-add="${encodeURIComponent(dish.dish_name)}">Adicionar ao pedido</button>
      </div>`;
    elements.menuGrid.appendChild(article);
  });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function addToCart(dishName) {
  const dish = state.menu.find((item) => item.dish_name === dishName);
  if (!dish) return;

  const existing = state.cart.find((item) => item.name === dishName);
  if (existing) {
    existing.quantity += 1;
  } else {
    state.cart.push({ name: dish.dish_name, price: dish.price, quantity: 1 });
  }

  saveCart();
  renderCart();
  showToast(`${dish.dish_name} adicionado ao pedido`);
}

function changeQuantity(name, delta) {
  const item = state.cart.find((current) => current.name === name);
  if (!item) return;

  item.quantity += delta;
  if (item.quantity <= 0) {
    state.cart = state.cart.filter((current) => current.name !== name);
  }

  saveCart();
  renderCart();
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);
  elements.cartCount.textContent = count;
  elements.cartItems.innerHTML = "";
  elements.emptyCart.hidden = count > 0;
  elements.cartSummary.hidden = count === 0;
  elements.cartTotal.textContent = money.format(total);

  state.cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div>
        <h4>${escapeHtml(item.name)}</h4>
        <small>${money.format(item.price)} cada</small>
        <div class="quantity-control">
          <button type="button" aria-label="Diminuir quantidade" data-qty="-1" data-name="${encodeURIComponent(item.name)}">−</button>
          <strong>${item.quantity}</strong>
          <button type="button" aria-label="Aumentar quantidade" data-qty="1" data-name="${encodeURIComponent(item.name)}">+</button>
        </div>
      </div>
      <div class="cart-item__price">${money.format(item.price * item.quantity)}</div>`;
    elements.cartItems.appendChild(row);
  });
}

function openCart() {
  elements.cartDrawer.classList.add("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "false");
  elements.overlay.hidden = false;
  document.body.classList.add("no-scroll");
}

function closeCart() {
  elements.cartDrawer.classList.remove("is-open");
  elements.cartDrawer.setAttribute("aria-hidden", "true");
  elements.overlay.hidden = true;
  document.body.classList.remove("no-scroll");
}

function openCheckout() {
  if (!state.cart.length) return;
  closeCart();
  elements.checkoutError.hidden = true;
  elements.checkoutDialog.showModal();
}

function updateDeliveryFields() {
  const isDelivery = elements.deliveryMethod.value === "Entrega";
  elements.addressField.hidden = !isDelivery;
  const input = elements.addressField.querySelector("input");
  input.required = isDelivery;
  if (!isDelivery) input.value = "";
}

async function submitOrder(event) {
  event.preventDefault();
  if (!state.cart.length) return;

  elements.checkoutError.hidden = true;
  elements.submitOrder.disabled = true;
  elements.submitOrder.textContent = "Registrando pedido...";

  const formData = new FormData(elements.checkoutForm);
  const payload = {
    customer_name: String(formData.get("customer_name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    delivery_method: String(formData.get("delivery_method") || "Entrega"),
    address: String(formData.get("address") || "").trim(),
    payment_method: String(formData.get("payment_method") || "Pix"),
    notes: String(formData.get("notes") || "").trim(),
    items: state.cart.map((item) => ({
      dish_name: item.name,
      quantity: item.quantity,
    })),
  };

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(error.detail || "Não foi possível registrar o pedido.");
    }

    const result = await response.json();
    state.cart = [];
    saveCart();
    renderCart();
    elements.checkoutDialog.close();
    elements.checkoutForm.reset();
    updateDeliveryFields();
    showToast(`Pedido #${result.order.id} registrado!`);

    window.setTimeout(() => {
      window.location.href = result.whatsapp_url;
    }, 350);
  } catch (error) {
    elements.checkoutError.textContent = error.message;
    elements.checkoutError.hidden = false;
  } finally {
    elements.submitOrder.disabled = false;
    elements.submitOrder.textContent = "Registrar e abrir WhatsApp";
  }
}

async function loadMenu() {
  try {
    const response = await fetch("/api/menu");
    if (!response.ok) throw new Error("menu unavailable");
    state.menu = await response.json();
  } catch (_error) {
    state.menu = [];
  }
  renderMenu();
  reconcileCart();
  renderCart();
}

function reconcileCart() {
  state.cart = state.cart
    .map((item) => {
      const current = state.menu.find((dish) => dish.dish_name === item.name);
      if (!current) return null;
      return { ...item, price: current.price };
    })
    .filter(Boolean);
  saveCart();
}

elements.menuGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");
  if (!button) return;
  addToCart(decodeURIComponent(button.dataset.add));
});

elements.cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-qty]");
  if (!button) return;
  changeQuantity(
    decodeURIComponent(button.dataset.name),
    Number(button.dataset.qty),
  );
});

elements.cartButton.addEventListener("click", openCart);
elements.closeCart.addEventListener("click", closeCart);
elements.overlay.addEventListener("click", closeCart);
elements.checkoutButton.addEventListener("click", openCheckout);
elements.closeCheckout.addEventListener("click", () => elements.checkoutDialog.close());
elements.deliveryMethod.addEventListener("change", updateDeliveryFields);
elements.checkoutForm.addEventListener("submit", submitOrder);

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && elements.cartDrawer.classList.contains("is-open")) {
    closeCart();
  }
});

$("#year").textContent = new Date().getFullYear();
updateDeliveryFields();
renderCart();
loadMenu();
