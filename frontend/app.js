const state = {
  menu: [],
  cart: JSON.parse(localStorage.getItem("sabor-da-casa-cart-v3") || "[]"),
  mode: "Hoje",
  category: "Todos",
  search: "",
  selectedDish: null,
  selectedOptionId: null,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const elements = {
  menuGrid: $("#menuGrid"),
  menuLoading: $("#menuLoading"),
  menuFilters: $("#menuFilters"),
  menuSearch: $("#menuSearch"),
  featuredGrid: $("#featuredGrid"),
  preorderNotice: $("#preorderNotice"),
  modeButtons: $$(".order-mode__button"),
  modeJumps: $$('[data-mode-jump]'),
  categoryJumps: $$('[data-category-jump]'),
  scrollMenuButtons: $$('[data-scroll-menu]'),
  cartButton: $("#cartButton"),
  mobileCartNav: $("#mobileCartNav"),
  mobileNavCount: $("#mobileNavCount"),
  mobileCartBar: $("#mobileCartBar"),
  mobileCartCount: $("#mobileCartCount"),
  mobileCartTotal: $("#mobileCartTotal"),
  closeCart: $("#closeCart"),
  cartDrawer: $("#cartDrawer"),
  overlay: $("#overlay"),
  cartCount: $("#cartCount"),
  cartKinds: $("#cartKinds"),
  cartItems: $("#cartItems"),
  emptyCart: $("#emptyCart"),
  cartSummary: $("#cartSummary"),
  cartTotal: $("#cartTotal"),
  checkoutButton: $("#checkoutButton"),
  checkoutDialog: $("#checkoutDialog"),
  checkoutForm: $("#checkoutForm"),
  checkoutOrderKinds: $("#checkoutOrderKinds"),
  closeCheckout: $("#closeCheckout"),
  checkoutError: $("#checkoutError"),
  submitOrder: $("#submitOrder"),
  deliveryMethod: $("#deliveryMethod"),
  addressField: $("#addressField"),
  requestedFields: $("#requestedFields"),
  requestedDate: $("#requestedDate"),
  requestedTime: $("#requestedTime"),
  productDialog: $("#productDialog"),
  closeProduct: $("#closeProduct"),
  productImage: $("#productImage"),
  productBadge: $("#productBadge"),
  productCategory: $("#productCategory"),
  productPreparation: $("#productPreparation"),
  productLeadTime: $("#productLeadTime"),
  productTitle: $("#productTitle"),
  productDescription: $("#productDescription"),
  productHighlights: $("#productHighlights"),
  productOptions: $("#productOptions"),
  productServes: $("#productServes"),
  productPrice: $("#productPrice"),
  productIngredients: $("#productIngredients"),
  productAccompaniments: $("#productAccompaniments"),
  productAdd: $("#productAdd"),
  productFootnote: $("#productFootnote"),
  successOverlay: $("#successOverlay"),
  successTitle: $("#successTitle"),
  toast: $("#toast"),
};

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function normalize(value) {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function saveCart() {
  localStorage.setItem("sabor-da-casa-cart-v3", JSON.stringify(state.cart));
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2200);
}

function dishLabel(dish) {
  return dish.display_name || dish.dish_name;
}

function optionFor(dish, optionId) {
  const options = dish.options || [];
  return options.find((option) => option.id === optionId)
    || options[0]
    || { id: "padrao", label: "Porção padrão", serves: dish.serves || "Porção individual", price: dish.price };
}

function scrollToMenu() {
  $("#cardapio")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function setMode(mode, { scroll = false } = {}) {
  state.mode = mode;
  state.category = "Todos";
  elements.modeButtons.forEach((button) => {
    const active = button.dataset.mode === mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  elements.preorderNotice.hidden = mode !== "Encomenda";
  renderFilters();
  renderMenu();
  if (scroll) scrollToMenu();
}

function setCategory(category, { scroll = true } = {}) {
  const dish = state.menu.find((item) => item.category === category);
  if (dish) {
    state.mode = dish.order_type || "Hoje";
    state.category = category;
    elements.modeButtons.forEach((button) => {
      const active = button.dataset.mode === state.mode;
      button.classList.toggle("is-active", active);
      button.setAttribute("aria-selected", active ? "true" : "false");
    });
    elements.preorderNotice.hidden = state.mode !== "Encomenda";
    renderFilters();
    renderMenu();
  }
  if (scroll) scrollToMenu();
}

function renderFeatured() {
  const featured = state.menu.filter((dish) => dish.featured).slice(0, 4);
  elements.featuredGrid.innerHTML = featured.map((dish) => {
    const firstOption = optionFor(dish);
    return `
      <article class="featured-card" data-product="${encodeURIComponent(dish.dish_name)}" tabindex="0" role="button" aria-label="Ver ${escapeHtml(dishLabel(dish))}">
        <div class="featured-card__media">
          <img src="${escapeHtml(dish.image_url || "/brand/logo")}" alt="${escapeHtml(dishLabel(dish))}" loading="lazy" decoding="async" />
          <span>${escapeHtml(dish.badge || "Destaque")}</span>
        </div>
        <div class="featured-card__body">
          <small>${escapeHtml(dish.order_type === "Encomenda" ? "Sob encomenda" : "Disponível hoje")}</small>
          <h3>${escapeHtml(dishLabel(dish))}</h3>
          <div><span>${(dish.options || []).length > 1 ? "A partir de" : "Valor"}</span><strong>${money.format(firstOption.price)}</strong></div>
        </div>
      </article>`;
  }).join("");
}

function renderFilters() {
  const modeItems = state.menu.filter((dish) => dish.order_type === state.mode);
  const categories = ["Todos", ...new Set(modeItems.map((dish) => dish.category || "Cardápio"))];
  if (!categories.includes(state.category)) state.category = "Todos";
  elements.menuFilters.innerHTML = categories.map((category) => `
    <button class="menu-filter ${category === state.category ? "is-active" : ""}" type="button" data-category="${encodeURIComponent(category)}">
      ${escapeHtml(category)}
    </button>`).join("");
}

function matchesSearch(dish) {
  if (!state.search) return true;
  const haystack = normalize([
    dishLabel(dish),
    dish.category,
    dish.description,
    ...(dish.ingredients || []),
    ...(dish.accompaniments || []),
  ].join(" "));
  return haystack.includes(state.search);
}

function renderMenu() {
  elements.menuLoading.hidden = true;
  let visible = state.menu.filter((dish) => dish.order_type === state.mode && matchesSearch(dish));
  if (state.category !== "Todos") visible = visible.filter((dish) => dish.category === state.category);

  if (!visible.length) {
    const term = elements.menuSearch?.value.trim();
    elements.menuGrid.innerHTML = `
      <div class="menu-empty">
        <strong>${term ? `Nada encontrado para “${escapeHtml(term)}”` : "Nenhum prato nessa categoria."}</strong>
        <p>Tente outra busca, categoria ou fale com a Vanuza pelo WhatsApp.</p>
      </div>`;
    return;
  }

  elements.menuGrid.innerHTML = visible.map((dish) => {
    const firstOption = optionFor(dish);
    const pricePrefix = (dish.options || []).length > 1 ? "a partir de" : "valor";
    return `
      <article class="menu-card">
        <button class="menu-card__photo-button" type="button" data-product="${encodeURIComponent(dish.dish_name)}" aria-label="Ver detalhes de ${escapeHtml(dishLabel(dish))}">
          <img src="${escapeHtml(dish.image_url || "/brand/logo")}" alt="${escapeHtml(dishLabel(dish))}" loading="lazy" decoding="async" />
          <span class="menu-card__badge">${escapeHtml(dish.badge || "Feito em casa")}</span>
          <span class="menu-card__zoom" aria-hidden="true">↗</span>
        </button>
        <div class="menu-card__body">
          <div class="menu-card__eyeline">
            <span class="menu-card__category">${escapeHtml(dish.category || "Cardápio")}</span>
            <span class="menu-card__availability ${dish.order_type === "Encomenda" ? "is-preorder" : ""}">${dish.order_type === "Encomenda" ? "Encomenda" : "Hoje"}</span>
          </div>
          <h3>${escapeHtml(dishLabel(dish))}</h3>
          <p class="menu-card__description">${escapeHtml(dish.description || "Prato preparado com cuidado.")}</p>
          <div class="menu-card__info-row"><span>${escapeHtml(dish.lead_time || dish.preparation || "")}</span><span>${escapeHtml(dish.serves || firstOption.serves || "")}</span></div>
          <div class="menu-card__bottom">
            <div class="menu-card__price-block"><small>${pricePrefix}</small><strong>${money.format(firstOption.price)}</strong></div>
            <button class="menu-card__details" type="button" data-product="${encodeURIComponent(dish.dish_name)}">Ver prato</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function renderProductOptionSelection(dish) {
  const options = dish.options || [];
  elements.productOptions.innerHTML = options.map((option) => `
    <button type="button" class="product-option ${option.id === state.selectedOptionId ? "is-active" : ""}" data-option="${escapeHtml(option.id)}">
      <span><strong>${escapeHtml(option.label)}</strong><small>${escapeHtml(option.serves || "")}</small></span>
      <b>${money.format(option.price)}</b>
    </button>`).join("");
}

function updateProductOption(optionId) {
  const dish = state.selectedDish;
  if (!dish) return;
  const option = optionFor(dish, optionId);
  state.selectedOptionId = option.id;
  renderProductOptionSelection(dish);
  elements.productServes.textContent = option.serves || dish.serves || "Porção padrão";
  elements.productPrice.textContent = money.format(option.price);
}

function openProduct(dishName) {
  const dish = state.menu.find((item) => item.dish_name === dishName);
  if (!dish) return;

  state.selectedDish = dish;
  state.selectedOptionId = optionFor(dish).id;
  elements.productImage.src = dish.image_url || "/brand/logo";
  elements.productImage.alt = dishLabel(dish);
  elements.productBadge.textContent = dish.badge || "Feito em casa";
  elements.productCategory.textContent = dish.category || "Cardápio";
  elements.productPreparation.textContent = dish.order_type === "Encomenda" ? "Sob encomenda" : "Disponível hoje";
  elements.productLeadTime.textContent = dish.lead_time || "";
  elements.productTitle.textContent = dishLabel(dish);
  elements.productDescription.textContent = dish.description || "Prato preparado com cuidado.";
  elements.productHighlights.innerHTML = (dish.highlights || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  elements.productIngredients.innerHTML = (dish.ingredients || []).map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`).join("");

  const accompaniments = dish.accompaniments || [];
  elements.productAccompaniments.innerHTML = accompaniments.length
    ? accompaniments.map((item) => `<span>${escapeHtml(item)}</span>`).join("")
    : "<small>Consulte a Vanuza sobre acompanhamentos.</small>";

  elements.productFootnote.textContent = dish.order_type === "Encomenda"
    ? `${dish.lead_time || "Encomendar com antecedência"}. A data será escolhida no fechamento do pedido.`
    : "Disponibilidade sujeita ao cardápio do dia.";

  updateProductOption(state.selectedOptionId);
  elements.productDialog.showModal();
  document.body.classList.add("no-scroll");
}

function closeProduct() {
  if (elements.productDialog.open) elements.productDialog.close();
  state.selectedDish = null;
  state.selectedOptionId = null;
  if (!elements.cartDrawer.classList.contains("is-open") && !elements.checkoutDialog.open) document.body.classList.remove("no-scroll");
}

function addSelectedProduct() {
  const dish = state.selectedDish;
  if (!dish) return;
  addToCart(dish, optionFor(dish, state.selectedOptionId));
  closeProduct();
}

function addToCart(dish, option) {
  const key = `${dish.dish_name}::${option.id}`;
  const existing = state.cart.find((item) => item.key === key);
  if (existing) {
    existing.quantity += 1;
    existing.price = Number(option.price);
  } else {
    state.cart.push({
      key,
      name: dish.dish_name,
      label: dishLabel(dish),
      optionId: option.id,
      optionLabel: option.label,
      serves: option.serves,
      orderType: dish.order_type,
      price: Number(option.price),
      quantity: 1,
    });
  }
  saveCart();
  renderCart();
  showToast(`${dishLabel(dish)} adicionado ao pedido`);
}

function changeQuantity(key, delta) {
  const item = state.cart.find((current) => current.key === key);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) state.cart = state.cart.filter((current) => current.key !== key);
  saveCart();
  renderCart();
}

function cartHasPreorder() {
  return state.cart.some((item) => item.orderType === "Encomenda");
}

function renderCartKinds() {
  const today = state.cart.filter((item) => item.orderType === "Hoje").reduce((sum, item) => sum + item.quantity, 0);
  const preorder = state.cart.filter((item) => item.orderType === "Encomenda").reduce((sum, item) => sum + item.quantity, 0);
  const parts = [];
  if (today) parts.push(`<span>${today} item${today > 1 ? "s" : ""} de hoje</span>`);
  if (preorder) parts.push(`<span class="is-preorder">${preorder} encomenda${preorder > 1 ? "s" : ""}</span>`);
  elements.cartKinds.innerHTML = parts.join("");
}

function renderCart() {
  const count = state.cart.reduce((sum, item) => sum + item.quantity, 0);
  const total = state.cart.reduce((sum, item) => sum + item.price * item.quantity, 0);

  elements.cartCount.textContent = count;
  elements.mobileNavCount.textContent = count;
  elements.mobileNavCount.hidden = count === 0;
  elements.mobileCartCount.textContent = count;
  elements.mobileCartTotal.textContent = money.format(total);
  elements.mobileCartBar.hidden = count === 0;
  elements.cartItems.innerHTML = "";
  elements.emptyCart.hidden = count > 0;
  elements.cartSummary.hidden = count === 0;
  elements.cartTotal.textContent = money.format(total);
  renderCartKinds();

  state.cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item cart-item--upgraded";
    row.innerHTML = `
      <div>
        <span class="cart-item__kind">${escapeHtml(item.orderType === "Encomenda" ? "Encomenda" : "Hoje")}</span>
        <h4>${escapeHtml(item.label || item.name)}</h4>
        <small>${escapeHtml(item.optionLabel || "")}${item.serves ? ` · ${escapeHtml(item.serves)}` : ""}</small>
        <div class="quantity-control">
          <button type="button" aria-label="Diminuir quantidade" data-qty="-1" data-key="${encodeURIComponent(item.key)}">−</button>
          <strong>${item.quantity}</strong>
          <button type="button" aria-label="Aumentar quantidade" data-qty="1" data-key="${encodeURIComponent(item.key)}">+</button>
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
  if (!elements.productDialog.open && !elements.checkoutDialog.open) document.body.classList.remove("no-scroll");
}

function renderCheckoutKinds() {
  const hasToday = state.cart.some((item) => item.orderType === "Hoje");
  const hasPreorder = cartHasPreorder();
  const parts = [];
  if (hasToday) parts.push("<span>✓ Itens disponíveis hoje</span>");
  if (hasPreorder) parts.push('<span class="is-preorder">✦ Encomenda programada</span>');
  elements.checkoutOrderKinds.innerHTML = parts.join("");
}

function openCheckout() {
  if (!state.cart.length) return;
  closeCart();
  elements.checkoutError.hidden = true;
  renderCheckoutKinds();
  const hasPreorder = cartHasPreorder();
  elements.requestedFields.hidden = !hasPreorder;
  elements.requestedDate.required = hasPreorder;
  const today = new Date();
  elements.requestedDate.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  elements.checkoutDialog.showModal();
  document.body.classList.add("no-scroll");
}

function closeCheckout() {
  if (elements.checkoutDialog.open) elements.checkoutDialog.close();
  document.body.classList.remove("no-scroll");
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
  elements.submitOrder.innerHTML = "Registrando pedido...";

  const formData = new FormData(elements.checkoutForm);
  const payload = {
    customer_name: String(formData.get("customer_name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    delivery_method: String(formData.get("delivery_method") || "Entrega"),
    address: String(formData.get("address") || "").trim(),
    requested_date: String(formData.get("requested_date") || "").trim(),
    requested_time: String(formData.get("requested_time") || "").trim(),
    payment_method: String(formData.get("payment_method") || "Pix"),
    notes: String(formData.get("notes") || "").trim(),
    items: state.cart.map((item) => ({ dish_name: item.name, option: item.optionId, quantity: item.quantity })),
  };

  try {
    const response = await fetch("/api/orders", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    const result = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(result.detail || "Não foi possível registrar o pedido.");

    state.cart = [];
    saveCart();
    renderCart();
    elements.checkoutDialog.close();
    elements.checkoutForm.reset();
    updateDeliveryFields();
    elements.requestedFields.hidden = true;
    elements.successTitle.textContent = `Pedido #${result.order.id} recebido`;
    elements.successOverlay.hidden = false;
    setTimeout(() => { window.location.href = result.whatsapp_url; }, 1200);
  } catch (error) {
    elements.checkoutError.textContent = error.message;
    elements.checkoutError.hidden = false;
  } finally {
    elements.submitOrder.disabled = false;
    elements.submitOrder.innerHTML = 'Registrar e abrir WhatsApp <span>↗</span>';
  }
}

function reconcileCart() {
  state.cart = state.cart.map((item) => {
    const dish = state.menu.find((candidate) => candidate.dish_name === item.name);
    if (!dish) return null;
    const option = optionFor(dish, item.optionId);
    return {
      key: `${dish.dish_name}::${option.id}`,
      name: dish.dish_name,
      label: dishLabel(dish),
      optionId: option.id,
      optionLabel: option.label,
      serves: option.serves,
      orderType: dish.order_type,
      price: Number(option.price),
      quantity: Math.max(1, Number(item.quantity) || 1),
    };
  }).filter(Boolean);
  saveCart();
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
  renderFeatured();
  renderFilters();
  renderMenu();
  renderCart();
  elements.menuLoading.hidden = true;
}

elements.modeButtons.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.mode)));
elements.modeJumps.forEach((button) => button.addEventListener("click", () => setMode(button.dataset.modeJump, { scroll: true })));
elements.categoryJumps.forEach((button) => button.addEventListener("click", () => setCategory(button.dataset.categoryJump, { scroll: true })));
elements.scrollMenuButtons.forEach((button) => button.addEventListener("click", scrollToMenu));

elements.menuSearch.addEventListener("input", () => {
  state.search = normalize(elements.menuSearch.value);
  state.category = "Todos";
  renderFilters();
  renderMenu();
});

elements.featuredGrid.addEventListener("click", (event) => {
  const card = event.target.closest("[data-product]");
  if (card) openProduct(decodeURIComponent(card.dataset.product));
});
elements.featuredGrid.addEventListener("keydown", (event) => {
  if (!["Enter", " "].includes(event.key)) return;
  const card = event.target.closest("[data-product]");
  if (card) { event.preventDefault(); openProduct(decodeURIComponent(card.dataset.product)); }
});

elements.menuFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = decodeURIComponent(button.dataset.category);
  renderFilters();
  renderMenu();
});

elements.menuGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-product]");
  if (button) openProduct(decodeURIComponent(button.dataset.product));
});

elements.productOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-option]");
  if (button) updateProductOption(button.dataset.option);
});

elements.productAdd.addEventListener("click", addSelectedProduct);
elements.closeProduct.addEventListener("click", closeProduct);
elements.productDialog.addEventListener("click", (event) => { if (event.target === elements.productDialog) closeProduct(); });

elements.cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-qty]");
  if (button) changeQuantity(decodeURIComponent(button.dataset.key), Number(button.dataset.qty));
});

elements.cartButton.addEventListener("click", openCart);
elements.mobileCartNav.addEventListener("click", openCart);
elements.mobileCartBar.addEventListener("click", openCart);
elements.closeCart.addEventListener("click", closeCart);
elements.overlay.addEventListener("click", closeCart);
elements.checkoutButton.addEventListener("click", openCheckout);
elements.closeCheckout.addEventListener("click", closeCheckout);
elements.deliveryMethod.addEventListener("change", updateDeliveryFields);
elements.checkoutForm.addEventListener("submit", submitOrder);

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-and-menu]")) { closeCart(); scrollToMenu(); }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (elements.productDialog.open) closeProduct();
  else if (elements.checkoutDialog.open) closeCheckout();
  else if (elements.cartDrawer.classList.contains("is-open")) closeCart();
});

$("#year").textContent = new Date().getFullYear();
updateDeliveryFields();
renderCart();
loadMenu();
