const state = {
  orders: [],
  products: [],
  filter: "",
  authenticated: false,
  activeTab: "orders",
  editingDishName: "",
  productsLoaded: false,
};

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const els = {
  loginCard: $("#loginCard"),
  dashboard: $("#dashboard"),
  loginForm: $("#loginForm"),
  adminUsername: $("#adminUsername"),
  adminPassword: $("#adminPassword"),
  loginButton: $("#loginButton"),
  loginError: $("#loginError"),
  refreshOrders: $("#refreshOrders"),
  logoutButton: $("#logoutButton"),
  statusFilter: $("#statusFilter"),
  ordersLoading: $("#ordersLoading"),
  ordersList: $("#ordersList"),
  ordersEmpty: $("#ordersEmpty"),
  statTotal: $("#statTotal"),
  statNew: $("#statNew"),
  statPreparing: $("#statPreparing"),
  statDone: $("#statDone"),
  lastUpdated: $("#lastUpdated"),
  adminTabs: $$("[data-admin-tab]"),
  ordersPanel: $("#ordersPanel"),
  productsPanel: $("#productsPanel"),
  productsLoading: $("#productsLoading"),
  productsList: $("#productsList"),
  productsEmpty: $("#productsEmpty"),
  productsTotal: $("#productsTotal"),
  productsActive: $("#productsActive"),
  productsPreorder: $("#productsPreorder"),
  newProductButton: $("#newProductButton"),
  productAdminDialog: $("#productAdminDialog"),
  productAdminForm: $("#productAdminForm"),
  productAdminTitle: $("#productAdminTitle"),
  closeProductAdmin: $("#closeProductAdmin"),
  cancelProductAdmin: $("#cancelProductAdmin"),
  saveProductAdmin: $("#saveProductAdmin"),
  catalogFormError: $("#catalogFormError"),
  catalogDisplayName: $("#catalogDisplayName"),
  catalogDishName: $("#catalogDishName"),
  catalogCategory: $("#catalogCategory"),
  catalogOrderType: $("#catalogOrderType"),
  catalogDescription: $("#catalogDescription"),
  catalogServes: $("#catalogServes"),
  catalogPreparation: $("#catalogPreparation"),
  catalogLeadTime: $("#catalogLeadTime"),
  catalogBadge: $("#catalogBadge"),
  catalogImageUrl: $("#catalogImageUrl"),
  catalogIngredients: $("#catalogIngredients"),
  catalogHighlights: $("#catalogHighlights"),
  catalogAccompaniments: $("#catalogAccompaniments"),
  catalogFeatured: $("#catalogFeatured"),
  catalogActive: $("#catalogActive"),
  catalogAvailableStart: $("#catalogAvailableStart"),
  catalogAvailableEnd: $("#catalogAvailableEnd"),
  catalogOptions: $("#catalogOptions"),
  addCatalogOption: $("#addCatalogOption"),
  toast: $("#toast"),
};

const allStatuses = [
  "Confirmado",
  "Aguardando aprovação",
  "Aceito",
  "Recusado",
  "Em preparo",
  "Pronto para retirada",
  "Concluído",
  "Cancelado",
];

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function showToast(message) {
  els.toast.textContent = message;
  els.toast.classList.add("is-visible");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2800);
}

function showLogin(message = "") {
  state.authenticated = false;
  els.dashboard.hidden = true;
  els.loginCard.hidden = false;
  els.loginError.hidden = !message;
  els.loginError.textContent = message;
  requestAnimationFrame(() => els.adminUsername?.focus());
}

function showDashboard() {
  state.authenticated = true;
  els.loginCard.hidden = true;
  els.dashboard.hidden = false;
}

function isPreorder(order) {
  return (order.items || []).some((item) => item.order_type === "Encomenda");
}

function statusesFor(order) {
  return isPreorder(order)
    ? ["Aguardando aprovação", "Aceito", "Recusado", "Em preparo", "Pronto para retirada", "Concluído", "Cancelado"]
    : ["Confirmado", "Em preparo", "Pronto para retirada", "Concluído", "Cancelado"];
}

function setupDashboard() {
  const statPendingLabel = els.statNew?.closest("article")?.querySelector("small");
  const statPendingHint = els.statNew?.closest("article")?.querySelector("span");
  if (statPendingLabel) statPendingLabel.textContent = "Encomendas aguardando";
  if (statPendingHint) statPendingHint.textContent = "precisam de resposta";

  if (els.statusFilter) {
    els.statusFilter.innerHTML = '<option value="">Todos os pedidos e encomendas</option>' +
      allStatuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");
  }
}

async function requestJson(path, options = {}, { handleUnauthorized = true } = {}) {
  const response = await fetch(path, {
    credentials: "same-origin",
    cache: "no-store",
    ...options,
    headers: {
      "Content-Type": "application/json",
      "X-Admin-Request": "1",
      ...(options.headers || {}),
    },
  });

  const payload = await response.json().catch(() => ({}));

  if (response.status === 401 && handleUnauthorized) {
    state.authenticated = false;
    showLogin("Sua sessão expirou. Entre novamente.");
    throw new Error("unauthorized");
  }

  if (!response.ok) {
    const error = new Error(payload.detail || "Não foi possível concluir a operação.");
    error.status = response.status;
    error.retryAfter = response.headers.get("Retry-After");
    throw error;
  }

  return payload;
}

async function checkSession() {
  try {
    await requestJson("/api/admin/session", { method: "GET" }, { handleUnauthorized: false });
    state.authenticated = true;
    await loadOrders();
  } catch (_error) {
    showLogin();
  }
}

async function login(event) {
  event.preventDefault();
  els.loginError.hidden = true;
  els.loginButton.disabled = true;
  const originalText = els.loginButton.innerHTML;
  els.loginButton.textContent = "Entrando...";

  try {
    await requestJson(
      "/api/admin/login",
      {
        method: "POST",
        body: JSON.stringify({
          username: els.adminUsername.value.trim(),
          password: els.adminPassword.value,
        }),
      },
      { handleUnauthorized: false },
    );
    els.adminPassword.value = "";
    state.authenticated = true;
    state.productsLoaded = false;
    await loadOrders();
  } catch (error) {
    let message = error.message;
    if (error.status === 429) message = "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.";
    showLogin(message);
    els.adminPassword.select();
  } finally {
    els.loginButton.disabled = false;
    els.loginButton.innerHTML = originalText;
  }
}

async function logout() {
  els.logoutButton.disabled = true;
  try {
    await requestJson("/api/admin/logout", { method: "POST", body: "{}" }, { handleUnauthorized: false });
  } catch (_error) {
    // A sessão continua sendo validada no servidor; voltamos ao login mesmo se a rede falhar.
  } finally {
    state.orders = [];
    state.products = [];
    state.productsLoaded = false;
    els.adminPassword.value = "";
    els.logoutButton.disabled = false;
    showLogin();
  }
}

async function loadOrders() {
  els.ordersLoading.hidden = false;
  els.ordersEmpty.hidden = true;
  try {
    state.orders = await requestJson("/api/orders", { method: "GET" });
    showDashboard();
    renderStats();
    renderOrders();
    els.lastUpdated.textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`;
  } catch (error) {
    if (error.message !== "unauthorized") showToast(error.message);
  } finally {
    els.ordersLoading.hidden = true;
  }
}

function renderStats() {
  els.statTotal.textContent = state.orders.length;
  els.statNew.textContent = state.orders.filter((order) => isPreorder(order) && order.status === "Aguardando aprovação").length;
  els.statPreparing.textContent = state.orders.filter((order) => order.status === "Em preparo").length;
  els.statDone.textContent = state.orders.filter((order) => order.status === "Concluído").length;
}

function approvalActions(order) {
  if (!isPreorder(order) || order.status !== "Aguardando aprovação") return "";
  return `
    <div class="approval-actions">
      <button class="button button--primary" type="button" data-approve-order="${order.id}">✓ Aceitar e avisar</button>
      <button class="button button--ghost" type="button" data-reject-order="${order.id}">✕ Recusar e avisar</button>
    </div>`;
}

function renderOrders() {
  const filtered = state.filter
    ? state.orders.filter((order) => order.status === state.filter)
    : state.orders;

  els.ordersList.innerHTML = "";
  els.ordersEmpty.hidden = filtered.length > 0;

  filtered.forEach((order) => {
    const preorder = isPreorder(order);
    const article = document.createElement("article");
    article.className = "order-card";
    const createdAt = order.created_at ? dateTime.format(new Date(order.created_at)) : "";

    const items = (order.items || []).map((item) => {
      const label = item.display_name || item.dish_name;
      const option = item.option_label || "";
      const kind = item.order_type
        ? `<small class="order-item-kind">${escapeHtml(item.order_type === "Encomenda" ? "Encomenda" : "Cardápio de hoje")}</small>`
        : "";
      return `
        <div class="order-item-row order-item-row--rich">
          <span>${kind}<b>${item.quantity}x ${escapeHtml(label)}</b>${option ? `<small>${escapeHtml(option)}</small>` : ""}</span>
          <strong>${money.format(item.subtotal || 0)}</strong>
        </div>`;
    }).join("");

    const options = statusesFor(order).map((orderStatus) =>
      `<option value="${escapeHtml(orderStatus)}" ${orderStatus === order.status ? "selected" : ""}>${escapeHtml(orderStatus)}</option>`
    ).join("");

    const title = preorder ? `Encomenda #${order.id}` : `Pedido #${order.id}`;
    const noteTitle = preorder ? "Data / horário / obs.:" : "Observação:";
    const totalTitle = preorder ? "Total previsto" : "Total";

    article.innerHTML = `
      <div class="order-card__top">
        <div class="order-number"><strong>${title}</strong><small>${escapeHtml(createdAt)}</small></div>
        <span class="status-pill" data-status="${escapeHtml(order.status)}">${escapeHtml(order.status)}</span>
      </div>
      <div class="order-customer">
        <strong>${escapeHtml(order.customer_name)}</strong>
        <span>${escapeHtml(order.phone)}</span>
        <span>${preorder ? "Encomenda para retirada" : "Retirada hoje"} · Rua Joaquim Deodato, 276</span>
        <span>Referência: vizinho à casa de Deca Cabeleireiro</span>
        <span>Pagamento: ${escapeHtml(order.payment_method)}</span>
      </div>
      <div class="order-items">${items}</div>
      <div class="order-total"><span>${totalTitle}</span><strong>${money.format(order.total || 0)}</strong></div>
      ${order.notes ? `<p class="order-notes"><strong>${noteTitle}</strong> ${escapeHtml(order.notes)}</p>` : ""}
      ${approvalActions(order)}
      <div class="order-actions">
        <select data-status-select="${order.id}" aria-label="Status do pedido ${order.id}">${options}</select>
        <button class="button button--soft" type="button" data-save-status="${order.id}">Atualizar status</button>
      </div>`;

    els.ordersList.appendChild(article);
  });
}

function replaceOrder(updated) {
  const index = state.orders.findIndex((order) => order.id === updated.id);
  if (index >= 0) state.orders[index] = updated;
  renderStats();
  renderOrders();
}

async function changeStatus(orderId, newStatus, { notify = false } = {}) {
  const popup = notify ? window.open("about:blank", "_blank") : null;
  try {
    const result = await requestJson(`/api/orders/${orderId}/status`, {
      method: "PATCH",
      body: JSON.stringify({ status: newStatus }),
    });
    const updated = result.order || result;
    replaceOrder(updated);
    showToast(`${isPreorder(updated) ? "Encomenda" : "Pedido"} #${orderId}: ${newStatus}`);

    if (notify && result.customer_whatsapp_url) {
      if (popup) popup.location.href = result.customer_whatsapp_url;
      else window.location.href = result.customer_whatsapp_url;
    } else if (popup) {
      popup.close();
    }
  } catch (error) {
    if (popup) popup.close();
    if (error.message !== "unauthorized") showToast(error.message);
  }
}

async function updateStatus(orderId) {
  const select = document.querySelector(`[data-status-select="${orderId}"]`);
  if (!select) return;
  const button = document.querySelector(`[data-save-status="${orderId}"]`);
  button.disabled = true;
  const previous = button.textContent;
  button.textContent = "Atualizando...";
  const shouldNotify = ["Aceito", "Recusado", "Pronto para retirada"].includes(select.value);
  await changeStatus(orderId, select.value, { notify: shouldNotify });
  button.disabled = false;
  button.textContent = previous;
}

function setAdminTab(tab) {
  state.activeTab = tab;
  els.adminTabs.forEach((button) => button.classList.toggle("is-active", button.dataset.adminTab === tab));
  els.ordersPanel.hidden = tab !== "orders";
  els.productsPanel.hidden = tab !== "products";
  els.refreshOrders.textContent = tab === "products" ? "Atualizar cardápio" : "Atualizar";
  if (tab === "products" && !state.productsLoaded) loadProducts();
}

function normalizeIdentifier(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9\s_-]/g, "")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function optionIdentifier(value) {
  return normalizeIdentifier(value).replace(/\s+/g, "-") || `opcao-${Date.now()}`;
}

function splitList(value) {
  return String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function minProductPrice(product) {
  const prices = (product.options || []).map((option) => Number(option.price)).filter((price) => Number.isFinite(price));
  return prices.length ? Math.min(...prices) : 0;
}

function availabilityText(product) {
  const days = product.available_days || [0, 1, 2, 3, 4, 5, 6];
  const names = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
  const dayText = days.length === 7 ? "Todos os dias" : days.map((day) => names[day]).join(", ");
  const timeText = product.available_start && product.available_end
    ? ` · ${product.available_start}–${product.available_end}`
    : "";
  return `${dayText}${timeText}`;
}

async function loadProducts() {
  els.productsLoading.hidden = false;
  els.productsEmpty.hidden = true;
  try {
    const result = await requestJson("/api/admin/products", { method: "GET" });
    state.products = result.products || [];
    state.productsLoaded = true;
    renderProducts();
  } catch (error) {
    if (error.message !== "unauthorized") showToast(error.message);
  } finally {
    els.productsLoading.hidden = true;
  }
}

function renderProducts() {
  els.productsTotal.textContent = state.products.length;
  els.productsActive.textContent = state.products.filter((product) => product.active).length;
  els.productsPreorder.textContent = state.products.filter((product) => product.order_type === "Encomenda" && product.active).length;
  els.productsList.innerHTML = "";
  els.productsEmpty.hidden = state.products.length > 0;

  state.products.forEach((product, index) => {
    const article = document.createElement("article");
    article.className = `catalog-card ${product.active ? "" : "is-inactive"}`;
    article.dataset.productName = product.dish_name;
    const image = product.image_url
      ? `<img src="${escapeHtml(product.image_url)}" alt="" loading="lazy" decoding="async" />`
      : '<span class="catalog-card__placeholder" aria-hidden="true">🍽</span>';
    const optionCount = (product.options || []).length;

    article.innerHTML = `
      <div class="catalog-card__media">${image}</div>
      <div class="catalog-card__body">
        <div class="catalog-card__eyeline">
          <span>${escapeHtml(product.category)}</span>
          <span class="catalog-status ${product.active ? "is-active" : ""}">${product.active ? "Ativo" : "Arquivado"}</span>
        </div>
        <h3>${escapeHtml(product.display_name)}</h3>
        <p>${escapeHtml(product.description || "Sem descrição cadastrada.")}</p>
        <div class="catalog-card__meta">
          <span>${product.order_type === "Encomenda" ? "Encomenda" : "Disponível hoje"}</span>
          <span>${optionCount} ${optionCount === 1 ? "opção" : "opções"}</span>
          <span>${escapeHtml(availabilityText(product))}</span>
        </div>
        <div class="catalog-card__price"><small>A partir de</small><strong>${money.format(minProductPrice(product))}</strong></div>
      </div>
      <div class="catalog-card__actions">
        <button type="button" class="catalog-icon-button" data-move-product="up" data-product="${encodeURIComponent(product.dish_name)}" aria-label="Mover ${escapeHtml(product.display_name)} para cima" ${index === 0 ? "disabled" : ""}>↑</button>
        <button type="button" class="catalog-icon-button" data-move-product="down" data-product="${encodeURIComponent(product.dish_name)}" aria-label="Mover ${escapeHtml(product.display_name)} para baixo" ${index === state.products.length - 1 ? "disabled" : ""}>↓</button>
        <button type="button" class="button button--soft" data-edit-product="${encodeURIComponent(product.dish_name)}">Editar</button>
        <button type="button" class="button button--ghost" data-toggle-product="${encodeURIComponent(product.dish_name)}">${product.active ? "Arquivar" : "Ativar"}</button>
      </div>`;
    els.productsList.appendChild(article);
  });
}

function addOptionRow(option = {}) {
  const row = document.createElement("div");
  row.className = "catalog-option-row";
  row.innerHTML = `
    <label class="form-field">Nome da opção<input data-option-label required maxlength="80" value="${escapeHtml(option.label || "")}" placeholder="Ex.: Individual" /></label>
    <label class="form-field">Serve<input data-option-serves maxlength="100" value="${escapeHtml(option.serves || "")}" placeholder="Ex.: 1 a 2 pessoas" /></label>
    <label class="form-field">Preço<input data-option-price required type="number" min="0.01" max="10000" step="0.01" value="${option.price ?? ""}" placeholder="0,00" /></label>
    <input data-option-id type="hidden" value="${escapeHtml(option.id || "")}" />
    <button class="catalog-option-remove" type="button" data-remove-option aria-label="Remover esta opção">×</button>`;
  els.catalogOptions.appendChild(row);
}

function resetProductForm() {
  els.productAdminForm.reset();
  els.catalogOptions.innerHTML = "";
  els.catalogDishName.readOnly = false;
  els.catalogDishName.value = "";
  els.catalogActive.checked = true;
  els.catalogFeatured.checked = false;
  $$('input[name="available_day"]').forEach((input) => { input.checked = true; });
  state.editingDishName = "";
  els.catalogFormError.hidden = true;
  addOptionRow({ id: "individual", label: "Individual", serves: "", price: "" });
}

function openProductEditor(product = null) {
  resetProductForm();
  if (product) {
    state.editingDishName = product.dish_name;
    els.productAdminTitle.textContent = "Editar prato";
    els.catalogDishName.value = product.dish_name;
    els.catalogDishName.readOnly = true;
    els.catalogDisplayName.value = product.display_name || "";
    els.catalogCategory.value = product.category || "";
    els.catalogOrderType.value = product.order_type || "Hoje";
    els.catalogDescription.value = product.description || "";
    els.catalogServes.value = product.serves || "";
    els.catalogPreparation.value = product.preparation || "";
    els.catalogLeadTime.value = product.lead_time || "";
    els.catalogBadge.value = product.badge || "";
    els.catalogImageUrl.value = product.image_url || "";
    els.catalogIngredients.value = (product.ingredients || []).join(", ");
    els.catalogHighlights.value = (product.highlights || []).join(", ");
    els.catalogAccompaniments.value = (product.accompaniments || []).join(", ");
    els.catalogFeatured.checked = Boolean(product.featured);
    els.catalogActive.checked = Boolean(product.active);
    els.catalogAvailableStart.value = product.available_start || "";
    els.catalogAvailableEnd.value = product.available_end || "";
    const days = new Set(product.available_days || [0, 1, 2, 3, 4, 5, 6]);
    $$('input[name="available_day"]').forEach((input) => { input.checked = days.has(Number(input.value)); });
    els.catalogOptions.innerHTML = "";
    (product.options || []).forEach(addOptionRow);
    if (!(product.options || []).length) addOptionRow();
  } else {
    els.productAdminTitle.textContent = "Novo prato";
  }
  els.productAdminDialog.showModal();
  requestAnimationFrame(() => els.catalogDisplayName.focus());
}

function closeProductEditor() {
  if (els.productAdminDialog.open) els.productAdminDialog.close();
  state.editingDishName = "";
}

function catalogOptionsPayload() {
  return [...els.catalogOptions.querySelectorAll(".catalog-option-row")].map((row) => {
    const label = row.querySelector("[data-option-label]").value.trim();
    const existingId = row.querySelector("[data-option-id]").value.trim();
    return {
      id: existingId || optionIdentifier(label),
      label,
      serves: row.querySelector("[data-option-serves]").value.trim(),
      price: Number(row.querySelector("[data-option-price]").value),
    };
  });
}

function productPayload() {
  const current = state.products.find((product) => product.dish_name === state.editingDishName);
  const displayName = els.catalogDisplayName.value.trim();
  const dishName = state.editingDishName || normalizeIdentifier(els.catalogDishName.value || displayName);
  if (!els.catalogDishName.value && !state.editingDishName) els.catalogDishName.value = dishName;
  const days = $$('input[name="available_day"]:checked').map((input) => Number(input.value));

  return {
    dish_name: dishName,
    display_name: displayName,
    category: els.catalogCategory.value.trim(),
    order_type: els.catalogOrderType.value,
    description: els.catalogDescription.value.trim(),
    serves: els.catalogServes.value.trim(),
    preparation: els.catalogPreparation.value.trim(),
    lead_time: els.catalogLeadTime.value.trim(),
    badge: els.catalogBadge.value.trim(),
    featured: els.catalogFeatured.checked,
    image_url: els.catalogImageUrl.value.trim(),
    ingredients: splitList(els.catalogIngredients.value),
    restrictions: current?.restrictions || [],
    highlights: splitList(els.catalogHighlights.value),
    accompaniments: splitList(els.catalogAccompaniments.value),
    options: catalogOptionsPayload(),
    active: els.catalogActive.checked,
    sort_order: current?.sort_order ?? state.products.length * 10,
    available_days: days.length ? days : [0, 1, 2, 3, 4, 5, 6],
    available_start: els.catalogAvailableStart.value,
    available_end: els.catalogAvailableEnd.value,
  };
}

async function saveProduct(event) {
  event.preventDefault();
  els.catalogFormError.hidden = true;
  const payload = productPayload();
  if (!payload.dish_name) {
    els.catalogFormError.textContent = "Informe o nome do prato.";
    els.catalogFormError.hidden = false;
    return;
  }

  els.saveProductAdmin.disabled = true;
  const original = els.saveProductAdmin.textContent;
  els.saveProductAdmin.textContent = "Salvando...";
  try {
    const editing = Boolean(state.editingDishName);
    const path = editing
      ? `/api/admin/products/${encodeURIComponent(state.editingDishName)}`
      : "/api/admin/products";
    await requestJson(path, {
      method: editing ? "PUT" : "POST",
      body: JSON.stringify(payload),
    });
    closeProductEditor();
    state.productsLoaded = false;
    await loadProducts();
    showToast(editing ? "Prato atualizado no cardápio" : "Novo prato criado no cardápio");
  } catch (error) {
    if (error.message !== "unauthorized") {
      els.catalogFormError.textContent = error.message;
      els.catalogFormError.hidden = false;
    }
  } finally {
    els.saveProductAdmin.disabled = false;
    els.saveProductAdmin.textContent = original;
  }
}

async function toggleProduct(dishName) {
  const product = state.products.find((item) => item.dish_name === dishName);
  if (!product) return;
  try {
    await requestJson(`/api/admin/products/${encodeURIComponent(dishName)}/active`, {
      method: "PATCH",
      body: JSON.stringify({ active: !product.active }),
    });
    product.active = !product.active;
    renderProducts();
    showToast(product.active ? `${product.display_name} voltou ao cardápio` : `${product.display_name} foi arquivado`);
  } catch (error) {
    if (error.message !== "unauthorized") showToast(error.message);
  }
}

async function moveProduct(dishName, direction) {
  const index = state.products.findIndex((item) => item.dish_name === dishName);
  const target = direction === "up" ? index - 1 : index + 1;
  if (index < 0 || target < 0 || target >= state.products.length) return;

  const previous = [...state.products];
  const next = [...state.products];
  [next[index], next[target]] = [next[target], next[index]];
  state.products = next;
  renderProducts();

  try {
    const result = await requestJson("/api/admin/products/reorder", {
      method: "POST",
      body: JSON.stringify({ dish_names: next.map((item) => item.dish_name) }),
    });
    state.products = result.products || next;
    renderProducts();
  } catch (error) {
    state.products = previous;
    renderProducts();
    if (error.message !== "unauthorized") showToast(error.message);
  }
}

els.loginForm.addEventListener("submit", login);
els.refreshOrders.addEventListener("click", () => {
  if (state.activeTab === "products") loadProducts();
  else loadOrders();
});
els.logoutButton.addEventListener("click", logout);
els.statusFilter.addEventListener("change", () => {
  state.filter = els.statusFilter.value;
  renderOrders();
});

els.adminTabs.forEach((button) => button.addEventListener("click", () => setAdminTab(button.dataset.adminTab)));
els.newProductButton.addEventListener("click", () => openProductEditor());
els.closeProductAdmin.addEventListener("click", closeProductEditor);
els.cancelProductAdmin.addEventListener("click", closeProductEditor);
els.addCatalogOption.addEventListener("click", () => addOptionRow());
els.productAdminForm.addEventListener("submit", saveProduct);

els.catalogDisplayName.addEventListener("input", () => {
  if (!state.editingDishName && !els.catalogDishName.dataset.manual) {
    els.catalogDishName.value = normalizeIdentifier(els.catalogDisplayName.value);
  }
});
els.catalogDishName.addEventListener("input", () => { els.catalogDishName.dataset.manual = "1"; });

els.catalogOptions.addEventListener("click", (event) => {
  const remove = event.target.closest("[data-remove-option]");
  if (!remove) return;
  const rows = els.catalogOptions.querySelectorAll(".catalog-option-row");
  if (rows.length <= 1) {
    showToast("O prato precisa ter pelo menos uma opção de preço.");
    return;
  }
  remove.closest(".catalog-option-row").remove();
});

els.productsList.addEventListener("click", (event) => {
  const edit = event.target.closest("[data-edit-product]");
  if (edit) {
    const name = decodeURIComponent(edit.dataset.editProduct);
    const product = state.products.find((item) => item.dish_name === name);
    if (product) openProductEditor(product);
    return;
  }

  const toggle = event.target.closest("[data-toggle-product]");
  if (toggle) {
    toggleProduct(decodeURIComponent(toggle.dataset.toggleProduct));
    return;
  }

  const move = event.target.closest("[data-move-product]");
  if (move) {
    moveProduct(decodeURIComponent(move.dataset.product), move.dataset.moveProduct);
  }
});

els.ordersList.addEventListener("click", (event) => {
  const approve = event.target.closest("[data-approve-order]");
  if (approve) {
    changeStatus(Number(approve.dataset.approveOrder), "Aceito", { notify: true });
    return;
  }

  const reject = event.target.closest("[data-reject-order]");
  if (reject) {
    changeStatus(Number(reject.dataset.rejectOrder), "Recusado", { notify: true });
    return;
  }

  const save = event.target.closest("[data-save-status]");
  if (save) updateStatus(Number(save.dataset.saveStatus));
});

els.productAdminDialog.addEventListener("click", (event) => {
  if (event.target === els.productAdminDialog) closeProductEditor();
});

setupDashboard();
setAdminTab("orders");
checkSession();