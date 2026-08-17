const state = {
  menu: [],
  cart: JSON.parse(localStorage.getItem("sabor-da-casa-cart") || "[]"),
  category: "Todos",
  selectedDish: null,
};

const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const elements = {
  menuGrid: $("#menuGrid"),
  menuLoading: $("#menuLoading"),
  menuFilters: $("#menuFilters"),
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
  productDialog: $("#productDialog"),
  closeProduct: $("#closeProduct"),
  productImage: $("#productImage"),
  productBadge: $("#productBadge"),
  productCategory: $("#productCategory"),
  productPreparation: $("#productPreparation"),
  productTitle: $("#productTitle"),
  productDescription: $("#productDescription"),
  productServes: $("#productServes"),
  productPrice: $("#productPrice"),
  productIngredients: $("#productIngredients"),
  productAdd: $("#productAdd"),
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function dishLabel(dish) {
  return dish.display_name || dish.dish_name;
}

function renderFilters() {
  const categories = [
    "Todos",
    ...new Set(state.menu.map((dish) => dish.category || "Cardápio")),
  ];

  elements.menuFilters.innerHTML = categories
    .map(
      (category) => `
        <button
          class="menu-filter ${category === state.category ? "is-active" : ""}"
          type="button"
          data-category="${encodeURIComponent(category)}"
        >${escapeHtml(category)}</button>`,
    )
    .join("");
}

function renderMenu() {
  elements.menuGrid.innerHTML = "";
  elements.menuLoading.hidden = true;

  const visible = state.category === "Todos"
    ? state.menu
    : state.menu.filter((dish) => dish.category === state.category);

  if (!visible.length) {
    elements.menuGrid.innerHTML = `
      <div class="menu-empty">
        <strong>Nenhum prato nessa categoria.</strong>
        <p>Escolha outra categoria ou fale com a Vanuza pelo WhatsApp.</p>
      </div>`;
    return;
  }

  visible.forEach((dish) => {
    const article = document.createElement("article");
    article.className = "menu-card";
    const label = dishLabel(dish);
    const encoded = encodeURIComponent(dish.dish_name);

    article.innerHTML = `
      <button class="menu-card__photo-button" type="button" data-product="${encoded}" aria-label="Ver detalhes de ${escapeHtml(label)}">
        <img src="${escapeHtml(dish.image_url || "/brand/logo")}" alt="${escapeHtml(label)}" loading="lazy" decoding="async" />
        <span class="menu-card__badge">${escapeHtml(dish.badge || "Feito em casa")}</span>
        <span class="menu-card__zoom" aria-hidden="true">↗</span>
      </button>
      <div class="menu-card__body">
        <span class="menu-card__category">${escapeHtml(dish.category || "Cardápio")}</span>
        <div class="menu-card__title-row">
          <h3>${escapeHtml(label)}</h3>
          <span class="menu-card__price">${money.format(dish.price)}</span>
        </div>
        <p class="menu-card__description">${escapeHtml(dish.description || "Prato preparado com cuidado.")}</p>
        <div class="menu-card__meta">
          <span>${escapeHtml(dish.serves || "Porção individual")}</span>
          <span>${escapeHtml(dish.preparation || "Consulte disponibilidade")}</span>
        </div>
        <div class="menu-card__actions">
          <button class="menu-card__details" type="button" data-product="${encoded}">Ver detalhes</button>
          <button class="button button--primary" type="button" data-add="${encoded}">Adicionar +</button>
        </div>
      </div>`;

    elements.menuGrid.appendChild(article);
  });
}

function openProduct(dishName) {
  const dish = state.menu.find((item) => item.dish_name === dishName);
  if (!dish) return;

  state.selectedDish = dish;
  const label = dishLabel(dish);
  elements.productImage.src = dish.image_url || "/brand/logo";
  elements.productImage.alt = label;
  elements.productBadge.textContent = dish.badge || "Feito em casa";
  elements.productCategory.textContent = dish.category || "Cardápio";
  elements.productPreparation.textContent = dish.preparation || "Consulte disponibilidade";
  elements.productTitle.textContent = label;
  elements.productDescription.textContent = dish.description || "Prato preparado com cuidado.";
  elements.productServes.textContent = dish.serves || "Porção individual";
  elements.productPrice.textContent = money.format(dish.price);
  elements.productIngredients.innerHTML = (dish.ingredients || [])
    .map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`)
    .join("");

  elements.productDialog.showModal();
  document.body.classList.add("no-scroll");
}

function closeProduct() {
  if (elements.productDialog.open) elements.productDialog.close();
  state.selectedDish = null;
  document.body.classList.remove("no-scroll");
}

function addToCart(dishName, options = {}) {
  const dish = state.menu.find((item) => item.dish_name === dishName);
  if (!dish) return;

  const existing = state.cart.find((item) => item.name === dishName);
  if (existing) {
    existing.quantity += 1;
    existing.price = dish.price;
    existing.label = dishLabel(dish);
  } else {
    state.cart.push({
      name: dish.dish_name,
      label: dishLabel(dish),
      price: dish.price,
      quantity: 1,
    });
  }

  saveCart();
  renderCart();
  showToast(`${dishLabel(dish)} adicionado ao pedido`);

  if (options.closeProduct) closeProduct();
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
        <h4>${escapeHtml(item.label || item.name)}</h4>
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
    elements.submitOrder.textContent = "Registrar e abrir WhatsApp ↗";
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

  reconcileCart();
  renderFilters();
  renderMenu();
  renderCart();
}

function reconcileCart() {
  state.cart = state.cart
    .map((item) => {
      const current = state.menu.find((dish) => dish.dish_name === item.name);
      if (!current) return null;
      return {
        ...item,
        label: dishLabel(current),
        price: current.price,
      };
    })
    .filter(Boolean);
  saveCart();
}

elements.menuFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = decodeURIComponent(button.dataset.category);
  renderFilters();
  renderMenu();
});

elements.menuGrid.addEventListener("click", (event) => {
  const addButton = event.target.closest("[data-add]");
  if (addButton) {
    addToCart(decodeURIComponent(addButton.dataset.add));
    return;
  }

  const detailButton = event.target.closest("[data-product]");
  if (detailButton) {
    openProduct(decodeURIComponent(detailButton.dataset.product));
  }
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
elements.closeProduct.addEventListener("click", closeProduct);
elements.productAdd.addEventListener("click", () => {
  if (state.selectedDish) {
    addToCart(state.selectedDish.dish_name, { closeProduct: true });
  }
});
elements.productDialog.addEventListener("click", (event) => {
  if (event.target === elements.productDialog) closeProduct();
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (elements.cartDrawer.classList.contains("is-open")) closeCart();
  if (elements.productDialog.open) closeProduct();
});

$("#year").textContent = new Date().getFullYear();
updateDeliveryFields();
renderCart();
loadMenu();
