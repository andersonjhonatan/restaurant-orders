const state = {
  token: sessionStorage.getItem("sabor-da-casa-admin-token") || "",
  orders: [],
  filter: "",
};

const $ = (selector) => document.querySelector(selector);
const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const dateTime = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" });

const els = {
  loginCard: $("#loginCard"), dashboard: $("#dashboard"), tokenForm: $("#tokenForm"), adminToken: $("#adminToken"), loginError: $("#loginError"), refreshOrders: $("#refreshOrders"), logoutButton: $("#logoutButton"), statusFilter: $("#statusFilter"), ordersLoading: $("#ordersLoading"), ordersList: $("#ordersList"), ordersEmpty: $("#ordersEmpty"), statTotal: $("#statTotal"), statNew: $("#statNew"), statPreparing: $("#statPreparing"), statDone: $("#statDone"), lastUpdated: $("#lastUpdated"), toast: $("#toast"),
};

const statuses = ["Novo", "Confirmado", "Em preparo", "Saiu para entrega", "Concluído", "Cancelado"];
function escapeHtml(value) { return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function showToast(message) { els.toast.textContent = message; els.toast.classList.add("is-visible"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2200); }
function showLogin(message = "") { els.dashboard.hidden = true; els.loginCard.hidden = false; els.loginError.hidden = !message; els.loginError.textContent = message; }
function showDashboard() { els.loginCard.hidden = true; els.dashboard.hidden = false; }

async function api(path, options = {}) {
  const response = await fetch(path, { ...options, headers: { "Content-Type": "application/json", "X-Admin-Token": state.token, ...(options.headers || {}) } });
  if (response.status === 401) { sessionStorage.removeItem("sabor-da-casa-admin-token"); state.token = ""; showLogin("Token administrativo inválido."); throw new Error("unauthorized"); }
  if (!response.ok) { const payload = await response.json().catch(() => ({})); throw new Error(payload.detail || "Não foi possível concluir a operação."); }
  return response.json();
}

async function loadOrders() {
  els.ordersLoading.hidden = false; els.ordersEmpty.hidden = true;
  try { state.orders = await api("/api/orders"); showDashboard(); renderStats(); renderOrders(); els.lastUpdated.textContent = `Atualizado às ${new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`; }
  catch (error) { if (error.message !== "unauthorized") showToast(error.message); }
  finally { els.ordersLoading.hidden = true; }
}

function renderStats() {
  els.statTotal.textContent = state.orders.length;
  els.statNew.textContent = state.orders.filter((order) => order.status === "Novo").length;
  els.statPreparing.textContent = state.orders.filter((order) => order.status === "Em preparo").length;
  els.statDone.textContent = state.orders.filter((order) => order.status === "Concluído").length;
}

function renderOrders() {
  const filtered = state.filter ? state.orders.filter((order) => order.status === state.filter) : state.orders;
  els.ordersList.innerHTML = ""; els.ordersEmpty.hidden = filtered.length > 0;

  filtered.forEach((order) => {
    const article = document.createElement("article"); article.className = "order-card";
    const createdAt = order.created_at ? dateTime.format(new Date(order.created_at)) : "";
    const items = (order.items || []).map((item) => {
      const label = item.display_name || item.dish_name;
      const option = item.option_label ? item.option_label : "";
      const kind = item.order_type ? `<small class="order-item-kind">${escapeHtml(item.order_type)}</small>` : "";
      return `<div class="order-item-row order-item-row--rich"><span>${kind}<b>${item.quantity}x ${escapeHtml(label)}</b>${option ? `<small>${escapeHtml(option)}</small>` : ""}</span><strong>${money.format(item.subtotal || 0)}</strong></div>`;
    }).join("");
    const options = statuses.map((status) => `<option value="${escapeHtml(status)}" ${status === order.status ? "selected" : ""}>${escapeHtml(status)}</option>`).join("");

    article.innerHTML = `<div class="order-card__top"><div class="order-number"><strong>Pedido #${order.id}</strong><small>${escapeHtml(createdAt)}</small></div><span class="status-pill" data-status="${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></div><div class="order-customer"><strong>${escapeHtml(order.customer_name)}</strong><span>${escapeHtml(order.phone)}</span><span>${escapeHtml(order.delivery_method)}${order.address ? ` · ${escapeHtml(order.address)}` : ""}</span><span>Pagamento: ${escapeHtml(order.payment_method)}</span></div><div class="order-items">${items}</div><div class="order-total"><span>Total</span><strong>${money.format(order.total || 0)}</strong></div>${order.notes ? `<p class="order-notes"><strong>Agendamento / obs.:</strong> ${escapeHtml(order.notes)}</p>` : ""}<div class="order-actions"><select data-status-select="${order.id}" aria-label="Status do pedido ${order.id}">${options}</select><button class="button button--primary" type="button" data-save-status="${order.id}">Salvar</button></div>`;
    els.ordersList.appendChild(article);
  });
}

async function updateStatus(orderId) {
  const select = document.querySelector(`[data-status-select="${orderId}"]`); if (!select) return;
  const button = document.querySelector(`[data-save-status="${orderId}"]`); button.disabled = true; button.textContent = "...";
  try { const updated = await api(`/api/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status: select.value }) }); const index = state.orders.findIndex((order) => order.id === updated.id); if (index >= 0) state.orders[index] = updated; renderStats(); renderOrders(); showToast(`Pedido #${orderId} atualizado`); }
  catch (error) { if (error.message !== "unauthorized") showToast(error.message); }
}

els.tokenForm.addEventListener("submit", async (event) => { event.preventDefault(); state.token = els.adminToken.value.trim(); sessionStorage.setItem("sabor-da-casa-admin-token", state.token); els.loginError.hidden = true; await loadOrders(); });
els.refreshOrders.addEventListener("click", loadOrders);
els.logoutButton.addEventListener("click", () => { state.token = ""; sessionStorage.removeItem("sabor-da-casa-admin-token"); els.adminToken.value = ""; showLogin(); });
els.statusFilter.addEventListener("change", () => { state.filter = els.statusFilter.value; renderOrders(); });
els.ordersList.addEventListener("click", (event) => { const button = event.target.closest("[data-save-status]"); if (button) updateStatus(Number(button.dataset.saveStatus)); });

if (state.token) loadOrders(); else showLogin();
