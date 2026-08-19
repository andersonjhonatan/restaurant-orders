/* source: order-hardening.js */
(() => {
  const originalFetch = window.fetch.bind(window);
  let pendingBody = sessionStorage.getItem("sabor-da-casa-pending-order-body") || "";
  let pendingKey = sessionStorage.getItem("sabor-da-casa-pending-order-key") || "";

  function newKey() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    const random = Math.random().toString(36).slice(2);
    return `order-${Date.now()}-${random}`;
  }

  window.fetch = async function hardenedFetch(input, init = {}) {
    const url = typeof input === "string" ? input : input?.url || "";
    const method = String(init.method || (typeof input !== "string" ? input?.method : "GET") || "GET").toUpperCase();

    if (url !== "/api/orders" || method !== "POST") {
      return originalFetch(input, init);
    }

    const body = typeof init.body === "string" ? init.body : "";
    if (!pendingKey || pendingBody !== body) {
      pendingBody = body;
      pendingKey = newKey();
      sessionStorage.setItem("sabor-da-casa-pending-order-body", pendingBody);
      sessionStorage.setItem("sabor-da-casa-pending-order-key", pendingKey);
    }

    const headers = new Headers(init.headers || {});
    headers.set("Idempotency-Key", pendingKey);

    const response = await originalFetch(input, { ...init, headers });
    if (response.ok) {
      pendingBody = "";
      pendingKey = "";
      sessionStorage.removeItem("sabor-da-casa-pending-order-body");
      sessionStorage.removeItem("sabor-da-casa-pending-order-key");
    }
    return response;
  };
})();
;

/* source: app.js */
const CART_KEY = "sabor-da-casa-cart-v5";
const PICKUP_ADDRESS = "Rua Joaquim Deodato, 276";
const PICKUP_REFERENCE = "Vizinho à casa de Deca Cabeleireiro";

const state = {
  menu: [],
  cart: JSON.parse(localStorage.getItem(CART_KEY) || "[]"),
  mode: "Hoje",
  category: "Todos",
  search: "",
  selectedDish: null,
  selectedOptionId: null,
  productQuantity: 1,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

const elements = {
  menuGrid: $("#menuGrid"),
  menuLoading: $("#menuLoading"),
  menuFilters: $("#menuFilters"),
  menuSearch: $("#menuSearch"),
  featuredHero: $("#featuredHero"),
  featuredList: $("#featuredList"),
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
  productQty: $("#productQty"),
  productQtyMinus: $("#productQtyMinus"),
  productQtyPlus: $("#productQtyPlus"),
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
  localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
}

function showToast(message) {
  if (!elements.toast) return;
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => elements.toast.classList.remove("is-visible"), 2800);
}

function dishLabel(dish) {
  return dish.display_name || dish.dish_name;
}

function optionFor(dish, optionId) {
  const options = dish.options || [];
  return options.find((option) => option.id === optionId) || options[0] || {
    id: "padrao",
    label: "Porção padrão",
    serves: dish.serves || "Porção individual",
    price: dish.price,
  };
}

function cartOrderType() {
  return state.cart[0]?.orderType || "";
}

function cartIsPreorder() {
  return cartOrderType() === "Encomenda";
}

function scrollToMenu() {
  $("#cardapio")?.scrollIntoView({ behavior: "smooth", block: "start" });
}

function syncModeButtons() {
  elements.modeButtons.forEach((button) => {
    const active = button.dataset.mode === state.mode;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", active ? "true" : "false");
  });
  if (elements.preorderNotice) elements.preorderNotice.hidden = state.mode !== "Encomenda";
}

function setMode(mode, { scroll = false } = {}) {
  state.mode = mode;
  state.category = "Todos";
  syncModeButtons();
  renderFilters();
  renderMenu();
  if (scroll) scrollToMenu();
}

function setCategory(category, { scroll = true } = {}) {
  const dish = state.menu.find((item) => item.category === category);
  if (dish) {
    state.mode = dish.order_type || "Hoje";
    state.category = category;
    syncModeButtons();
    renderFilters();
    renderMenu();
  }
  if (scroll) scrollToMenu();
}

function renderFeatured() {
  const todayMenu = state.menu.filter((dish) => dish.order_type === "Hoje");
  const hero = todayMenu.find((dish) => dish.featured) || todayMenu[0];

  if (!hero) {
    elements.featuredHero.innerHTML = "";
    elements.featuredList.innerHTML = "";
    return;
  }

  const heroOption = optionFor(hero);
  elements.featuredHero.innerHTML = `
    <article class="featured-hero-card" data-product="${encodeURIComponent(hero.dish_name)}" tabindex="0" role="button">
      <div class="featured-hero-card__copy">
        <span>${escapeHtml(hero.badge || "Destaque de hoje")}</span>
        <h3>${escapeHtml(dishLabel(hero))}</h3>
        <p>${escapeHtml(hero.description || "Feito com carinho.")}</p>
        <strong>${money.format(heroOption.price)}</strong>
      </div>
      <div class="featured-hero-card__image">
        <img src="${escapeHtml(hero.image_url || "/brand/logo")}" alt="${escapeHtml(dishLabel(hero))}" />
      </div>
    </article>`;

  const list = todayMenu.filter((dish) => dish.dish_name !== hero.dish_name).slice(0, 5);
  elements.featuredList.innerHTML = list.map((dish) => {
    const option = optionFor(dish);
    return `
      <article class="featured-row" data-product="${encodeURIComponent(dish.dish_name)}" tabindex="0" role="button">
        <div class="featured-row__image"><img src="${escapeHtml(dish.image_url || "/brand/logo")}" alt="${escapeHtml(dishLabel(dish))}" loading="lazy" /></div>
        <div class="featured-row__copy">
          <h3>${escapeHtml(dishLabel(dish))}</h3>
          <p>${escapeHtml(dish.description || dish.category || "Prato da casa")}</p>
          <strong>${money.format(option.price)}</strong>
        </div>
        <div class="featured-row__meta"><span>♡</span><small>Disponível hoje</small></div>
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
        <p>Tente outra busca ou fale com a Vanuza.</p>
      </div>`;
    return;
  }

  elements.menuGrid.innerHTML = visible.map((dish) => {
    const firstOption = optionFor(dish);
    const preorder = dish.order_type === "Encomenda";
    return `
      <article class="menu-card">
        <button class="menu-card__photo-button" type="button" data-product="${encodeURIComponent(dish.dish_name)}">
          <img src="${escapeHtml(dish.image_url || "/brand/logo")}" alt="${escapeHtml(dishLabel(dish))}" loading="lazy" decoding="async" />
          <span class="menu-card__badge">${escapeHtml(dish.badge || "Feito em casa")}</span>
        </button>
        <div class="menu-card__body">
          <div class="menu-card__eyeline">
            <span class="menu-card__category">${escapeHtml(dish.category || "Cardápio")}</span>
            <span class="menu-card__availability ${preorder ? "is-preorder" : ""}">${preorder ? "Sob encomenda" : "Disponível hoje"}</span>
          </div>
          <h3>${escapeHtml(dishLabel(dish))}</h3>
          <p class="menu-card__description">${escapeHtml(dish.description || "Prato preparado com cuidado.")}</p>
          <div class="menu-card__bottom">
            <div class="menu-card__price-block"><strong>${money.format(firstOption.price)}</strong></div>
            <button class="menu-card__details" type="button" data-product="${encodeURIComponent(dish.dish_name)}">Ver prato</button>
          </div>
        </div>
      </article>`;
  }).join("");
}

function renderProductOptionSelection(dish) {
  elements.productOptions.innerHTML = (dish.options || []).map((option) => `
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

function updateProductQuantity(delta) {
  state.productQuantity = Math.min(20, Math.max(1, state.productQuantity + delta));
  elements.productQty.textContent = state.productQuantity;
}

function openProduct(dishName) {
  const dish = state.menu.find((item) => item.dish_name === dishName);
  if (!dish) return;

  const preorder = dish.order_type === "Encomenda";
  state.selectedDish = dish;
  state.selectedOptionId = optionFor(dish).id;
  state.productQuantity = 1;
  elements.productQty.textContent = "1";
  elements.productImage.src = dish.image_url || "/brand/logo";
  elements.productImage.alt = dishLabel(dish);
  elements.productBadge.textContent = dish.badge || "Feito em casa";
  elements.productCategory.textContent = dish.category || "Cardápio";
  elements.productPreparation.textContent = preorder ? "Sujeito à aprovação" : "Disponível hoje";
  elements.productLeadTime.textContent = preorder ? (dish.lead_time || "Consulte a data") : "Retirada hoje";
  elements.productTitle.textContent = dishLabel(dish);
  elements.productDescription.textContent = dish.description || "Prato preparado com cuidado.";
  elements.productHighlights.innerHTML = (dish.highlights || []).map((item) => `<span>${escapeHtml(item)}</span>`).join("");
  elements.productIngredients.innerHTML = (dish.ingredients || []).map((ingredient) => `<li>${escapeHtml(ingredient)}</li>`).join("");

  const accompaniments = dish.accompaniments || [];
  elements.productAccompaniments.innerHTML = accompaniments.length
    ? accompaniments.map((item) => `<span>${escapeHtml(item)}</span>`).join("")
    : "<small>Consulte a Vanuza.</small>";

  elements.productFootnote.textContent = preorder
    ? "Você escolhe a data e o horário no fechamento. A encomenda só fica confirmada depois que a Vanuza aceitar."
    : `Este prato está no cardápio de hoje e não precisa de aprovação. Retirada hoje em ${PICKUP_ADDRESS}.`;

  updateProductOption(state.selectedOptionId);
  elements.productDialog.showModal();
  document.body.classList.add("no-scroll");
}

function closeProduct() {
  if (elements.productDialog.open) elements.productDialog.close();
  state.selectedDish = null;
  state.selectedOptionId = null;
  state.productQuantity = 1;
  if (!elements.cartDrawer.classList.contains("is-open") && !elements.checkoutDialog.open) {
    document.body.classList.remove("no-scroll");
  }
}

function addSelectedProduct() {
  const dish = state.selectedDish;
  if (!dish) return;
  if (addToCart(dish, optionFor(dish, state.selectedOptionId), state.productQuantity)) {
    closeProduct();
  }
}

function addToCart(dish, option, quantity = 1) {
  const currentType = cartOrderType();
  const incomingType = dish.order_type || "Hoje";

  if (currentType && currentType !== incomingType) {
    showToast("Cardápio do dia e encomendas devem ser finalizados separadamente.");
    return false;
  }

  const key = `${dish.dish_name}::${option.id}`;
  const existing = state.cart.find((item) => item.key === key);
  if (existing) {
    existing.quantity += quantity;
    existing.price = Number(option.price);
  } else {
    state.cart.push({
      key,
      name: dish.dish_name,
      label: dishLabel(dish),
      optionId: option.id,
      optionLabel: option.label,
      serves: option.serves,
      orderType: incomingType,
      price: Number(option.price),
      quantity,
    });
  }

  saveCart();
  renderCart();
  showToast(incomingType === "Encomenda"
    ? `${dishLabel(dish)} adicionado à encomenda`
    : `${dishLabel(dish)} adicionado ao pedido de hoje`);
  return true;
}

function changeQuantity(key, delta) {
  const item = state.cart.find((current) => current.key === key);
  if (!item) return;
  item.quantity += delta;
  if (item.quantity <= 0) state.cart = state.cart.filter((current) => current.key !== key);
  saveCart();
  renderCart();
}

function renderCartKinds() {
  if (!state.cart.length) {
    elements.cartKinds.innerHTML = "";
    return;
  }
  elements.cartKinds.innerHTML = cartIsPreorder()
    ? '<span class="is-preorder">Encomenda · depende da aprovação da Vanuza</span>'
    : '<span>Cardápio de hoje · retirada hoje</span>';
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

  if (elements.checkoutButton) {
    elements.checkoutButton.textContent = cartIsPreorder()
      ? "Solicitar encomenda →"
      : "Finalizar pedido de hoje →";
  }

  renderCartKinds();

  state.cart.forEach((item) => {
    const row = document.createElement("div");
    row.className = "cart-item";
    row.innerHTML = `
      <div>
        <span class="cart-item__kind">${item.orderType === "Encomenda" ? "Encomenda" : "Disponível hoje"}</span>
        <h4>${escapeHtml(item.label || item.name)}</h4>
        <small>${escapeHtml(item.optionLabel || "")}${item.serves ? ` · ${escapeHtml(item.serves)}` : ""}</small>
        <div class="quantity-control">
          <button type="button" data-qty="-1" data-key="${encodeURIComponent(item.key)}">−</button>
          <strong>${item.quantity}</strong>
          <button type="button" data-qty="1" data-key="${encodeURIComponent(item.key)}">+</button>
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

function setupPickupOnlyUI() {
  const deliveryStrip = document.querySelector(".delivery-strip");
  if (deliveryStrip) {
    deliveryStrip.innerHTML = `<span>⌂</span><div><strong>Somente retirada no local</strong><small>${PICKUP_ADDRESS} · ${PICKUP_REFERENCE}</small></div>`;
  }

  const deliveryField = elements.deliveryMethod?.closest("label");
  if (deliveryField) deliveryField.hidden = true;
  if (elements.deliveryMethod) elements.deliveryMethod.value = "Retirada";

  if (elements.addressField) {
    elements.addressField.hidden = true;
    const input = elements.addressField.querySelector("input");
    if (input) {
      input.required = false;
      input.value = "";
    }
  }
}

function renderCheckoutKinds() {
  const preorder = cartIsPreorder();
  elements.checkoutOrderKinds.innerHTML = preorder
    ? `<span class="is-preorder">✦ Encomenda sujeita à aprovação</span><span>⌂ Retirada em ${escapeHtml(PICKUP_ADDRESS)}</span>`
    : `<span>✓ Cardápio disponível hoje</span><span>⌂ Retirada hoje em ${escapeHtml(PICKUP_ADDRESS)}</span>`;
}

function configureCheckout() {
  const preorder = cartIsPreorder();
  const intro = document.querySelector(".checkout-intro");
  const note = document.querySelector(".checkout-note");

  if (preorder) {
    elements.requestedFields.hidden = false;
    elements.requestedDate.required = true;
    elements.requestedTime.required = true;
    if (intro) intro.textContent = "Escolha a data e o horário desejados. A Vanuza vai analisar a encomenda antes de confirmar.";
    if (note) note.textContent = "A encomenda só fica confirmada depois que a Vanuza aceitar e avisar você pelo WhatsApp.";
    elements.submitOrder.textContent = "Enviar encomenda para aprovação →";
  } else {
    elements.requestedFields.hidden = true;
    elements.requestedDate.required = false;
    elements.requestedTime.required = false;
    elements.requestedDate.value = "";
    elements.requestedTime.value = "";
    if (intro) intro.textContent = `Os itens do cardápio de hoje já estão disponíveis. A retirada é hoje em ${PICKUP_ADDRESS}.`;
    if (note) note.textContent = `${PICKUP_REFERENCE}. Não é necessário escolher data ou horário.`;
    elements.submitOrder.textContent = "Confirmar pedido de hoje →";
  }
}

function openCheckout() {
  if (!state.cart.length) return;
  closeCart();
  elements.checkoutError.hidden = true;
  renderCheckoutKinds();
  configureCheckout();

  const today = new Date();
  elements.requestedDate.min = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
  elements.checkoutDialog.showModal();
  document.body.classList.add("no-scroll");
}

function closeCheckout() {
  if (elements.checkoutDialog.open) elements.checkoutDialog.close();
  document.body.classList.remove("no-scroll");
}

async function submitOrder(event) {
  event.preventDefault();
  if (!state.cart.length) return;

  const preorder = cartIsPreorder();
  elements.checkoutError.hidden = true;
  elements.submitOrder.disabled = true;
  elements.submitOrder.textContent = preorder ? "Enviando encomenda..." : "Confirmando pedido...";

  const formData = new FormData(elements.checkoutForm);
  const payload = {
    customer_name: String(formData.get("customer_name") || "").trim(),
    phone: String(formData.get("phone") || "").trim(),
    delivery_method: "Retirada",
    address: "",
    requested_date: preorder ? String(formData.get("requested_date") || "").trim() : "",
    requested_time: preorder ? String(formData.get("requested_time") || "").trim() : "",
    payment_method: String(formData.get("payment_method") || "Pix"),
    notes: String(formData.get("notes") || "").trim(),
    items: state.cart.map((item) => ({
      dish_name: item.name,
      option: item.optionId,
      quantity: item.quantity,
    })),
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
    setupPickupOnlyUI();

    const successText = document.querySelector(".success-card p");
    if (result.approval_required) {
      elements.successTitle.textContent = `Encomenda #${result.order.id} enviada`;
      if (successText) successText.textContent = "A Vanuza vai analisar a data e o horário e responder pelo WhatsApp aceitando ou recusando.";
    } else {
      elements.successTitle.textContent = `Pedido #${result.order.id} confirmado`;
      if (successText) successText.textContent = `Seu pedido é do cardápio de hoje. Retire hoje em ${PICKUP_ADDRESS}. ${PICKUP_REFERENCE}.`;
    }

    elements.successOverlay.hidden = false;
    setTimeout(() => {
      elements.successOverlay.hidden = true;
      document.body.classList.remove("no-scroll");
    }, 4600);
  } catch (error) {
    elements.checkoutError.textContent = error.message;
    elements.checkoutError.hidden = false;
  } finally {
    elements.submitOrder.disabled = false;
    configureCheckout();
  }
}

function reconcileCart() {
  const restored = state.cart.map((item) => {
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
      orderType: dish.order_type || "Hoje",
      price: Number(option.price),
      quantity: Math.max(1, Number(item.quantity) || 1),
    };
  }).filter(Boolean);

  const firstType = restored[0]?.orderType;
  state.cart = firstType ? restored.filter((item) => item.orderType === firstType) : [];
  saveCart();
}

async function loadMenu() {
  try {
    const response = await fetch("/api/menu", { cache: "no-store" });
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

function handleProductTrigger(event) {
  const card = event.target.closest("[data-product]");
  if (card) openProduct(decodeURIComponent(card.dataset.product));
}

function handleProductKey(event) {
  if (!["Enter", " "].includes(event.key)) return;
  const card = event.target.closest("[data-product]");
  if (card) {
    event.preventDefault();
    openProduct(decodeURIComponent(card.dataset.product));
  }
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

elements.featuredHero.addEventListener("click", handleProductTrigger);
elements.featuredHero.addEventListener("keydown", handleProductKey);
elements.featuredList.addEventListener("click", handleProductTrigger);
elements.featuredList.addEventListener("keydown", handleProductKey);

elements.menuFilters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-category]");
  if (!button) return;
  state.category = decodeURIComponent(button.dataset.category);
  renderFilters();
  renderMenu();
});

elements.menuGrid.addEventListener("click", handleProductTrigger);
elements.productOptions.addEventListener("click", (event) => {
  const button = event.target.closest("[data-option]");
  if (button) updateProductOption(button.dataset.option);
});
elements.productQtyMinus.addEventListener("click", () => updateProductQuantity(-1));
elements.productQtyPlus.addEventListener("click", () => updateProductQuantity(1));
elements.productAdd.addEventListener("click", addSelectedProduct);
elements.closeProduct.addEventListener("click", closeProduct);

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
elements.checkoutForm.addEventListener("submit", submitOrder);

document.addEventListener("click", (event) => {
  if (event.target.closest("[data-close-and-menu]")) {
    closeCart();
    scrollToMenu();
  }
});

document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  if (elements.productDialog.open) closeProduct();
  else if (elements.checkoutDialog.open) closeCheckout();
  else if (elements.cartDrawer.classList.contains("is-open")) closeCart();
});

$("#year").textContent = new Date().getFullYear();
setupPickupOnlyUI();
renderCart();
loadMenu();
;

/* source: cart-actions.js */
(() => {
  const cartItemsRoot = document.querySelector("#cartItems");
  const clearCartButton = document.querySelector("#clearCartButton");

  if (!cartItemsRoot || !clearCartButton) return;

  function removeCartItem(encodedKey) {
    const key = decodeURIComponent(encodedKey);
    const item = state.cart.find((current) => current.key === key);
    if (!item) return;

    state.cart = state.cart.filter((current) => current.key !== key);
    saveCart();
    renderCart();
    showToast(`${item.label || item.name} removido do carrinho`);
  }

  function clearCart() {
    if (!state.cart.length) return;

    state.cart = [];
    saveCart();
    renderCart();
    showToast("Carrinho limpo");
  }

  function buildClearConfirmation() {
    const overlay = document.createElement("div");
    overlay.id = "clearCartConfirmation";
    overlay.className = "cart-confirm-overlay";
    overlay.hidden = true;
    overlay.innerHTML = `
      <div class="cart-confirm-card" role="dialog" aria-modal="true" aria-labelledby="clearCartConfirmTitle" aria-describedby="clearCartConfirmText">
        <span class="cart-confirm-card__icon" aria-hidden="true"></span>
        <small>Sabor da Casa</small>
        <strong id="clearCartConfirmTitle">Limpar carrinho?</strong>
        <p id="clearCartConfirmText">Tem certeza que deseja limpar todos os pedidos?</p>
        <div class="cart-confirm-card__actions">
          <button type="button" class="cart-confirm-card__no" data-clear-cart-no>NÃO</button>
          <button type="button" class="cart-confirm-card__yes" data-clear-cart-yes>SIM</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    return overlay;
  }

  const confirmation = buildClearConfirmation();
  const confirmYes = confirmation.querySelector("[data-clear-cart-yes]");
  const confirmNo = confirmation.querySelector("[data-clear-cart-no]");
  let confirmationOpen = false;
  let lastOpenAt = 0;

  function openClearConfirmation() {
    if (!state.cart.length || confirmationOpen) return;

    const now = Date.now();
    if (now - lastOpenAt < 250) return;
    lastOpenAt = now;
    confirmationOpen = true;
    confirmation.hidden = false;
    requestAnimationFrame(() => confirmation.classList.add("is-open"));
    window.setTimeout(() => confirmNo.focus(), 40);
  }

  function closeClearConfirmation() {
    if (!confirmationOpen) return;
    confirmationOpen = false;
    confirmation.classList.remove("is-open");
    window.setTimeout(() => {
      confirmation.hidden = true;
      clearCartButton.focus({ preventScroll: true });
    }, 180);
  }

  function isPointInsideClearButton(x, y) {
    if (clearCartButton.hidden || !clearCartButton.offsetParent) return false;
    const rect = clearCartButton.getBoundingClientRect();
    return x >= rect.left && x <= rect.right && y >= rect.top && y <= rect.bottom;
  }

  function decorateCartItems() {
    cartItemsRoot.querySelectorAll(".cart-item").forEach((row) => {
      if (row.querySelector(".cart-item__remove")) return;

      const quantityButton = row.querySelector("[data-key]");
      const priceArea = row.querySelector(".cart-item__price");
      if (!quantityButton || !priceArea) return;

      const button = document.createElement("button");
      button.type = "button";
      button.className = "cart-item__remove";
      button.dataset.removeKey = quantityButton.dataset.key;
      button.setAttribute("aria-label", "Excluir este produto do carrinho");
      button.setAttribute("title", "Excluir produto");
      priceArea.appendChild(button);
    });
  }

  cartItemsRoot.addEventListener("click", (event) => {
    const removeButton = event.target.closest("[data-remove-key]");
    if (!removeButton) return;

    event.preventDefault();
    event.stopPropagation();
    removeCartItem(removeButton.dataset.removeKey);
  });

  /*
   * Captura o toque/clique pelas coordenadas antes dos elementos internos.
   * Assim toda a superfície visual do botão funciona, inclusive texto e ícone,
   * mesmo em navegadores móveis que entregam o evento a outro elemento.
   */
  document.addEventListener("pointerdown", (event) => {
    if (confirmationOpen || event.isPrimary === false || event.button > 0) return;
    if (!isPointInsideClearButton(event.clientX, event.clientY)) return;

    event.preventDefault();
    event.stopPropagation();
    openClearConfirmation();
  }, { capture: true, passive: false });

  /* Fallback para teclado e navegadores sem Pointer Events confiáveis. */
  clearCartButton.addEventListener("click", (event) => {
    event.preventDefault();
    event.stopPropagation();
    openClearConfirmation();
  });

  confirmNo.addEventListener("click", (event) => {
    event.preventDefault();
    closeClearConfirmation();
  });

  confirmYes.addEventListener("click", (event) => {
    event.preventDefault();
    clearCart();
    closeClearConfirmation();
  });

  confirmation.addEventListener("click", (event) => {
    if (event.target === confirmation) closeClearConfirmation();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && confirmationOpen) closeClearConfirmation();
  });

  const observer = new MutationObserver(decorateCartItems);
  observer.observe(cartItemsRoot, { childList: true, subtree: true });
  decorateCartItems();
})();
;

/* source: p1-enhancements.js */
(() => {
  const FAVORITES_KEY = "sabor-da-casa-favorites-v1";
  const cartDrawer = document.querySelector("#cartDrawer");
  const appFrame = document.querySelector(".app-frame");
  const bottomNav = document.querySelector(".bottom-nav");
  const mobileCartBar = document.querySelector("#mobileCartBar");
  const productDialog = document.querySelector("#productDialog");
  const checkoutDialog = document.querySelector("#checkoutDialog");
  const favoriteButton = document.querySelector(".product-detail__favorite");
  const menuLoading = document.querySelector("#menuLoading");
  const menuGrid = document.querySelector("#menuGrid");

  let cartReturnFocus = null;
  const dialogReturnFocus = new WeakMap();
  let diagnosingMenu = false;

  const focusableSelector = [
    "a[href]",
    "button:not([disabled])",
    "input:not([disabled])",
    "select:not([disabled])",
    "textarea:not([disabled])",
    "[tabindex]:not([tabindex='-1'])",
  ].join(",");

  function safeFavorites() {
    try {
      return new Set(JSON.parse(localStorage.getItem(FAVORITES_KEY) || "[]"));
    } catch (_error) {
      return new Set();
    }
  }

  function updateFavoriteState() {
    if (!favoriteButton) return;
    const dishName = typeof state !== "undefined" ? state.selectedDish?.dish_name : "";
    const selected = Boolean(dishName && safeFavorites().has(dishName));
    favoriteButton.setAttribute("aria-pressed", selected ? "true" : "false");
    favoriteButton.setAttribute(
      "aria-label",
      selected ? "Remover prato dos favoritos" : "Adicionar prato aos favoritos",
    );
  }

  function toggleFavorite() {
    if (!favoriteButton || typeof state === "undefined" || !state.selectedDish) return;
    const favorites = safeFavorites();
    const dishName = state.selectedDish.dish_name;
    const label = state.selectedDish.display_name || dishName;
    if (favorites.has(dishName)) {
      favorites.delete(dishName);
      if (typeof showToast === "function") showToast(`${label} removido dos favoritos`);
    } else {
      favorites.add(dishName);
      if (typeof showToast === "function") showToast(`${label} salvo nos favoritos`);
    }
    localStorage.setItem(FAVORITES_KEY, JSON.stringify([...favorites]));
    updateFavoriteState();
  }

  function setCartBackgroundInert(active) {
    [appFrame, bottomNav, mobileCartBar].forEach((element) => {
      if (!element) return;
      element.inert = active;
      if (active) element.setAttribute("aria-hidden", "true");
      else element.removeAttribute("aria-hidden");
    });
  }

  function focusablesWithin(element) {
    return [...element.querySelectorAll(focusableSelector)].filter((item) => {
      return !item.hidden && item.getAttribute("aria-hidden") !== "true" && item.offsetParent !== null;
    });
  }

  function onCartStateChanged() {
    if (!cartDrawer) return;
    const open = cartDrawer.getAttribute("aria-hidden") === "false";
    if (open) {
      if (!cartReturnFocus || !document.contains(cartReturnFocus)) {
        cartReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      }
      setCartBackgroundInert(true);
      const first = focusablesWithin(cartDrawer)[0];
      requestAnimationFrame(() => first?.focus());
    } else {
      setCartBackgroundInert(false);
      const target = cartReturnFocus;
      cartReturnFocus = null;
      if (target && document.contains(target)) requestAnimationFrame(() => target.focus());
    }
  }

  function trapCartFocus(event) {
    if (!cartDrawer || cartDrawer.getAttribute("aria-hidden") !== "false" || event.key !== "Tab") return;
    const focusable = focusablesWithin(cartDrawer);
    if (!focusable.length) return;
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  }

  function rememberDialogOpener(dialog) {
    if (!dialog) return;
    const active = document.activeElement;
    if (active instanceof HTMLElement) dialogReturnFocus.set(dialog, active);
  }

  function restoreDialogFocus(dialog) {
    const target = dialogReturnFocus.get(dialog);
    dialogReturnFocus.delete(dialog);
    if (target && document.contains(target)) requestAnimationFrame(() => target.focus());
  }

  function makeRetryCard() {
    if (!menuGrid || menuGrid.querySelector("[data-retry-menu]")) return;
    menuGrid.innerHTML = `
      <div class="menu-retry" role="status">
        <strong>Não conseguimos carregar o cardápio agora.</strong>
        <p>Confira sua conexão e tente novamente. Seu carrinho continua salvo neste aparelho.</p>
        <button class="button button--soft" type="button" data-retry-menu>Tentar novamente</button>
      </div>`;
  }

  async function diagnoseMenuEmpty() {
    if (diagnosingMenu || !menuGrid || typeof state === "undefined" || state.menu.length) return;
    diagnosingMenu = true;
    try {
      const response = await fetch("/api/menu", { cache: "no-store" });
      if (!response.ok) throw new Error("menu unavailable");
      const data = await response.json();
      if (Array.isArray(data) && data.length) {
        if (typeof loadMenu === "function") await loadMenu();
        return;
      }
      menuGrid.innerHTML = `
        <div class="menu-retry" role="status">
          <strong>Cardápio temporariamente sem itens disponíveis.</strong>
          <p>Fale com a Vanuza para consultar as próximas opções.</p>
        </div>`;
    } catch (_error) {
      makeRetryCard();
    } finally {
      diagnosingMenu = false;
    }
  }

  function labelDynamicControls() {
    document.querySelectorAll('[data-qty="-1"]').forEach((button) => {
      button.setAttribute("aria-label", "Diminuir quantidade");
    });
    document.querySelectorAll('[data-qty="1"]').forEach((button) => {
      button.setAttribute("aria-label", "Aumentar quantidade");
    });
  }

  favoriteButton?.addEventListener("click", toggleFavorite);

  cartDrawer && new MutationObserver(onCartStateChanged).observe(cartDrawer, {
    attributes: true,
    attributeFilter: ["aria-hidden"],
  });
  document.addEventListener("keydown", trapCartFocus, true);

  document.addEventListener("click", (event) => {
    if (event.target.closest("[data-product]")) rememberDialogOpener(productDialog);
    if (event.target.closest("#checkoutButton")) rememberDialogOpener(checkoutDialog);
    if (event.target.closest("[data-retry-menu]") && typeof loadMenu === "function") {
      menuGrid.innerHTML = "";
      if (menuLoading) menuLoading.hidden = false;
      loadMenu().then(() => diagnoseMenuEmpty());
    }
  }, true);

  document.addEventListener("keydown", (event) => {
    if (!["Enter", " "].includes(event.key)) return;
    if (event.target.closest("[data-product]")) rememberDialogOpener(productDialog);
  }, true);

  productDialog?.addEventListener("close", () => restoreDialogFocus(productDialog));
  checkoutDialog?.addEventListener("close", () => restoreDialogFocus(checkoutDialog));

  if (productDialog) {
    new MutationObserver(() => {
      if (productDialog.open) updateFavoriteState();
    }).observe(productDialog, { attributes: true, attributeFilter: ["open"] });
  }

  const cartItems = document.querySelector("#cartItems");
  cartItems && new MutationObserver(labelDynamicControls).observe(cartItems, {
    childList: true,
    subtree: true,
  });

  if (menuLoading) {
    new MutationObserver(() => {
      if (menuLoading.hidden) diagnoseMenuEmpty();
    }).observe(menuLoading, { attributes: true, attributeFilter: ["hidden"] });
  }

  labelDynamicControls();
  onCartStateChanged();
})();
;
