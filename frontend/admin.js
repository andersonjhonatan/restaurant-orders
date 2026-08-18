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

const statuses = ["Aguardando aprovação", "Aceito", "Recusado", "Em preparo", "Pronto para retirada", "Concluído", "Cancelado"];
function escapeHtml(value) { return String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
function showToast(message) { els.toast.textContent = message; els.toast.classList.add("is-visible"); clearTimeout(showToast.timer); showToast.timer = setTimeout(() => els.toast.classList.remove("is-visible"), 2600); }
function showLogin(message = "") { els.dashboard.hidden = true; els.loginCard.hidden = false; els.loginError.hidden = !message; els.loginError.textContent = message; }
function showDashboard() { els.loginCard.hidden = true; els.dashboard.hidden = false; }

function setupApprovalDashboard() {
  const statPendingLabel = els.statNew?.closest("article")?.querySelector("small");
  const statPendingHint = els.statNew?.closest("article")?.querySelector("span");
  const statPreparingLabel = els.statPreparing?.closest("article")?.querySelector("small");
  const statDoneLabel = els.statDone?.closest("article")?.querySelector("small");
  if (statPendingLabel) statPendingLabel.textContent = "Aguardando aprovação";
  if (statPendingHint) statPendingHint.textContent = "precisam de resposta";
  if (statPreparingLabel) statPreparingLabel.textContent = "Em preparo";
  if (statDoneLabel) statDoneLabel.textContent = "Concluídos";

  if (els.statusFilter) {
    els.statusFilter.innerHTML = '<option value="">Todas as solicitações</option>' + statuses.map((status) => `<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");
  }

  const heading = document.querySelector(".dashboard-heading p");
  if (heading) heading.textContent = "Analise cada solicitação, aceite somente quando puder preparar e avise o cliente pelo WhatsApp.";
}

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
  els.statNew.textContent = state.orders.filter((order) => ["Aguardando aprovação", "Novo"].includes(order.status)).length;
  els.statPreparing.textContent = state.orders.filter((order) => order.status === "Em preparo").length;
  els.statDone.textContent = state.orders.filter((order) => order.status === "Concluído").length;
}

function approvalActions(order) {
  if (!["Aguardando aprovação", "Novo"].includes(order.status)) return "";
  return `<div class="approval-actions"><button class="button button--primary" type="button" data-approve-order="${order.id}">✓ Aceitar e avisar</button><button class="button button--ghost" type="button" data-reject-order="${order.id}">✕ Recusar e avisar</button></div>`;
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

    article.innerHTML = `<div class="order-card__top"><div class="order-number"><strong>Solicitação #${order.id}</strong><small>${escapeHtml(createdAt)}</small></div><span class="status-pill" data-status="${escapeHtml(order.status)}">${escapeHtml(order.status)}</span></div><div class="order-customer"><strong>${escapeHtml(order.customer_name)}</strong><span>${escapeHtml(order.phone)}</span><span>Retirada no local · Rua Joaquim Deodato, 276</span><span>Referência: vizinho à casa de Deca Cabeleireiro</span><span>Pagamento: ${escapeHtml(order.payment_method)}</span></div><div class="order-items">${items}</div><div class="order-total"><span>Total previsto</span><strong>${money.format(order.total || 0)}</strong></div>${order.notes ? `<p class="order-notes"><strong>Data / horário / obs.:</strong> ${escapeHtml(order.notes)}</p>` : ""}${approvalActions(order)}<div class="order-actions"><select data-status-select="${order.id}" aria-label="Status da solicitação ${order.id}">${options}</select><button class="button button--soft" type="button" data-save-status="${order.id}">Atualizar status</button></div>`;
    els.ordersList.appendChild(article);
  });
}

function replaceOrder(updated) {
  const index = state.orders.findIndex((order) => order.id === updated.id);
  if (index >= 0) state.orders[index] = updated;
  renderStats(); renderOrders();
}

async function changeStatus(orderId, status, { notify = false } = {}) {
  const popup = notify ? window.open("about:blank", "_blank") : null;
  try {
    const result = await api(`/api/orders/${orderId}/status`, { method: "PATCH", body: JSON.stringify({ status }) });
    const updated = result.order || result;
    replaceOrder(updated);
    showToast(`Solicitação #${orderId}: ${status}`);
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
  const select = document.querySelector(`[data-status-select="${orderId}"]`); if (!select) return;
  const button = document.querySelector(`[data-save-status="${orderId}"]`); button.disabled = true; button.textContent = "...";
  const shouldNotify = ["Aceito", "Recusado", "Pronto para retirada"].includes(select.value);
  await changeStatus(orderId, select.value, { notify: shouldNotify });
}

els.tokenForm.addEventListener("submit", async (event) => { event.preventDefault(); state.token = els.adminToken.value.trim(); sessionStorage.setItem("sabor-da-casa-admin-token", state.token); els.loginError.hidden = true; await loadOrders(); });
els.refreshOrders.addEventListener("click", loadOrders);
els.logoutButton.addEventListener("click", () => { state.token = ""; sessionStorage.removeItem("sabor-da-casa-admin-token"); els.adminToken.value = ""; showLogin(); });
els.statusFilter.addEventListener("change", () => { state.filter = els.statusFilter.value; renderOrders(); });
els.ordersList.addEventListener("click", (event) => {
  const approve = event.target.closest("[data-approve-order]");
  if (approve) { changeStatus(Number(approve.dataset.approveOrder), "Aceito", { notify: true }); return; }
  const reject = event.target.closest("[data-reject-order]");
  if (reject) { changeStatus(Number(reject.dataset.rejectOrder), "Recusado", { notify: true }); return; }
  const save = event.target.closest("[data-save-status]");
  if (save) updateStatus(Number(save.dataset.saveStatus));
});

setupApprovalDashboard();
if (state.token) loadOrders(); else showLogin();
