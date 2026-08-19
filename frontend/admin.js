const state = {
  orders: [],
  filter: "",
  authenticated: false,
};

const $ = (selector) => document.querySelector(selector);
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
  showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2600);
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

  const heading = document.querySelector(".dashboard-heading p");
  if (heading) {
    heading.textContent = "Pedidos do cardápio do dia já entram confirmados. Somente as encomendas precisam ser aceitas ou recusadas.";
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
    await loadOrders();
  } catch (error) {
    let message = error.message;
    if (error.status === 429) {
      message = "Muitas tentativas de acesso. Aguarde alguns minutos e tente novamente.";
    }
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
    // O cookie local é expirado pelo servidor quando possível; mesmo em falha,
    // voltamos à tela de login e uma sessão inválida não passa no backend.
  } finally {
    state.orders = [];
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

els.loginForm.addEventListener("submit", login);
els.refreshOrders.addEventListener("click", loadOrders);
els.logoutButton.addEventListener("click", logout);
els.statusFilter.addEventListener("change", () => {
  state.filter = els.statusFilter.value;
  renderOrders();
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

setupDashboard();
checkSession();
